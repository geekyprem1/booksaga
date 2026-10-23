import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import type { TiptapDoc } from '@booksaga/shared';
import { Badge } from '@/components/ui/card';
import { BookWorkspace } from '@/components/editor/book-workspace';
import type {
  BookMetadataDraft,
  ContinuityIssue,
  EditorChapter,
} from '@/components/editor/types';
import { requireUser } from '@/lib/auth/session';
import { loadSeries } from '@/lib/series/load';
import { getAdminDb } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export default async function BookEditorPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; bookId: string }>;
  searchParams: Promise<{ chapter?: string }>;
}) {
  const { id, bookId } = await params;
  const { chapter: chapterParam } = await searchParams;
  const user = await requireUser();
  const { series } = await loadSeries(id, user);
  const db = getAdminDb();

  const { data: book } = await db
    .from('books')
    .select('*')
    .eq('id', bookId)
    .eq('series_id', series.id)
    .maybeSingle();
  if (!book) notFound();

  const { data: chapters } = await db
    .from('chapters')
    .select('id, number, title, content, content_text, word_count')
    .eq('book_id', book.id)
    .order('number');

  const editorChapters: EditorChapter[] = (chapters ?? []).map((chapter) => ({
    id: chapter.id,
    number: chapter.number,
    title: chapter.title,
    doc: (chapter.content ?? null) as TiptapDoc | null,
    text: chapter.content_text ?? '',
    wordCount: chapter.word_count ?? 0,
  }));

  const rawMetadata = (book.metadata ?? {}) as {
    title?: string;
    subtitle?: string;
    blurb?: string;
    keywords?: string[];
    categories?: string[];
  };

  const metadata: BookMetadataDraft = {
    title: rawMetadata.title ?? book.title,
    subtitle: rawMetadata.subtitle ?? book.subtitle ?? '',
    blurb: rawMetadata.blurb ?? '',
    keywords: rawMetadata.keywords ?? [],
    categories: rawMetadata.categories ?? [],
  };

  const report = (book.continuity_report ?? {}) as { issues?: ContinuityIssue[] };
  const totalWords = editorChapters.reduce((sum, c) => sum + c.wordCount, 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link
            href={`/series/${series.id}`}
            className="mb-1 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-3" aria-hidden="true" /> Back to the roadmap
          </Link>
          <h2 className="text-2xl font-extrabold">
            {book.title || `Part ${book.part_number}`}
          </h2>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant={book.status === 'generated' ? 'success' : 'muted'}>{book.status}</Badge>
          <Badge variant="muted">{totalWords.toLocaleString()} words</Badge>
          <Badge variant="muted">{editorChapters.length} chapters</Badge>
        </div>
      </div>

      <BookWorkspace
        bookId={book.id}
        chapters={editorChapters}
        metadata={metadata}
        issues={report.issues ?? []}
        initialChapterId={
          chapterParam && editorChapters.some((c) => c.id === chapterParam)
            ? chapterParam
            : undefined
        }
      />
    </div>
  );
}
