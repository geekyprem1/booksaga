'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { AppError } from '@booksaga/shared';
import { enqueueJob } from '@booksaga/core';
import { requireUser } from '@/lib/auth/session';
import { getQueues } from '@/lib/queue';
import { getAdminDb } from '@/lib/supabase/admin';
import { runAction, type ActionResult } from '@/lib/actions';
import { sniffImage } from './sniff';

const MAX_BYTES = 10 * 1024 * 1024;



/** Upload an image to the user's library (T4.7). */
export async function uploadImageAction(
  formData: FormData,
): Promise<ActionResult<{ id: string; path: string }>> {
  return runAction(async () => {
    const user = await requireUser();
    const file = formData.get('file');
    if (!(file instanceof File)) throw new AppError('VALIDATION', 'No file uploaded.');
    if (file.size === 0) throw new AppError('VALIDATION', 'The file is empty.');
    if (file.size > MAX_BYTES) throw new AppError('VALIDATION', 'Images must be 10 MB or smaller.');

    const buffer = Buffer.from(await file.arrayBuffer());
    const sniffed = sniffImage(buffer);
    if (!sniffed) {
      throw new AppError('VALIDATION', 'Upload a PNG, JPEG or WebP image.');
    }

    const id = randomUUID();
    const path = `${user.id}/images/${id}.${sniffed.ext}`;
    const db = getAdminDb();

    const upload = await db.storage
      .from('uploads')
      .upload(path, buffer, { contentType: sniffed.mime, upsert: false });
    if (upload.error) {
      throw new AppError('INTERNAL', `Could not store the image: ${upload.error.message}`);
    }

    const { error } = await db.from('images').insert({
      id,
      user_id: user.id,
      path,
      source: 'upload',
    });
    if (error) throw new AppError('INTERNAL', `Could not save the image: ${error.message}`);

    revalidatePath('/series');
    return { id, path };
  });
}

const useInput = z.object({ bookId: z.string().uuid(), imageId: z.string().uuid() });

/**
 * Turn a library image into a cover. Free (no AI call): the worker only composes the text layers
 * over the author's own artwork.
 */
export async function applyLibraryImageAction(
  raw: z.infer<typeof useInput>,
): Promise<ActionResult<{ jobId: string }>> {
  return runAction(async () => {
    const user = await requireUser();
    const { bookId, imageId } = useInput.parse(raw);
    const db = getAdminDb();

    const { data: book } = await db
      .from('books')
      .select('id, series_id')
      .eq('id', bookId)
      .maybeSingle();
    if (!book) throw new AppError('NOT_FOUND', 'Book not found.');

    const { data: series } = await db
      .from('series')
      .select('id, user_id')
      .eq('id', book.series_id)
      .maybeSingle();
    if (!series || series.user_id !== user.id) {
      throw new AppError('FORBIDDEN', 'This book is not yours.');
    }

    const { data: image } = await db
      .from('images')
      .select('id, path, user_id')
      .eq('id', imageId)
      .maybeSingle();
    if (!image || image.user_id !== user.id) {
      throw new AppError('NOT_FOUND', 'Image not found.');
    }

    const queued = await enqueueJob(db, getQueues(), {
      type: 'cover',
      refId: book.id,
      userId: user.id,
      source: { ownerId: user.id, pool: 'main', actingUserId: user.id },
      action: 'cover',
      amount: 0,
      skipCredits: true,
      version: Math.floor(Date.now() / 1000),
      payload: { sourceImagePath: image.path, sourceBucket: 'uploads' },
      reason: 'Cover from library image',
    });

    revalidatePath(`/series/${series.id}/covers`);
    return { jobId: queued.jobId };
  });
}
