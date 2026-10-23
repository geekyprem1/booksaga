import { bibleSchema } from '@booksaga/shared';
import { BibleEditor } from '@/components/bible/bible-editor';
import { requireUser } from '@/lib/auth/session';
import { loadSeries } from '@/lib/series/load';
import { getAdminDb } from '@/lib/supabase/admin';
import type { BibleVersionRow } from '@/lib/series/bible-actions';

export const dynamic = 'force-dynamic';

export default async function SeriesBiblePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const { series } = await loadSeries(id, user);
  const db = getAdminDb();

  const [{ data: bibleRow }, { data: versionRows }] = await Promise.all([
    db.from('series_bible').select('data').eq('series_id', series.id).maybeSingle(),
    db
      .from('bible_versions')
      .select('id, version, source, created_at, diff')
      .eq('series_id', series.id)
      .order('version', { ascending: false })
      .limit(30),
  ]);

  const parsed = bibleSchema.safeParse(bibleRow?.data ?? {});
  const data = parsed.success ? parsed.data : bibleSchema.parse({});

  const versions: BibleVersionRow[] = (versionRows ?? []).map((row) => {
    const diff = (row.diff ?? {}) as {
      added?: unknown[];
      updated?: unknown[];
      conflicts?: unknown[];
    };
    return {
      id: row.id,
      version: row.version,
      source: row.source as 'ai' | 'user',
      createdAt: row.created_at,
      added: diff.added?.length ?? 0,
      updated: diff.updated?.length ?? 0,
      conflicts: diff.conflicts?.length ?? 0,
    };
  });

  return <BibleEditor seriesId={series.id} initial={data} versions={versions} />;
}
