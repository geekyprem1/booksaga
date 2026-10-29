'use server';

import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { revalidatePath } from 'next/cache';
import { writeAudit } from '@booksaga/core';
import { AppError } from '@booksaga/shared';
import { requireAdmin } from '@/lib/auth/session';
import { getAdminDb } from '@/lib/supabase/admin';
import { runAction } from '@/lib/actions';
import { sniffImage } from '@/lib/covers/sniff';

export async function saveLogo(form: FormData) {
  return runAction(async () => {
    const admin = await requireAdmin();
    const file = form.get('logo');
    if (!(file instanceof File) || !file.size || file.size > 512 * 1024)
      throw new AppError('VALIDATION', 'Choose a PNG, JPEG or WebP image up to 512 KB.');
    const buffer = Buffer.from(await file.arrayBuffer());
    if (!sniffImage(buffer)) throw new AppError('VALIDATION', 'Choose a PNG, JPEG or WebP image.');
    let image: Buffer;
    try {
      image = await sharp(buffer, { limitInputPixels: 16_000_000 })
        .resize(512, 512, { fit: 'inside', withoutEnlargement: true })
        .png()
        .toBuffer();
    } catch {
      throw new AppError('VALIDATION', 'This image could not be processed.');
    }
    const db = getAdminDb();
    const path = `logos/${randomUUID()}.png`;
    const uploaded = await db.storage
      .from('branding')
      .upload(path, image, { contentType: 'image/png' });
    if (uploaded.error) throw new Error(`Could not upload logo: ${uploaded.error.message}`);
    const url = db.storage.from('branding').getPublicUrl(path).data.publicUrl;
    const old = await db.from('app_settings').select('value').eq('key', 'app').single();
    if (old.error) throw new Error(old.error.message);
    const previous =
      old.data.value && typeof old.data.value === 'object' && !Array.isArray(old.data.value)
        ? old.data.value
        : {};
    const updated = await db
      .from('app_settings')
      .update({ value: { ...previous, logo_url: url } })
      .eq('key', 'app');
    if (updated.error) throw new Error(updated.error.message);
    await writeAudit(db, {
      actorId: admin.id,
      action: 'settings.logo.update',
      target: 'settings:app',
      meta: { path },
    });
    revalidatePath('/', 'layout');
    return { url };
  });
}
