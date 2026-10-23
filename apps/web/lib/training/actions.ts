'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { AppError } from '@booksaga/shared';
import { requireUser } from '@/lib/auth/session';
import { getAdminDb } from '@/lib/supabase/admin';
import { runAction, type ActionResult } from '@/lib/actions';

const input = z.object({ lessonId: z.string().uuid(), completed: z.boolean() });

/** Mark a training lesson complete (T6.21). */
export async function setLessonProgressAction(
  raw: z.infer<typeof input>,
): Promise<ActionResult<undefined>> {
  return runAction(async () => {
    const user = await requireUser();
    const { lessonId, completed } = input.parse(raw);
    const db = getAdminDb();

    const { data: lesson } = await db
      .from('training_lessons')
      .select('id')
      .eq('id', lessonId)
      .maybeSingle();
    if (!lesson) throw new AppError('NOT_FOUND', 'Lesson not found.');

    if (completed) {
      await db
        .from('training_progress')
        .upsert({ user_id: user.id, lesson_id: lessonId }, { onConflict: 'user_id,lesson_id' });
    } else {
      await db
        .from('training_progress')
        .delete()
        .eq('user_id', user.id)
        .eq('lesson_id', lessonId);
    }

    revalidatePath('/training');
    return undefined;
  });
}
