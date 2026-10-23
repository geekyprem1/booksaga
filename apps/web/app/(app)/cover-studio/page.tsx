import { redirect } from 'next/navigation';
import { SeriesPicker, type PickerSeries } from '@/components/series/series-picker';
import { requireUser } from '@/lib/auth/session';
import { getAdminDb } from '@/lib/supabase/admin';

export const metadata = { title: 'Cover Studio' };
export const dynamic = 'force-dynamic';

export default async function CoverStudioPage() {
  const user = await requireUser();
  const db = getAdminDb();

  const { data: rows } = await db
    .from('series')
    .select('id, title, genre, planned_books')
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .order('updated_at', { ascending: false })
    .limit(24);

  const list = rows ?? [];

  // One series? Skip the picker entirely.
  if (list.length === 1) redirect(`/series/${list[0]!.id}/covers`);

  const ids = list.map((row) => row.id);
  const { data: books } = ids.length
    ? await db.from('books').select('id, series_id, part_number, title').in('series_id', ids).order('part_number')
    : { data: [] as { id: string; series_id: string; part_number: number; title: string | null }[] };

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
    const firstWithCover = own.find((book) => coverByBook.has(book.id));
    return {
      id: row.id,
      title: row.title,
      genre: row.genre,
      parts: own.length,
      coverUrl: firstWithCover ? (coverByBook.get(firstWithCover.id) ?? null) : null,
      subtitle: `${own.length} part${own.length === 1 ? '' : 's'} planned`,
    };
  });

  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="text-3xl font-extrabold">Cover Studio</h1>
        <p className="mt-1 max-w-2xl text-muted-foreground">
          Matching covers across your whole series. Pick a series to generate, edit and set covers.
        </p>
      </header>

      <SeriesPicker series={series} actionLabel="Open covers" hrefFor={(id) => `/series/${id}/covers`} />
    </div>
  );
}
