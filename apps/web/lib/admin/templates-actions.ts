'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { AppError } from '@booksaga/shared';
import { requireAdmin } from '@/lib/auth/session';
import { getAdminDb } from '@/lib/supabase/admin';
import { runAction, type ActionResult } from '@/lib/actions';

const input = z.object({
  table: z.enum(['templates', 'dfy_ideas', 'dfy_packs']),
  id: z.string().uuid(),
  published: z.boolean(),
});

/** Publish or hide a template / DFY row (T6.10). */
export async function setContentPublishedAction(
  raw: z.infer<typeof input>,
): Promise<ActionResult<undefined>> {
  return runAction(async () => {
    await requireAdmin();
    const { table, id, published } = input.parse(raw);
    const db = getAdminDb();

    const { error } = await db.from(table).update({ is_published: published }).eq('id', id);
    if (error) throw new AppError('INTERNAL', `Could not update: ${error.message}`);

    revalidatePath('/admin/templates');
    revalidatePath('/templates');
    revalidatePath('/dfy');
    return undefined;
  });
}
