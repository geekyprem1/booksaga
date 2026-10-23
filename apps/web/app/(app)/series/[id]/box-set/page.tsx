import { BoxSetBuilder, type BoxSetBook, type BoxSetRow } from '@/components/boxset/box-set-builder';
import { Gate } from '@/components/billing/gate';
import { requireUser } from '@/lib/auth/session';
import { getCreditCost } from '@/lib/credits';
import { loadSeries } from '@/lib/series/load';
import { getAdminDb } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export default async function BoxSetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const { series } = await loadSeries(id, user);
  const db = getAdminDb();

  const [{ data: books }, { data: rows }, cost] = await Promise.all([
    db
      .from('books')
      .select('id, part_number, title, status')
      .eq('series_id', series.id)
      .order('part_number'),
    db
      .from('box_sets')
      .select('id, title, book_ids, status, epub_path, cover_path, created_at')
      .eq('series_id', series.id)
      .order('created_at', { ascending: false })
      .limit(10),
    getCreditCost('cover'),
  ]);

  const boxSetBooks: BoxSetBook[] = (books ?? []).map((book) => ({
    id: book.id,
    partNumber: book.part_number,
    title: book.title || `Part ${book.part_number}`,
    status: book.status,
  }));

  const boxSets: BoxSetRow[] = (rows ?? []).map((row) => ({
    id: row.id,
    title: row.title,
    bookCount: (row.book_ids ?? []).length,
    status: row.status,
    epubPath: row.epub_path,
    coverPath: row.cover_path,
    createdAt: row.created_at,
  }));

  return (
    <Gate
      check={{ kind: 'boxSet' }}
      feature="The Box Set Builder"
      planCode="oto1"
      description="Bundle several books into one EPUB with a nested table of contents and a box set cover."
    >
      <BoxSetBuilder
        seriesId={series.id}
        seriesTitle={series.title}
        books={boxSetBooks}
        boxSets={boxSets}
        coverCost={cost.credits}
      />
    </Gate>
  );
}
