import { expect, it, vi } from 'vitest';
import type { AiClient } from '@booksaga/ai';
import type { DbClient } from '@booksaga/core';
import type { JobRunner } from '../../lib/jobs';
import { defaultLayers } from '@booksaga/exporters';
import { aiCoverBranding, processCover } from './cover';

it('adds only the exact series and book number to AI-lettered artwork', () => {
  const layers = defaultLayers({
    seriesTitle: 'The Bennett Sisters',
    title: 'The Third Daughter',
    partNumber: 2,
    author: 'Writer',
  });
  expect(aiCoverBranding(layers).map(({ kind, text }) => ({ kind, text }))).toEqual([
    { kind: 'series', text: 'The Bennett Sisters' },
    { kind: 'part', text: 'Book 2' },
  ]);
});

it('never calls AI or locks an art direction when using a library image', async () => {
  const update = vi.fn();
  const db = {
    from(table: string) {
      const rows: Record<string, unknown> = {
        books: { id: 'book', series_id: 'series', part_number: 1, title: 'Title' },
        series: { id: 'series', user_id: 'owner', cover_style: null },
        series_bible: { data: {} },
      };
      const query = {
        select: () => query,
        eq: () => query,
        maybeSingle: async () => ({ data: rows[table], error: null }),
        update,
      };
      return query;
    },
    storage: {
      from: () => ({
        download: async () => ({ data: null, error: { message: 'fixture unavailable' } }),
      }),
    },
  } as unknown as DbClient;
  const ai = { json: vi.fn(), image: vi.fn() } as unknown as AiClient;
  const runner = { progress: vi.fn() } as unknown as JobRunner;
  await expect(
    processCover({ db, ai }, runner, {
      jobId: 'job',
      userId: 'owner',
      refId: 'book',
      sourceImagePath: 'owner/image.png',
    }),
  ).rejects.toThrow('Could not read the image');
  expect(ai.json).not.toHaveBeenCalled();
  expect(ai.image).not.toHaveBeenCalled();
  expect(update).not.toHaveBeenCalled();
});
