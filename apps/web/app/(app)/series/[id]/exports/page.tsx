import { ExportsHub, type ExportBook, type ExportRow } from '@/components/exports/exports-hub';
import { requireUser } from '@/lib/auth/session';
import { getAccount } from '@/lib/account';
import { loadSeries } from '@/lib/series/load';
import { getAdminDb } from '@/lib/supabase/admin';
import { exportFilesExpired } from '@/lib/exports/latest';

export const dynamic = 'force-dynamic';

export default async function SeriesExportsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const { series } = await loadSeries(id, user);
  const db = getAdminDb();

  const { data: books } = await db
    .from('books')
    .select('id, part_number, title, status')
    .eq('series_id', series.id)
    .order('part_number');

  const bookIds = (books ?? []).map((book) => book.id);

  const { data: covers } = bookIds.length
    ? await db
        .from('covers')
        .select('book_id, final_path')
        .in('book_id', bookIds)
        .eq('type', 'ebook')
        .eq('is_active', true)
    : { data: [] as { book_id: string; final_path: string | null }[] };

  const coverUrls = new Map<string, string>();
  await Promise.all(
    (covers ?? []).map(async (cover) => {
      if (!cover.final_path) return;
      const { data } = await db.storage.from('covers').createSignedUrl(cover.final_path, 3600);
      if (data?.signedUrl) coverUrls.set(cover.book_id, data.signedUrl);
    }),
  );

  const { data: exportRows } = await db
    .from('exports')
    .select('id, book_id, formats, files, status, created_at, expires_at')
    .eq('series_id', series.id)
    .in('status', ['ready', 'expired'])
    .order('created_at', { ascending: false })
    .limit(10);

  const titleByBook = new Map((books ?? []).map((book) => [book.id, book.title]));

  const rows: ExportRow[] = (exportRows ?? []).map((row) => ({
    id: row.id,
    bookTitle: titleByBook.get(row.book_id ?? '') ?? 'Book',
    formats: row.formats ?? [],
    zipPath: ((row.files ?? {}) as { zip?: string }).zip ?? null,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    status: exportFilesExpired(row.status, row.expires_at) ? 'expired' : 'ready',
  }));

  const exportBooks: ExportBook[] = (books ?? []).map((book) => ({
    id: book.id,
    partNumber: book.part_number,
    title: book.title || `Part ${book.part_number}`,
    status: book.status,
    coverUrl: coverUrls.get(book.id) ?? null,
  }));

  const { account } = await getAccount();

  return (
    <ExportsHub books={exportBooks} exports={rows} canWrap={account.entitlements.paperbackWrap} />
  );
}
