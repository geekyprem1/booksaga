import { expect, it, vi } from 'vitest';
import type { AiClient } from '@booksaga/ai';
import type { DbClient } from '@booksaga/core';
import type { JobRunner } from '../../lib/jobs';
import { processCover } from './cover';

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
