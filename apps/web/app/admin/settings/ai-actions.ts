'use server';
import { revalidatePath } from 'next/cache';
import { writeAudit } from '@booksaga/core';
import { aiSettingsSchema } from '@booksaga/shared';
import { requireAdmin } from '@/lib/auth/session';
import { runAction } from '@/lib/actions';
import { getAdminDb } from '@/lib/supabase/admin';

export async function saveAiSettings(input: unknown) {
  return runAction(async () => {
    const admin = await requireAdmin();
    const value = aiSettingsSchema.parse(input);
    const db = getAdminDb();
    const previous = await db
      .from('app_settings')
      .select('value')
      .eq('key', 'ai_models')
      .maybeSingle();
    if (previous.error) throw new Error(previous.error.message);
    const saved = await db.from('app_settings').upsert({ key: 'ai_models', value });
    if (saved.error) throw new Error(saved.error.message);
    await writeAudit(db, {
      actorId: admin.id,
      action: 'settings.ai.update',
      target: 'settings:ai_models',
      meta: { before: previous.data?.value ?? null, after: value },
    });
    revalidatePath('/admin/settings');
  });
}
