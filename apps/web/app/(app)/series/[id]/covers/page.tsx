import { CoverStudio, type CoverBook } from '@/components/covers/cover-studio';
import { getAccount } from '@/lib/account';
import { requireUser } from '@/lib/auth/session';
import { getCreditCost } from '@/lib/credits';
import { loadSeries } from '@/lib/series/load';
import { getAdminDb } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export default async function SeriesCoversPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const { series } = await loadSeries(id, user);
  const db = getAdminDb();

  const [{ data: books }, { account }, cost] = await Promise.all([
    db
      .from('books')
      .select('id, part_number, title, status')
      .eq('series_id', series.id)
      .order('part_number'),
    getAccount(),
    getCreditCost('cover'),
  ]);

  const bookIds = (books ?? []).map((b) => b.id);

  const { data: covers } = bookIds.length
    ? await db
        .from('covers')
        .select('id, book_id, final_path, is_active, created_at')
        .in('book_id', bookIds)
        .eq('type', 'ebook')
        .order('created_at', { ascending: false })
    : { data: [] as { id: string; book_id: string; final_path: string | null; is_active: boolean; created_at: string }[] };

  const signed = new Map<string, string | null>();
  await Promise.all(
    (covers ?? []).map(async (cover) => {
      if (!cover.final_path) return;
      const { data } = await db.storage.from('covers').createSignedUrl(cover.final_path, 3600);
      signed.set(cover.id, data?.signedUrl ?? null);
    }),
  );

  const coverBooks: CoverBook[] = (books ?? []).map((book) => ({
    id: book.id,
    partNumber: book.part_number,
    title: book.title || `Part ${book.part_number}`,
    status: book.status,
    covers: (covers ?? [])
      .filter((cover) => cover.book_id === book.id)
      .map((cover) => ({
        id: cover.id,
        url: signed.get(cover.id) ?? null,
        isActive: cover.is_active,
        createdAt: cover.created_at,
      })),
  }));

  const credits = account.isAgencyClient ? account.balances.agency : account.balances.main;

  return (
    <CoverStudio
      seriesId={series.id}
      books={coverBooks}
      credits={credits}
      cost={cost.credits}
      style={series.cover_style as { artPrompt?: string; palette?: string[] } | null}
    />
  );
}
