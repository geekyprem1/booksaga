import type { LengthPreset } from '@booksaga/shared';
import { CreateSeriesForm } from '@/components/series/create-series-form';
import { getAccount } from '@/lib/account';
import { getCreditCosts } from '@/lib/credits';
import { getAdminDb } from '@/lib/supabase/admin';

export const metadata = { title: 'Create Series' };

export default async function CreateSeriesPage({
  searchParams,
}: {
  searchParams: Promise<{ idea?: string; genre?: string; parts?: string; length?: string }>;
}) {
  const { idea, genre, parts, length } = await searchParams;
  const { user, account } = await getAccount();
  const db = getAdminDb();

  const [{ data: pens }, costs] = await Promise.all([
    db.from('pen_names').select('name').eq('user_id', user.id).order('created_at'),
    getCreditCosts(['book_short', 'book_standard', 'book_full', 'enhance']),
  ]);

  const penNames = [
    ...new Set([user.name, ...(pens ?? []).map((p) => p.name)].filter((n): n is string => !!n?.trim())),
  ];

  const credits = account.isAgencyClient ? account.balances.agency : account.balances.main;
  const lengthPresets = account.entitlements.lengthPresets as LengthPreset[];

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-3xl font-extrabold">Create a series</h1>
        <p className="mt-1 text-muted-foreground">
          One idea becomes a connected, KDP-ready series. Part 1 is written first; the rest of the
          roadmap unlocks as you go.
        </p>
      </header>

      <CreateSeriesForm
        penNames={penNames}
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
