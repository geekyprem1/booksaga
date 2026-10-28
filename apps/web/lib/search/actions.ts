'use server';

import { z } from 'zod';
import { requireUser } from '@/lib/auth/session';
import { getAdminDb } from '@/lib/supabase/admin';
import { runAction, type ActionResult } from '@/lib/actions';

export interface SearchHit {
  id: string;
  label: string;
  hint?: string;
  href: string;
}

export interface SearchResults {
  series: SearchHit[];
  books: SearchHit[];
  chapters: SearchHit[];
}

const input = z.string().trim().max(120);

/** ⌘K search across the user's series, books and chapter text (T3.12). */
export async function searchAction(query: string): Promise<ActionResult<SearchResults>> {
  return runAction(async () => {
    const user = await requireUser();
    const q = input.parse(query);
    const empty: SearchResults = { series: [], books: [], chapters: [] };
    if (q.length < 2) return empty;

    const db = getAdminDb();
    const safe = q.replace(/[,()*%\\"']/g, ' ').trim();
    if (safe.length < 2) return empty;
    const like = `%${safe}%`;

    const { data: seriesRows } = await db
      .from('series')
      .select('id, title, genre')
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .or(`title.ilike.${like},idea.ilike.${like},pen_name.ilike.${like}`)
      .limit(5);

    const { data: allSeries } = await db
      .from('series')
      .select('id')
      .eq('user_id', user.id)
      .is('deleted_at', null);
    const ownedIds = (allSeries ?? []).map((s) => s.id);

    if (ownedIds.length === 0) {
      return {
        series: (seriesRows ?? []).map((s) => ({
          id: s.id,
          label: s.title,
          hint: s.genre,
          href: `/series/${s.id}`,
        })),
        books: [],
        chapters: [],
      };
    }

    const { data: bookRows } = await db
      .from('books')
      .select('id, title, part_number, series_id, series:series_id(title)')
      .in('series_id', ownedIds)
      .or(`title.ilike.${like},premise.ilike.${like}`)
      .limit(6);

    // Chapter text is the one search that could cross tenants: restrict it to the user's books
    // BEFORE the limit. Filtering after the query lets other users' matching chapters fill the
    // limit and silently crowd the caller's own results out.
    const { data: ownedBookRows } = await db
      .from('books')
      .select('id')
      .in('series_id', ownedIds);
    const ownedBookIds = (ownedBookRows ?? []).map((row) => row.id);

    const chapterRows =
      ownedBookIds.length > 0
        ? (
            await db
              .from('chapters')
              .select('id, title, number, book_id, book:book_id(id, title, series_id)')
              .in('book_id', ownedBookIds)
              .or(`title.ilike.${like},content_text.ilike.${like}`)
              .limit(8)
          ).data
        : null;

    const ownedSet = new Set(ownedIds);
    const chapters = (chapterRows ?? []).filter((row) => {
      const book = row.book as { series_id?: string } | null;
      return book?.series_id ? ownedSet.has(book.series_id) : false;
    });

    return {
      series: (seriesRows ?? []).map((s) => ({
        id: s.id,
        label: s.title,
        hint: s.genre,
        href: `/series/${s.id}`,
      })),
      books: (bookRows ?? []).map((b) => {
        const series = b.series as { title?: string } | null;
        return {
          id: b.id,
          label: b.title || `Part ${b.part_number}`,
          hint: series?.title,
          href: `/series/${b.series_id}/books/${b.id}`,
        };
      }),
      chapters: chapters.slice(0, 6).map((c) => {
        const book = c.book as { id?: string; title?: string; series_id?: string } | null;
        return {
          id: c.id,
          label: c.title || `Chapter ${c.number}`,
          hint: book?.title,
          href: `/series/${book?.series_id}/books/${book?.id}?chapter=${c.id}`,
        };
      }),
    };
  });
}
