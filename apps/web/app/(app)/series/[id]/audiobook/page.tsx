import {
  AudiobookStudio,
  type AudiobookBook,
  type AudiobookChapter,
  type AudiobookRow,
} from '@/components/audiobook/audiobook-studio';
import { Gate } from '@/components/billing/gate';
import { displayTitle } from '@booksaga/exporters/html';
import { DEFAULT_VOICE } from '@booksaga/shared';
import { getAccount } from '@/lib/account';
import { requireUser } from '@/lib/auth/session';
import { getCreditCost } from '@/lib/credits';
import { loadSeries } from '@/lib/series/load';
import { getAdminDb } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export default async function AudiobookPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const { series } = await loadSeries(id, user);
  const { account } = await getAccount();
  const db = getAdminDb();

  const [{ data: books }, { data: rows }, cost] = await Promise.all([
    db
      .from('books')
      .select('id, part_number, title, status')
      .eq('series_id', series.id)
      .order('part_number'),
    db
      .from('audiobooks')
      .select('id, book_id, voice, speed, status, chapters, zip_path, cover_path, total_seconds, created_at')
      .eq('series_id', series.id)
      .order('created_at', { ascending: false })
      .limit(6),
    getCreditCost('audiobook'),
  ]);

  const titleByBook = new Map((books ?? []).map((book) => [book.id, book.title]));

  const audiobookBooks: AudiobookBook[] = (books ?? []).map((book) => ({
    id: book.id,
    partNumber: book.part_number,
    title: book.title || `Part ${book.part_number}`,
    status: book.status,
  }));

  const audiobooks: AudiobookRow[] = (rows ?? []).map((row) => ({
    id: row.id,
    bookTitle: titleByBook.get(row.book_id) ?? 'Book',
    voice: row.voice,
    speed: Number(row.speed),
    status: row.status,
    chapters: ((row.chapters ?? []) as unknown as AudiobookChapter[])
      .filter(Boolean)
      .map((chapter) => ({ ...chapter, title: displayTitle(chapter.title) })),
    zipPath: row.zip_path,
    coverPath: row.cover_path,
    totalSeconds: row.total_seconds,
    createdAt: row.created_at,
  }));

  const audioCredits = account.balances.audio;

  return (
    <Gate
      check={{ kind: 'audiobook' }}
      feature="Audiobooks"
      planCode="oto3"
      description="Turn any part into a mastered audiobook with curated AI voices."
    >
      <AudiobookStudio
        books={audiobookBooks}
        audiobooks={audiobooks}
        cost={cost.credits}
        credits={audioCredits}
        defaultVoice={DEFAULT_VOICE}
      />
    </Gate>
  );
}
