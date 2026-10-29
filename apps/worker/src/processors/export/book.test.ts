import { expect, it, vi } from 'vitest';
import type { DbClient } from '@booksaga/core';
import type { JobRunner } from '../../lib/jobs';
import { processBookExport } from './book';

it('fails instead of notifying success when export history cannot be saved', async () => {
  const complete = vi.fn();
  const upload = vi.fn().mockResolvedValue({ error: null });
  const db = {
    from(table: string) {
      const rows: Record<string, unknown> = {
        books: { id: 'book', series_id: 'series', part_number: 1, title: 'Title', metadata: {} },
        series: {
          id: 'series',
          user_id: 'owner',
          title: 'Series',
          genre: 'Fantasy',
          planned_books: 1,
        },
        covers: null,
      };
      const query = {
        select: () => query,
        eq: () => query,
        neq: () => query,
        maybeSingle: async () => ({ data: rows[table], error: null }),
        order: async () => ({
          data:
            table === 'chapters'
              ? [{ number: 1, title: 'Chapter 1: First', content_text: 'Prose.' }]
              : [],
          error: null,
        }),
        insert: async () => ({ error: { message: 'database unavailable' } }),
      };
      return query;
    },
    storage: { from: () => ({ upload }) },
  } as unknown as DbClient;
  await expect(
    processBookExport(
      { db },
      {
        progress: vi.fn(),
        complete,
      } as unknown as JobRunner,
      {
        jobId: 'job',
        userId: 'owner',
        refId: 'book',
        formats: ['metadata'],
      },
    ),
  ).rejects.toThrow('Could not save the export history: database unavailable');
  expect(upload).toHaveBeenCalled();
  expect(complete).not.toHaveBeenCalled();
});
