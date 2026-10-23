import { redirect } from 'next/navigation';
import { Gate } from '@/components/billing/gate';
import { SeriesPicker, type PickerSeries } from '@/components/series/series-picker';
import { requireUser } from '@/lib/auth/session';
import { getAdminDb } from '@/lib/supabase/admin';

export const metadata = { title: 'Audiobook Series' };
export const dynamic = 'force-dynamic';

export default async function AudiobooksPage() {
  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="text-3xl font-extrabold">Audiobook Series</h1>
        <p className="mt-1 max-w-2xl text-muted-foreground">
          Turn every part into an ACX-ready audiobook. Pick a series to narrate.
        </p>
      </header>

      <Gate
        check={{ kind: 'audiobook' }}
        feature="Audiobooks"
        planCode="oto3"
        description="Curated AI voices, chapter-by-chapter mastering and a store-ready cover."
      >
        <AudiobookPicker />
      </Gate>
    </div>
  );
}

async function AudiobookPicker() {
  const user = await requireUser();
  const db = getAdminDb();

  const { data: rows } = await db
    .from('series')
    .select('id, title, genre')
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .order('updated_at', { ascending: false })
    .limit(24);

  const list = rows ?? [];
  if (list.length === 1) redirect(`/series/${list[0]!.id}/audiobook`);

  const ids = list.map((row) => row.id);

  const [{ data: books }, { data: audiobooks }] = await Promise.all([
    ids.length
      ? db.from('books').select('id, series_id, status').in('series_id', ids)
      : Promise.resolve({ data: [] as { id: string; series_id: string; status: string }[] }),
    ids.length
      ? db.from('audiobooks').select('series_id, status').in('series_id', ids)
      : Promise.resolve({ data: [] as { series_id: string; status: string }[] }),
  ]);

  const bookIds = (books ?? []).map((book) => book.id);
  const { data: covers } = bookIds.length
    ? await db
        .from('covers')
        .select('book_id, final_path')
        .in('book_id', bookIds)
        .eq('type', 'ebook')
        .eq('is_active', true)
    : { data: [] as { book_id: string; final_path: string | null }[] };

  const coverByBook = new Map<string, string>();
  await Promise.all(
    (covers ?? []).map(async (cover) => {
      if (!cover.final_path) return;
      const { data } = await db.storage.from('covers').createSignedUrl(cover.final_path, 3600);
      if (data?.signedUrl) coverByBook.set(cover.book_id, data.signedUrl);
    }),
  );

  const series: PickerSeries[] = list.map((row) => {
    const own = (books ?? []).filter((book) => book.series_id === row.id);
    const generated = own.filter((book) => book.status === 'generated');
    const narrated = (audiobooks ?? []).filter(
      (row2) => row2.series_id === row.id && row2.status === 'ready',
    );
    const withCover = own.find((book) => coverByBook.has(book.id));

    return {
      id: row.id,
      title: row.title,
      genre: row.genre,
      parts: generated.length,
      coverUrl: withCover ? (coverByBook.get(withCover.id) ?? null) : null,
      subtitle: `${generated.length} ready to narrate · ${narrated.length} done`,
    };
  });

  return <SeriesPicker series={series} actionLabel="Open audiobooks" hrefFor={(id) => `/series/${id}/audiobook`} />;
}
