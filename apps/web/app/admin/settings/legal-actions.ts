'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { writeAudit } from '@booksaga/core';
import { requireAdmin } from '@/lib/auth/session';
import { runAction } from '@/lib/actions';
import { getAdminDb } from '@/lib/supabase/admin';

const schema = z.object({
  slug: z.enum(['terms', 'privacy', 'refund', 'ai-disclosure']),
  content: z.string().max(50000),
});

export async function saveLegalPage(input: unknown) {
  return runAction(async () => {
    const admin = await requireAdmin();
    const { slug, content } = schema.parse(input);
    const db = getAdminDb();
    const key = `legal_${slug}`;
    const { error } = await db.from('app_settings').upsert({ key, value: { content } });
    if (error) throw new Error(`Could not save legal page: ${error.message}`);
    await writeAudit(db, {
      actorId: admin.id,
      action: 'settings.update',
      target: `settings:${key}`,
      meta: { length: content.length },
    });
    revalidatePath(`/legal/${slug}`);
    revalidatePath('/admin/settings');
  });
}
