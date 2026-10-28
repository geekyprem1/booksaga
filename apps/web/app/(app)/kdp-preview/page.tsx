import {
  KdpPreview,
  type PreflightCheck,
  type PreviewBook,
} from '@/components/preview/kdp-preview';
import { chapterHtml } from '@booksaga/exporters/html';
import { backMatter, frontMatter } from '@booksaga/exporters/matter';
import { insideMarginFor, TRIM_INCHES, type TrimSize } from '@booksaga/exporters/print';
import { Card, CardContent } from '@/components/ui/card';
import { requireUser } from '@/lib/auth/session';
import { getAdminDb } from '@/lib/supabase/admin';

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
    .select('id, title, part_number, status, series_id, series:series_id(title, user_id)')
    .eq('status', 'generated')
    .order('created_at', { ascending: false })
    .limit(50);

  const books: PreviewBook[] = (rows ?? [])
    .filter((row) => {
      const series = row.series as { user_id?: string } | null;
      return series?.user_id === user.id;
    })
    .map((row) => {
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

  const { data: book } = await db.from('books').select('*').eq('id', selectedId).maybeSingle();
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
    .maybeSingle();

  const [{ data: chapters }, { data: exportRow }, { data: cover }] = await Promise.all([
    db
      .from('chapters')
      .select('number, title, content, content_text')
      .eq('book_id', book.id)
      .order('number'),
    db
      .from('exports')
      .select('id, files, created_at')
      .eq('book_id', book.id)
      .eq('status', 'ready')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    db
      .from('covers')
      .select('id, final_path')
      .eq('book_id', book.id)
      .eq('type', 'ebook')
      .eq('is_active', true)
      .maybeSingle(),
  ]);

  const files = (exportRow?.files ?? {}) as Record<string, string>;
  const pdfPath = files.pdf ?? null;
  const zipPath = files.zip ?? null;
  const pageCount = files.pdfPages ? Number(files.pdfPages) : null;
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

  const matter = {
    seriesTitle: series?.title ?? 'Series',
    bookTitle: book.title || `Part ${book.part_number}`,
    subtitle: book.subtitle,
    partNumber: book.part_number,
    author: series?.pen_name || 'Unknown Author',
    year: new Date().getFullYear(),
    metadata: metadataRow,
    chapters: chapterList.map((chapter) => ({ number: chapter.number, title: chapter.title })),
  };

  const ebookHtml = [
    frontMatter(matter),
    ...chapterList.map((chapter) => chapterHtml(chapter)),
    backMatter(matter, []),
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
      label: 'Inside margin',
      status: pageCount === null ? 'warn' : 'pass',
      detail:
        pageCount === null
          ? 'Calculated from the page count at export time.'
          : `${insideMarginFor(pageCount)}" gutter for ${pageCount} pages.`,
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
        (metadataRow.keywords?.length ?? 0) > 0 &&
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
      status: metadataRow.readNext?.includes('{{NEXT_BOOK_URL}}') ? 'warn' : 'pass',
      detail: metadataRow.readNext?.includes('{{NEXT_BOOK_URL}}')
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
