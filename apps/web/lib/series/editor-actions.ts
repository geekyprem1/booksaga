'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { AppError, bookMetadataSchema, countWords, resolveCreditSource } from '@booksaga/shared';
import { enqueueJob } from '@booksaga/core';
import { requireUser } from '@/lib/auth/session';
import { getCreditCost } from '@/lib/credits';
import { getQueues } from '@/lib/queue';
import { getAdminDb } from '@/lib/supabase/admin';
import { runAction, type ActionResult } from '@/lib/actions';
import type { SessionUser } from '@/lib/auth/session';
import type { Database } from '@booksaga/db-types';

type Db = ReturnType<typeof getAdminDb>;
type ChapterDoc = NonNullable<Database['public']['Tables']['chapters']['Insert']['content']>;

async function assertBookOwner(db: Db, bookId: string, user: SessionUser) {
  const { data: book } = await db.from('books').select('*').eq('id', bookId).maybeSingle();
  if (!book) throw new AppError('NOT_FOUND', 'Book not found.');

  const { data: series } = await db
    .from('series')
    .select('id, user_id, title, pen_name, genre, is_fiction')
    .eq('id', book.series_id)
    .maybeSingle();
  if (!series) throw new AppError('NOT_FOUND', 'Series not found.');
  if (series.user_id !== user.id && user.role !== 'admin') {
    throw new AppError('FORBIDDEN', 'This book is not yours.');
  }
  return { book, series };
}

async function assertChapterOwner(db: Db, chapterId: string, user: SessionUser) {
  const { data: chapter } = await db.from('chapters').select('*').eq('id', chapterId).maybeSingle();
  if (!chapter) throw new AppError('NOT_FOUND', 'Chapter not found.');
  const { book, series } = await assertBookOwner(db, chapter.book_id, user);
  return { chapter, book, series };
}

const saveChapterSchema = z.object({
  chapterId: z.string().uuid(),
  doc: z.unknown(),
  text: z.string().max(2_000_000),
  wordCount: z.number().int().nonnegative(),
  /** Force a version snapshot (the "Save version" action). */
  snapshot: z.boolean().default(false),
});

const SNAPSHOT_COALESCE_MS = 5 * 60 * 1000;

/** Autosave target (T3.6): content + content_text stay in sync, versions are coalesced. */
export async function saveChapterAction(
  input: z.infer<typeof saveChapterSchema>,
): Promise<ActionResult<{ savedAt: string; snapshot: boolean }>> {
  return runAction(async () => {
    const user = await requireUser();
    const data = saveChapterSchema.parse(input);
    const db = getAdminDb();
    const { chapter } = await assertChapterOwner(db, data.chapterId, user);

    const { error } = await db
      .from('chapters')
      .update({
        content: data.doc as ChapterDoc,
        content_text: data.text,
        word_count: data.wordCount,
        status: 'done',
      })
      .eq('id', chapter.id);
    if (error) throw new AppError('INTERNAL', `Could not save the chapter: ${error.message}`);

    let snapshot = false;
    const { data: latest } = await db
      .from('chapter_versions')
      .select('created_at')
      .eq('chapter_id', chapter.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const stale = !latest || Date.now() - Date.parse(latest.created_at) > SNAPSHOT_COALESCE_MS;
    if (data.snapshot || stale) {
      await db.from('chapter_versions').insert({
        chapter_id: chapter.id,
        content: data.doc as ChapterDoc,
        content_text: data.text,
        source: 'user',
        created_by: user.id,
      });
      snapshot = true;
    }

    revalidatePath(`/series/${chapter.book_id}`);
    return { savedAt: new Date().toISOString(), snapshot };
  });
}

const reorderSchema = z.object({
  bookId: z.string().uuid(),
  orderedIds: z.array(z.string().uuid()).min(1),
});

/** Drag-and-drop chapter order. Two-phase numbering avoids the (book_id, number) unique index. */
export async function reorderChaptersAction(
  input: z.infer<typeof reorderSchema>,
): Promise<ActionResult<undefined>> {
  return runAction(async () => {
    const user = await requireUser();
    const data = reorderSchema.parse(input);
    const db = getAdminDb();
    await assertBookOwner(db, data.bookId, user);

    const { data: chapters } = await db.from('chapters').select('id').eq('book_id', data.bookId);
    const known = new Set((chapters ?? []).map((c) => c.id));
    if (data.orderedIds.length !== known.size || data.orderedIds.some((id) => !known.has(id))) {
      throw new AppError('VALIDATION', 'The chapter list changed. Refresh and try again.');
    }

    for (const [index, id] of data.orderedIds.entries()) {
      await db
        .from('chapters')
        .update({ number: -(index + 1) })
        .eq('id', id);
    }
    for (const [index, id] of data.orderedIds.entries()) {
      await db
        .from('chapters')
        .update({ number: index + 1 })
        .eq('id', id);
    }

    revalidatePath(`/series/${data.bookId}`);
    return undefined;
  });
}

export async function addChapterAction(input: {
  bookId: string;
}): Promise<ActionResult<{ chapterId: string; number: number }>> {
  return runAction(async () => {
    const user = await requireUser();
    const db = getAdminDb();
    await assertBookOwner(db, input.bookId, user);

    const { data: last } = await db
      .from('chapters')
      .select('number')
      .eq('book_id', input.bookId)
      .order('number', { ascending: false })
      .limit(1)
      .maybeSingle();

    const number = (last?.number ?? 0) + 1;
    const { data, error } = await db
      .from('chapters')
      .insert({
        book_id: input.bookId,
        number,
        title: `Chapter ${number}`,
        status: 'pending',
        content: {
          type: 'doc',
          content: [{ type: 'paragraph' }],
        } as ChapterDoc,
        content_text: '',
      })
      .select('id')
      .single();
    if (error || !data)
      throw new AppError('INTERNAL', `Could not add a chapter: ${error?.message}`);

    revalidatePath(`/series/${input.bookId}`);
    return { chapterId: data.id, number };
  });
}

export async function deleteChapterAction(input: {
  chapterId: string;
}): Promise<ActionResult<undefined>> {
  return runAction(async () => {
    const user = await requireUser();
    const db = getAdminDb();
    const { chapter } = await assertChapterOwner(db, input.chapterId, user);

    const { count } = await db
      .from('chapters')
      .select('id', { count: 'exact', head: true })
      .eq('book_id', chapter.book_id);
    if ((count ?? 0) <= 1) {
      throw new AppError('VALIDATION', 'A book needs at least one chapter.');
    }

    await db.from('chapters').delete().eq('id', chapter.id);

    const { data: rest } = await db
      .from('chapters')
      .select('id')
      .eq('book_id', chapter.book_id)
      .order('number');
    for (const [index, row] of (rest ?? []).entries()) {
      await db
        .from('chapters')
        .update({ number: -(index + 1) })
        .eq('id', row.id);
    }
    for (const [index, row] of (rest ?? []).entries()) {
      await db
        .from('chapters')
        .update({ number: index + 1 })
        .eq('id', row.id);
    }

    revalidatePath(`/series/${chapter.book_id}`);
    return undefined;
  });
}

export interface ChapterVersion {
  id: string;
  source: 'ai' | 'user' | 'rewrite';
  createdAt: string;
  wordCount: number;
}

export async function listVersionsAction(input: {
  chapterId: string;
}): Promise<ActionResult<ChapterVersion[]>> {
  return runAction(
    async () => {
      const user = await requireUser();
      const db = getAdminDb();
      await assertChapterOwner(db, input.chapterId, user);

      const { data } = await db
        .from('chapter_versions')
        .select('id, source, content_text, created_at')
        .eq('chapter_id', input.chapterId)
        .order('created_at', { ascending: false })
        .limit(20);

      return (data ?? []).map((v) => ({
        id: v.id,
        source: v.source as ChapterVersion['source'],
        createdAt: v.created_at,
        wordCount: countWords(v.content_text),
      }));
    },
    { readOnly: true },
  );
}

export async function restoreVersionAction(input: {
  versionId: string;
}): Promise<ActionResult<{ chapterId: string }>> {
  return runAction(async () => {
    const user = await requireUser();
    const db = getAdminDb();

    const { data: version } = await db
      .from('chapter_versions')
      .select('id, chapter_id, content, content_text')
      .eq('id', input.versionId)
      .maybeSingle();
    if (!version) throw new AppError('NOT_FOUND', 'Version not found.');

    const { chapter } = await assertChapterOwner(db, version.chapter_id, user);

    // Keep the current state before overwriting it.
    await db.from('chapter_versions').insert({
      chapter_id: chapter.id,
      content: chapter.content as ChapterDoc,
      content_text: chapter.content_text,
      source: 'user',
      created_by: user.id,
    });

    await db
      .from('chapters')
      .update({
        content: version.content as ChapterDoc,
        content_text: version.content_text,
        word_count: countWords(version.content_text),
      })
      .eq('id', chapter.id);

    revalidatePath(`/series/${chapter.book_id}`);
    return { chapterId: chapter.id };
  });
}

const rewriteSchema = z.object({
  chapterId: z.string().uuid(),
  mode: z.enum(['rewrite', 'expand', 'shorten', 'regenerate']),
  instruction: z.string().trim().max(500).optional(),
  selection: z.string().max(60_000).optional(),
});

/** Enqueue an AI edit (1 credit). The result lands in `jobs.meta.result` for the diff preview. */
export async function rewriteChapterAction(
  input: z.infer<typeof rewriteSchema>,
): Promise<ActionResult<{ jobId: string }>> {
  return runAction(async () => {
    const user = await requireUser();
    const data = rewriteSchema.parse(input);
    const db = getAdminDb();
    const { chapter } = await assertChapterOwner(db, data.chapterId, user);

    if (!chapter.content_text.trim() && data.mode !== 'regenerate') {
      throw new AppError('VALIDATION', 'Write something first — there is nothing to edit yet.');
    }

    const action = 'rewrite' as const;
    const cost = await getCreditCost(action);
    const source = resolveCreditSource(
      { id: user.id, parentAgencyId: user.parentAgencyId },
      action,
    );

    const queued = await enqueueJob(db, getQueues(), {
      type: 'rewrite',
      refId: chapter.id,
      userId: user.id,
      source,
      action,
      amount: cost.credits,
      payload: {
        mode: data.mode,
        instruction: data.instruction ?? null,
        selection: data.selection ?? null,
      },
      reason: `AI ${data.mode} · chapter ${chapter.number}`,
    });

    return { jobId: queued.jobId };
  });
}

const applySchema = z.object({
  chapterId: z.string().uuid(),
  doc: z.unknown(),
  text: z.string().max(2_000_000),
});

export async function applyRewriteAction(
  input: z.infer<typeof applySchema>,
): Promise<ActionResult<{ wordCount: number }>> {
  return runAction(async () => {
    const user = await requireUser();
    const data = applySchema.parse(input);
    const db = getAdminDb();
    const { chapter } = await assertChapterOwner(db, data.chapterId, user);

    const wordCount = countWords(data.text);

    await db.from('chapter_versions').insert({
      chapter_id: chapter.id,
      content: chapter.content as ChapterDoc,
      content_text: chapter.content_text,
      source: 'ai',
      created_by: user.id,
    });

    await db
      .from('chapters')
      .update({
        content: data.doc as ChapterDoc,
        content_text: data.text,
        word_count: wordCount,
        status: 'done',
      })
      .eq('id', chapter.id);

    revalidatePath(`/series/${chapter.book_id}`);
    return { wordCount };
  });
}

const metadataInputSchema = bookMetadataSchema.partial().extend({
  bookId: z.string().uuid(),
});

export async function updateMetadataAction(
  input: z.infer<typeof metadataInputSchema>,
): Promise<ActionResult<undefined>> {
  return runAction(async () => {
    const user = await requireUser();
    const { bookId, ...patch } = metadataInputSchema.parse(input);
    const db = getAdminDb();
    const { book } = await assertBookOwner(db, bookId, user);

    const merged = { ...((book.metadata ?? {}) as Record<string, unknown>), ...patch };
    const parsed = bookMetadataSchema.safeParse(merged);
    if (!parsed.success) {
      throw new AppError('VALIDATION', parsed.error.issues[0]?.message ?? 'Invalid metadata.');
    }

    await db
      .from('books')
      .update({
        metadata: parsed.data,
        title: parsed.data.title,
        subtitle: parsed.data.subtitle || null,
      })
      .eq('id', book.id);

    revalidatePath(`/series/${book.series_id}`);
    return undefined;
  });
}

export async function regenerateMetadataAction(input: {
  bookId: string;
}): Promise<ActionResult<{ jobId: string }>> {
  return runAction(async () => {
    const user = await requireUser();
    const db = getAdminDb();
    const { book } = await assertBookOwner(db, input.bookId, user);

    const action = 'metadata' as const;
    const cost = await getCreditCost(action);
    const source = resolveCreditSource(
      { id: user.id, parentAgencyId: user.parentAgencyId },
      action,
    );

    const queued = await enqueueJob(db, getQueues(), {
      type: 'metadata',
      refId: book.id,
      userId: user.id,
      source,
      action,
      amount: cost.credits,
      reason: 'Regenerate metadata',
    });

    return { jobId: queued.jobId };
  });
}

export async function resolveIssueAction(input: {
  bookId: string;
  index: number;
  resolved: boolean;
}): Promise<ActionResult<undefined>> {
  return runAction(async () => {
    const user = await requireUser();
    const db = getAdminDb();
    const { book } = await assertBookOwner(db, input.bookId, user);

    const report = (book.continuity_report ?? {}) as {
      issues?: { detail: string; chapterNumber: number; resolved?: boolean }[];
    };
    const issues = report.issues ?? [];
    const issue = issues[input.index];
    if (!issue) throw new AppError('NOT_FOUND', 'Issue not found.');

    issues[input.index] = { ...issue, resolved: input.resolved };
    await db
      .from('books')
      .update({ continuity_report: { ...report, issues } })
      .eq('id', book.id);

    revalidatePath(`/series/${book.series_id}`);
    return undefined;
  });
}
