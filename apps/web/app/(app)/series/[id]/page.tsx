import type { LengthPreset } from '@booksaga/shared';
import { Roadmap, type RoadmapPart } from '@/components/series/roadmap';
import { getAccount } from '@/lib/account';
import { requireUser } from '@/lib/auth/session';
import { getCreditCosts } from '@/lib/credits';
import { loadSeries } from '@/lib/series/load';
import { getAdminDb } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export default async function SeriesRoadmapPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const { series } = await loadSeries(id, user);
  const db = getAdminDb();

  const [{ data: books }, { account }] = await Promise.all([
    db.from('books').select('*').eq('series_id', series.id).order('part_number'),
    getAccount(),
  ]);

  const bookIds = (books ?? []).map((b) => b.id);

  const [{ data: chapters }, { data: jobs }, costs] = await Promise.all([
    bookIds.length
      ? db.from('chapters').select('book_id').in('book_id', bookIds)
      : Promise.resolve({ data: [] as { book_id: string }[] }),
    bookIds.length
      ? db
          .from('jobs')
          .select('id, ref_id, status, progress, step_label')
          .in('ref_id', bookIds)
          .in('status', ['queued', 'active'])
      : Promise.resolve({
          data: [] as {
            id: string;
            ref_id: string | null;
            status: string;
            progress: number;
            step_label: string | null;
          }[],
        }),
    getCreditCosts(['book_short', 'book_standard', 'book_full']),
  ]);

  const chapterCount = new Map<string, number>();
  for (const chapter of chapters ?? []) {
    chapterCount.set(chapter.book_id, (chapterCount.get(chapter.book_id) ?? 0) + 1);
  }

  const activeJob = new Map<string, { id: string; progress: number; step_label: string | null }>();
  for (const job of jobs ?? []) {
    if (job.ref_id) {
      activeJob.set(job.ref_id, {
        id: job.id,
        progress: job.progress,
        step_label: job.step_label,
      });
    }
  }

  // Active cover thumbnail per part (T4.10).
  const { data: activeCovers } = bookIds.length
    ? await db
        .from('covers')
        .select('book_id, final_path')
        .in('book_id', bookIds)
        .eq('type', 'ebook')
        .eq('is_active', true)
    : { data: [] as { book_id: string; final_path: string | null }[] };

  const coverUrls = new Map<string, string>();
  await Promise.all(
    (activeCovers ?? []).map(async (cover) => {
      if (!cover.final_path) return;
      const { data } = await db.storage.from('covers').createSignedUrl(cover.final_path, 3600);
      if (data?.signedUrl) coverUrls.set(cover.book_id, data.signedUrl);
    }),
  );

  const parts: RoadmapPart[] = (books ?? []).map((book) => {
    const job = activeJob.get(book.id);
    return {
      id: book.id,
      partNumber: book.part_number,
      title: book.title,
      premise: book.premise,
      status: book.status as RoadmapPart['status'],
      lengthPreset: book.length_preset as LengthPreset,
      wordCount: book.word_count ?? 0,
      chapterCount: chapterCount.get(book.id) ?? 0,
      jobId: job?.id ?? null,
      jobProgress: job?.progress ?? 0,
      jobStep: job?.step_label ?? null,
      coverUrl: coverUrls.get(book.id) ?? null,
    };
  });

  const credits = account.isAgencyClient ? account.balances.agency : account.balances.main;

  return (
    <Roadmap
      seriesId={series.id}
      parts={parts}
      credits={credits}
      costs={{
        short: costs.book_short?.credits ?? 10,
        standard: costs.book_standard?.credits ?? 20,
        full: costs.book_full?.credits ?? 35,
      }}
      allowedPresets={account.entitlements.lengthPresets as LengthPreset[]}
      plannedBooks={series.planned_books}
      maxBooks={account.entitlements.maxBooksPerSeries}
    />
  );
}
