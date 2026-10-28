import Image from 'next/image';
import { PenLine } from 'lucide-react';
import type { LengthPreset } from '@booksaga/shared';
import { CreateSeriesForm } from '@/components/series/create-series-form';
import { getAccount } from '@/lib/account';
import { getCreditCosts } from '@/lib/credits';
import { getAdminDb } from '@/lib/supabase/admin';
import styles from '@/components/series/create-series.module.css';

export const metadata = { title: 'Create Series' };

export default async function CreateSeriesPage({
  searchParams,
}: {
  searchParams: Promise<{ idea?: string; genre?: string; parts?: string; length?: string }>;
}) {
  const { idea, genre, parts, length } = await searchParams;
  const { user, account } = await getAccount();
  const db = getAdminDb();

  const [{ data: pens, error: pensError }, costs, { data: pendingJob, error: jobError }] =
    await Promise.all([
      db.from('pen_names').select('name').eq('user_id', user.id).order('created_at'),
      getCreditCosts(['book_short', 'book_standard', 'book_full', 'enhance']),
      db
        .from('jobs')
        .select('id, ref_id')
        .eq('user_id', user.id)
        .eq('type', 'book')
        .in('status', ['queued', 'active'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

  if (pensError) throw new Error('Unable to load your pen names. Please reload the page.');
  if (jobError) throw new Error('Unable to recover your book generation. Please reload the page.');

  let initialGeneration: { jobId: string; seriesId: string } | null = null;
  if (pendingJob) {
    if (!pendingJob.ref_id) throw new Error('Unable to find the book being generated.');
    const { data: book, error: bookError } = await db
      .from('books')
      .select('series_id')
      .eq('id', pendingJob.ref_id)
      .maybeSingle();
    if (bookError || !book) throw new Error('Unable to recover the book being generated.');

    const { data: series, error: seriesError } = await db
      .from('series')
      .select('id')
      .eq('id', book.series_id)
      .eq('user_id', user.id)
      .maybeSingle();
    if (seriesError || !series) throw new Error('Unable to recover your series generation.');
    initialGeneration = { jobId: pendingJob.id, seriesId: series.id };
  }

  const penNames = [
    ...new Set(
      [user.name, ...(pens ?? []).map((p) => p.name)].filter((n): n is string => !!n?.trim()),
    ),
  ];

  const credits = account.isAgencyClient ? account.balances.agency : account.balances.main;
  const lengthPresets = account.entitlements.lengthPresets as LengthPreset[];

  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <Image
          src="/hero/create-series-studio.webp"
          alt=""
          fill
          sizes="(min-width: 1024px) calc(100vw - 304px), 100vw"
          loading="eager"
          className={styles.heroArtwork}
        />
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>
            <PenLine aria-hidden="true" /> The writing studio
          </p>
          <h1>Create a series</h1>
          <p>
            One idea. A world of connected books. Shape your series below—we&apos;ll write Part 1
            first, then unlock the next chapter of your roadmap.
          </p>
        </div>
      </header>

      <CreateSeriesForm
        penNames={penNames}
        initialGeneration={initialGeneration}
        credits={credits}
        costs={{
          short: costs.book_short?.credits ?? 10,
          standard: costs.book_standard?.credits ?? 20,
          full: costs.book_full?.credits ?? 35,
          enhance: costs.enhance?.credits ?? 1,
        }}
        lengthPresets={lengthPresets}
        maxBooksPerSeries={account.entitlements.maxBooksPerSeries}
        defaults={{
          idea,
          genre,
          plannedBooks: parts ? Number(parts) : undefined,
          lengthPreset: (length as LengthPreset | undefined) ?? undefined,
        }}
      />
    </div>
  );
}
