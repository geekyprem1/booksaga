import {
  KdpPreview,
  type PreflightCheck,
  type PreviewBook,
} from '@/components/preview/kdp-preview';
import { chapterHtml } from '@booksaga/exporters/html';
import { backMatter, frontMatter } from '@booksaga/exporters/matter';
import { insideMarginFor, TRIM_INCHES, type TrimSize } from '@booksaga/exporters/print';
import { getGenre } from '@booksaga/shared';
import { Card, CardContent } from '@/components/ui/card';
import { requireUser } from '@/lib/auth/session';
import { getAdminDb } from '@/lib/supabase/admin';
import { loadLatestExportFiles } from '@/lib/exports/latest';

export const metadata = { title: 'KDP Preview' };
export const dynamic = 'force-dynamic';

export default async function KdpPreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ book?: string }>;
}) {
  const { book: requested } = await searchParams;
  const user = await requireUser();
  const db = getAdminDb();

  const { data: rows } = await db
    .from('books')
    .select('id, title, part_number, status, series_id, series!inner(title, user_id, deleted_at)')
    .eq('series.user_id', user.id)
    .is('series.deleted_at', null)
    .eq('status', 'generated')
    .order('created_at', { ascending: false })
    .limit(50);

  const books: PreviewBook[] = (rows ?? []).map((row) => {
    const series = row.series as { title?: string } | null;
    return {
      id: row.id,
      label: `${series?.title ?? 'Series'} · Part ${row.part_number}: ${row.title || 'Untitled'}`,
    };
  });

  if (books.length === 0) {
    return (
      <KdpPreview
        books={[]}
        selectedId={null}
        pdfUrl={null}
        downloadUrl={null}
        checks={[]}
        ebookHtml=""
        pageCount={null}
      />
    );
  }

  const selectedId = books.some((book) => book.id === requested) ? requested! : books[0]!.id;

  const { data: book } = await db
    .from('books')
    .select('*, series!inner(user_id, deleted_at)')
    .eq('id', selectedId)
    .eq('series.user_id', user.id)
    .is('series.deleted_at', null)
    .maybeSingle();
  if (!book) {
    return (
      <Card>
        <CardContent className="p-12 text-center text-sm text-muted-foreground">
          That book is no longer available.
        </CardContent>
      </Card>
    );
  }

  const { data: series } = await db
    .from('series')
    .select('*')
    .eq('id', book.series_id)
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .maybeSingle();
  if (!series) throw new Error('This series is no longer available.');

  const [{ data: chapters }, exports, { data: cover }, { data: seriesBooks }] = await Promise.all([
    db
      .from('chapters')
      .select('number, title, content, content_text')
      .eq('book_id', book.id)
      .order('number'),
    loadLatestExportFiles(db, book.id),
    db
      .from('covers')
      .select('id, final_path')
      .eq('book_id', book.id)
      .eq('type', 'ebook')
      .eq('is_active', true)
      .maybeSingle(),
    db.from('books').select('part_number, title').eq('series_id', series.id).order('part_number'),
  ]);

  const pdfPath = exports.pdf.pdf ?? null;
  const zipPath = exports.zip.zip ?? null;
  const files = exports.wrap;
  const pageCount = exports.pdf.pdfPages ? Number(exports.pdf.pdfPages) : null;
  const wrapPages = files.wrapPages ? Number(files.wrapPages) : null;
  const wrapStale = wrapPages !== null && pageCount !== null && wrapPages !== pageCount;

  const metadataRow = (book.metadata ?? {}) as {
    blurb?: string;
    keywords?: string[];
    categories?: string[];
    readNext?: string;
    authorBio?: string;
  };

  const settings = (series?.settings ?? {}) as { trim?: TrimSize; bleed?: boolean };
  const trim: TrimSize = settings.trim && settings.trim in TRIM_INCHES ? settings.trim : '6x9';

  const chapterList = (chapters ?? []).map((chapter) => ({
    number: chapter.number,
    title: chapter.title,
    doc: (chapter.content ?? null) as never,
    text: chapter.content_text ?? '',
  }));

  const allBooks = seriesBooks ?? [];
  const nextBook = allBooks.find((other) => other.part_number === book.part_number + 1);
  const lastPart = Math.max(
    series.planned_books ?? 1,
    ...allBooks.map((other) => other.part_number),
  );
  const genre = getGenre(series.genre);
  const genreLine = genre
    ? genre.isFiction
      ? `${/^[aeiou]/i.test(genre.label) ? 'An' : 'A'} ${genre.label}`
      : genre.label
    : null;
  const matter = {
    genreLine,
    readingOrder: allBooks.map((other) => ({
      partNumber: other.part_number,
      title: other.title || null,
    })),
    isFinalPart: book.part_number >= lastPart,
    nextTitle: nextBook?.title || null,
    seriesTitle: series?.title ?? 'Series',
    bookTitle: book.title || `Part ${book.part_number}`,
    subtitle: book.subtitle,
    partNumber: book.part_number,
    author: series?.pen_name || 'Unknown Author',
    year: new Date().getFullYear(),
    metadata: metadataRow,
    chapters: chapterList.map((chapter) => ({ number: chapter.number, title: chapter.title })),
  };

  const alsoTitles = allBooks
    .filter((other) => other.part_number !== book.part_number && other.title)
    .map((other) => `Book ${other.part_number}: ${other.title}`);
  const back = backMatter(matter, alsoTitles);
  const ebookHtml = [
    frontMatter(matter),
    ...chapterList.map((chapter) => chapterHtml(chapter)),
    back,
  ].join('\n');

  const checks: PreflightCheck[] = [
    {
      id: 'pdf',
      label: 'Print PDF',
      status: pdfPath ? 'pass' : 'fail',
      detail: pdfPath
        ? `${pageCount ?? '?'} pages · ${TRIM_INCHES[trim].width} × ${TRIM_INCHES[trim].height} in`
        : 'Export the book with “Print PDF” selected, then reload this page.',
    },
    {
      id: 'pages',
      label: 'Page count',
      status: pageCount === null ? 'warn' : pageCount >= 24 ? 'pass' : 'fail',
      detail:
        pageCount === null
          ? 'Unknown until the PDF is exported.'
          : pageCount >= 24
            ? `${pageCount} pages (KDP needs at least 24).`
            : `${pageCount} pages — KDP requires at least 24.`,
    },
    {
      id: 'gutter',
      label: 'Calculated gutter',
      status: 'warn',
      detail:
        pageCount === null
          ? 'Calculated from the page count at export time.'
          : `${insideMarginFor(pageCount)}" expected for ${pageCount} pages. Inspect the exported PDF to verify the inside margins.`,
    },
    {
      id: 'cover',
      label: 'Cover',
      status: cover?.final_path ? 'pass' : 'warn',
      detail: cover?.final_path
        ? 'Active ebook cover found.'
        : 'No active cover — KDP will reject an upload without one.',
    },
    {
      id: 'metadata',
      label: 'Metadata',
      status:
        metadataRow.blurb &&
        (metadataRow.keywords?.length ?? 0) >= 7 &&
        (metadataRow.categories?.length ?? 0) > 0
          ? 'pass'
          : 'warn',
      detail: [
        metadataRow.blurb ? null : 'blurb missing',
        (metadataRow.keywords?.length ?? 0) >= 7
          ? null
          : `${metadataRow.keywords?.length ?? 0}/7 keywords`,
        `${metadataRow.categories?.length ?? 0}/3 categories`,
      ]
        .filter(Boolean)
        .join(' · '),
    },
    {
      id: 'next-url',
      label: 'Read Next link',
      status: back.includes('{{NEXT_BOOK_URL}}') ? 'warn' : 'pass',
      detail: back.includes('{{NEXT_BOOK_URL}}')
        ? 'Replace {{NEXT_BOOK_URL}} with the real Amazon link before uploading.'
        : 'No unresolved placeholder.',
    },
    {
      id: 'wrap',
      label: 'Paperback wrap',
      status: files.wrap ? (wrapStale ? 'warn' : 'pass') : 'warn',
      detail: files.wrap
        ? wrapStale
          ? `Wrap was built for ${wrapPages} pages but the book is now ${pageCount}. Regenerate it (free).`
          : `Wrap ${files.wrapWidth ?? '?'}in wide, front art ${files.wrapDpi ?? '?'} DPI.`
        : 'Not exported. Add the paperback wrap when you export.',
    },
    {
      id: 'chapters',
      label: 'Chapters',
      status: chapterList.length > 0 ? 'pass' : 'fail',
      detail: `${chapterList.length} chapters in the manuscript.`,
    },
  ];

  return (
    <KdpPreview
      books={books}
      selectedId={selectedId}
      pdfUrl={pdfPath ? `/api/files/exports/${pdfPath}?stream=1` : null}
      downloadUrl={zipPath ? `/api/files/exports/${zipPath}` : null}
      checks={checks}
      ebookHtml={ebookHtml}
      pageCount={pageCount}
      coverUrl={cover?.final_path ? `/api/files/covers/${cover.final_path}?stream=1` : null}
      wrapUrl={files.wrap ? `/api/files/exports/${files.wrap}?stream=1` : null}
      seriesId={book.series_id}
      bookTitle={book.title || `Part ${book.part_number}`}
      author={series?.pen_name || 'Unknown Author'}
      trimLabel={`${TRIM_INCHES[trim].width} × ${TRIM_INCHES[trim].height} in`}
      bleed={settings.bleed === true}
    />
  );
}
