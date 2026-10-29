'use server';

import { revalidatePath } from 'next/cache';
import { randomUUID } from 'node:crypto';
import { normalizeImage } from '@/lib/covers/normalize-image';
import { z } from 'zod';
import { AppError } from '@booksaga/shared';
import { requireUser } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { getAdminDb } from '@/lib/supabase/admin';
import { runAction, type ActionResult } from '@/lib/actions';

const nameInput = z.object({ name: z.string().trim().min(1).max(120) });

export async function updateNameAction(
  input: z.infer<typeof nameInput>,
): Promise<ActionResult<undefined>> {
  return runAction(async () => {
    const user = await requireUser();
    const { name } = nameInput.parse(input);

    const { error } = await getAdminDb().from('profiles').update({ name }).eq('id', user.id);
    if (error) throw new AppError('INTERNAL', `Could not save your name: ${error.message}`);

    revalidatePath('/profile');
    return undefined;
  });
}

export async function uploadAvatarAction(form: FormData): Promise<ActionResult<{ path: string }>> {
  return runAction(async () => {
    const user = await requireUser();
    const file = form.get('file');
    if (!(file instanceof File) || !file.size || file.size > 2 * 1024 * 1024) {
      throw new AppError('VALIDATION', 'Upload a PNG, JPEG or WebP image up to 2 MB.');
    }
    const buffer = await normalizeImage(Buffer.from(await file.arrayBuffer()), 512);
    const path = `${user.id}/avatar-${randomUUID()}.webp`;
    const db = getAdminDb();
    const upload = await db.storage
      .from('avatars')
      .upload(path, buffer, { contentType: 'image/webp', upsert: false });
    if (upload.error) throw new AppError('INTERNAL', 'Could not upload the avatar.');
    const saved = await db.from('profiles').update({ avatar_url: path }).eq('id', user.id);
    if (saved.error) {
      await db.storage.from('avatars').remove([path]);
      throw new AppError('INTERNAL', 'Could not save the avatar.');
    }
    revalidatePath('/profile');
    return { path };
  });
}

const passwordInput = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: z.string().min(8, 'Use at least 8 characters.').max(200),
});

export async function changePasswordAction(
  input: z.infer<typeof passwordInput>,
): Promise<ActionResult<undefined>> {
  return runAction(async () => {
    const user = await requireUser();
    const { currentPassword, newPassword } = passwordInput.parse(input);

    const supabase = await createClient();

    // Prove the person at the keyboard knows the current password before changing it.
    const reauth = await supabase.auth.signInWithPassword({
      email: user.email,
      password: currentPassword,
    });
    if (reauth.error) throw new AppError('VALIDATION', 'Your current password is not correct.');

    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw new AppError('INTERNAL', `Could not change the password: ${error.message}`);

    return undefined;
  });
}

const penNameInput = z.object({
  name: z.string().trim().min(1).max(120),
  bio: z.string().trim().max(1000).optional(),
});

export async function createPenNameAction(
  input: z.infer<typeof penNameInput>,
): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const user = await requireUser();
    const data = penNameInput.parse(input);

    const { data: created, error } = await getAdminDb()
      .from('pen_names')
      .insert({ user_id: user.id, name: data.name, bio: data.bio ?? null })
      .select('id')
      .single();
    if (error || !created) {
      throw new AppError(
        error?.code === '23505' ? 'CONFLICT' : 'INTERNAL',
        error?.code === '23505'
          ? 'You already have a pen name with that name.'
          : 'Could not add it.',
      );
    }

    revalidatePath('/profile');
    revalidatePath('/create-series');
    return { id: created.id };
  });
}

export async function deletePenNameAction(input: { id: string }): Promise<ActionResult<undefined>> {
  return runAction(async () => {
    const user = await requireUser();
    const { error } = await getAdminDb()
      .from('pen_names')
      .delete()
      .eq('id', input.id)
      .eq('user_id', user.id);
    if (error) throw new AppError('INTERNAL', `Could not delete it: ${error.message}`);

    revalidatePath('/profile');
    return undefined;
  });
}
