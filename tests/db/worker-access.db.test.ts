import { afterAll, describe, expect, it, vi } from 'vitest';
import type { AiClient } from '@booksaga/ai';
import type { JobRunner } from '../../apps/worker/src/lib/jobs';
import { processAudiobook } from '../../apps/worker/src/processors/audio/audiobook';
import { processBoxSet } from '../../apps/worker/src/processors/export/boxSet';
import { processBookExport } from '../../apps/worker/src/processors/export/book';
import { admin, cleanupUsers, db, grantPlan, makeUser } from './helpers';

afterAll(cleanupUsers);

describe('worker plan and ownership enforcement', () => {
  it('rejects queued premium jobs when access was revoked before execution', async () => {
    const user = await makeUser();
    await grantPlan(user.id, 'fe');
    const { data: series, error } = await admin
      .from('series')
      .insert({
        user_id: user.id,
        title: 'Worker test',
        idea: 'A test premise.',
        genre: 'Fantasy',
        pen_name: 'Author',
      })
      .select('id')
      .single();
    expect(error).toBeNull();
    if (!series) throw new Error('Missing test series');
    const { data: book, error: bookError } = await admin
      .from('books')
      .insert({
        series_id: series.id,
        part_number: 1,
        title: 'Test',
        premise: 'A story',
        status: 'generated',
        length_preset: 'short',
      })
      .select('id')
      .single();
    expect(bookError).toBeNull();
    if (!book) throw new Error('Missing test book');
    const ai = { speech: vi.fn(), json: vi.fn(), image: vi.fn() } as unknown as AiClient;
    const runner = { progress: vi.fn(), complete: vi.fn() } as unknown as JobRunner;
    await expect(
      processAudiobook({ db, ai }, runner, {
        jobId: 'job',
        userId: user.id,
        refId: book.id,
        audiobookId: 'unused',
        voice: 'af_heart',
        speed: 1,
      }),
    ).rejects.toMatchObject({ code: 'PLAN_REQUIRED' });
    await expect(
      processBoxSet({ db, ai }, runner, {
        jobId: 'job',
        userId: user.id,
        refId: series.id,
        boxSetId: 'unused',
        bookIds: [],
        title: 'Test set',
        withCover: false,
      }),
    ).rejects.toMatchObject({ code: 'PLAN_REQUIRED' });
    await expect(
      processBookExport({ db }, runner, {
        jobId: 'job',
        userId: user.id,
        refId: book.id,
        formats: ['pdf', 'wrap'],
      }),
    ).rejects.toMatchObject({ code: 'PLAN_REQUIRED' });
    expect(ai.speech).not.toHaveBeenCalled();
    expect(ai.json).not.toHaveBeenCalled();
    expect(runner.progress).not.toHaveBeenCalled();
  });

  it('does not combine another user’s books into an authorized box set', async () => {
    const owner = await makeUser();
    const stranger = await makeUser();
    await grantPlan(owner.id, 'oto1');
    const { data: series } = await admin
      .from('series')
      .insert([
        {
          user_id: owner.id,
          title: 'Own series',
          idea: 'Own idea',
          genre: 'Fantasy',
          pen_name: 'Author',
        },
        {
          user_id: stranger.id,
          title: 'Other series',
          idea: 'Other idea',
          genre: 'Fantasy',
          pen_name: 'Other',
        },
      ])
      .select('id, user_id');
    const own = series!.find((s) => s.user_id === owner.id)!;
    const foreign = series!.find((s) => s.user_id === stranger.id)!;
    const { data: books } = await admin
      .from('books')
      .insert([
        {
          series_id: own.id,
          part_number: 1,
          title: 'Own',
          premise: 'Own',
          status: 'generated',
          length_preset: 'short',
        },
        {
          series_id: foreign.id,
          part_number: 1,
          title: 'Foreign',
          premise: 'Foreign',
          status: 'generated',
          length_preset: 'short',
        },
      ])
      .select('id');
    expect(books).toHaveLength(2);
    const ai = { json: vi.fn() } as unknown as AiClient;
    await expect(
      processBoxSet({ db, ai }, { progress: vi.fn() } as unknown as JobRunner, {
        jobId: 'job',
        userId: owner.id,
        refId: own.id,
        boxSetId: 'unused',
        bookIds: books!.map((b) => b.id),
        title: 'Test set',
        withCover: false,
      }),
    ).rejects.toThrow('Pick at least two generated books');
    expect(ai.json).not.toHaveBeenCalled();
  });
});
