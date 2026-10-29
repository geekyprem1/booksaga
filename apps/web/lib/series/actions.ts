'use server';

import { revalidatePath } from 'next/cache';
import {
  AppError,
  GENRES,
  assertCan,
  bookCreditAction,
  resolveCreditSource,
} from '@booksaga/shared';
import { enqueueJob } from '@booksaga/core';
import { getAccount } from '@/lib/account';
import { requireUser } from '@/lib/auth/session';
import { getCreditCost } from '@/lib/credits';
import { getQueues } from '@/lib/queue';
import { getAdminDb } from '@/lib/supabase/admin';
import { runAction, type ActionResult } from '@/lib/actions';
import {
  createSeriesSchema,
  enhanceSchema,
  suggestionsSchemaInput,
  type CreateSeriesInput,
  type CreateSeriesResult,
  type EnhanceInput,
  type JobSnapshot,
  type SuggestionsInput,
} from './validation';

/**
 * Create the series + Part 1 row, then hand Part 1 to the worker. Credits are reserved inside
 * `enqueueJob`; if that fails (no credits, queue down) the series row is removed so the user is
 * never left with an empty shell.
 */
export async function createSeriesAction(
  input: CreateSeriesInput,
): Promise<ActionResult<CreateSeriesResult>> {
  return runAction(async () => {
    const user = await requireUser();
    const data = createSeriesSchema.parse(input);
    const { account } = await getAccount();
    const db = getAdminDb();

    const genre = GENRES.find((g) => g.id === data.genre);
    if (!genre) throw new AppError('VALIDATION', 'Unknown genre.');

    const { count } = await db
      .from('series')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .neq('status', 'archived');

    assertCan(account.entitlements, { kind: 'createSeries', activeSeriesCount: count ?? 0 });
    assertCan(account.entitlements, { kind: 'generateBook', lengthPreset: data.lengthPreset });

    const plannedBooks = Math.min(data.plannedBooks, account.entitlements.maxBooksPerSeries);

    const { data: series, error: seriesError } = await db
      .from('series')
      .insert({
        user_id: user.id,
        title: data.title,
        idea: data.idea,
        genre: genre.label,
        is_fiction: genre.isFiction,
        tone: data.tone,
        audience: data.audience,
        pen_name: data.penName,
        planned_books: plannedBooks,
        settings: data.settings,
        status: 'draft',
      })
      .select('id')
      .single();

    if (seriesError || !series) {
      throw new AppError('INTERNAL', `Could not create the series: ${seriesError?.message}`);
    }

    const { data: book, error: bookError } = await db
      .from('books')
      .insert({
        series_id: series.id,
        part_number: 1,
        title: data.bookTitle?.trim() ?? '',
        premise: data.idea.slice(0, 1000),
        length_preset: data.lengthPreset,
        status: 'ready',
      })
      .select('id')
      .single();

    if (bookError || !book) {
      await db.from('series').delete().eq('id', series.id);
      throw new AppError('INTERNAL', `Could not create the book: ${bookError?.message}`);
    }

    const action = bookCreditAction(data.lengthPreset);
    const cost = await getCreditCost(action);
    const source = resolveCreditSource(
      { id: user.id, parentAgencyId: user.parentAgencyId },
      action,
    );

    try {
      const queued = await enqueueJob(db, getQueues(), {
        type: 'book',
        refId: book.id,
        userId: user.id,
        source,
        action,
        amount: cost.credits,
        payload: { part: 1 },
        dailyBookCap: account.entitlements.dailyBookCap,
        reason: `Generate Part 1 (${data.lengthPreset})`,
      });

      revalidatePath('/dashboard');
      return { seriesId: series.id, bookId: book.id, jobId: queued.jobId };
    } catch (err) {
      await db.from('series').delete().eq('id', series.id);
      throw err;
    }
  });
}

/** "Enhance with AI" (1 credit): expands the idea, suggests titles and tone. */
export async function enhanceIdeaAction(
  input: EnhanceInput,
): Promise<ActionResult<{ jobId: string }>> {
  return runAction(async () => {
    const user = await requireUser();
    const data = enhanceSchema.parse(input);
    const { account } = await getAccount();
    if (account.entitlements.lengthPresets.length === 0) {
      throw new AppError('PLAN_REQUIRED', 'Your plan does not include AI generation yet.');
    }

    const action = 'enhance' as const;
    const cost = await getCreditCost(action);
    const source = resolveCreditSource(
      { id: user.id, parentAgencyId: user.parentAgencyId },
      action,
    );

    const queued = await enqueueJob(getAdminDb(), getQueues(), {
      type: 'enhance',
      refId: null,
      userId: user.id,
      source,
      action,
      amount: cost.credits,
      payload: data,
      reason: 'Enhance with AI',
    });

    return { jobId: queued.jobId };
  });
}

/** AI suggestions for the Create Series side panel (1 credit). */
export async function suggestIdeasAction(
  input: SuggestionsInput,
): Promise<ActionResult<{ jobId: string }>> {
  return runAction(async () => {
    const user = await requireUser();
    const data = suggestionsSchemaInput.parse(input);
    const action = 'enhance' as const;
    const cost = await getCreditCost(action);
    const source = resolveCreditSource(
      { id: user.id, parentAgencyId: user.parentAgencyId },
      action,
    );

    const queued = await enqueueJob(getAdminDb(), getQueues(), {
      type: 'suggestions',
      refId: null,
      userId: user.id,
      source,
      action,
      amount: cost.credits,
      payload: data,
      reason: 'AI suggestions',
    });

    return { jobId: queued.jobId };
  });
}

/** Polling fallback for the live-progress modal (Realtime is the fast path). */
export async function getJobAction(jobId: string): Promise<ActionResult<JobSnapshot>> {
  return runAction(
    async () => {
      const user = await requireUser();
      const { data, error } = await getAdminDb()
        .from('jobs')
        .select(
          'id, user_id, type, created_at, started_at, heartbeat_at, status, progress, step_label, error, ref_id, meta',
        )
        .eq('id', jobId)
        .maybeSingle();

      if (error) throw new AppError('INTERNAL', `Could not load the job: ${error.message}`);
      if (!data) throw new AppError('NOT_FOUND', 'Job not found.');
      if (data.user_id !== user.id && user.role !== 'admin') {
        throw new AppError('FORBIDDEN', 'You cannot see this job.');
      }

      return {
        id: data.id,
        type: data.type,
        createdAt: data.created_at,
        startedAt: data.started_at,
        heartbeatAt: data.heartbeat_at,
        status: data.status as JobSnapshot['status'],
        progress: data.progress,
        stepLabel: data.step_label,
        error: data.error,
        refId: data.ref_id,
        meta: (data.meta ?? {}) as Record<string, unknown>,
      };
    },
    { readOnly: true },
  );
}
