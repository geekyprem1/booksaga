import { SeriesSettingsForm } from '@/components/series/series-settings-form';
import { getAccount } from '@/lib/account';
import { requireUser } from '@/lib/auth/session';
import { loadSeries } from '@/lib/series/load';
import { seriesSettingsSchema } from '@/lib/series/validation';
import { getAdminDb } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export default async function SeriesSettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const { series } = await loadSeries(id, user);
  const db = getAdminDb();

  const [{ count }, { account }] = await Promise.all([
    db
      .from('books')
      .select('id', { count: 'exact', head: true })
      .eq('series_id', series.id)
      .eq('status', 'generated'),
    getAccount(),
  ]);

  const settings = seriesSettingsSchema.parse(series.settings ?? {});

  return (
    <SeriesSettingsForm
      seriesId={series.id}
      status={series.status}
      initial={{
        title: series.title,
        penName: series.pen_name,
        tone: series.tone,
        plannedBooks: series.planned_books,
        settings,
      }}
      generatedParts={count ?? 0}
      maxBooks={account.entitlements.maxBooksPerSeries}
    />
  );
}
