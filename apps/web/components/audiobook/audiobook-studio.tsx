'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Download, Headphones, Loader2, Mic } from 'lucide-react';
import { VOICES, type VoiceOption } from '@booksaga/shared';
import { Badge, Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label, Select } from '@/components/ui/input';
import { JobProgressDialog } from '@/components/jobs/job-progress-dialog';
import { createAudiobookAction } from '@/lib/series/audiobook-actions';
import { cn } from '@/lib/utils';

export interface AudiobookBook {
  id: string;
  partNumber: number;
  title: string;
  status: string;
}

export interface AudiobookChapter {
  number: number;
  title: string;
  path: string;
  durationSec: number;
}

export interface AudiobookRow {
  id: string;
  bookTitle: string;
  voice: string;
  speed: number;
  status: string;
  chapters: AudiobookChapter[];
  zipPath: string | null;
  coverPath: string | null;
  totalSeconds: number | null;
  createdAt: string;
}

const minutes = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

export function AudiobookStudio({
  books,
  audiobooks,
  cost,
  credits,
  defaultVoice,
}: {
  books: AudiobookBook[];
  audiobooks: AudiobookRow[];
  cost: number;
  credits: number;
  defaultVoice: string;
}) {
  const router = useRouter();
  const generated = books.filter((book) => book.status === 'generated');

  const [bookId, setBookId] = useState(generated[0]?.id ?? '');
  const [voice, setVoice] = useState(defaultVoice);
  const [speed, setSpeed] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [job, setJob] = useState<{ jobId: string } | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);

  async function narrate() {
    setError(null);
    setBusy(true);
    const response = await createAudiobookAction({ bookId, voice, speed });
    setBusy(false);
    if (!response.ok) {
      setError(response.error.message);
      return;
    }
    setJob({ jobId: response.data.jobId });
  }

  const selectedVoice: VoiceOption | undefined = VOICES.find((item) => item.id === voice);

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mic className="size-4 text-violet-300" aria-hidden="true" />
            Narrate a book
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {generated.length === 0 ? (
            <p className="text-sm text-muted-foreground">Write a part first — narration needs chapters.</p>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="audio-book">Book</Label>
                  <Select
                    id="audio-book"
                    value={bookId}
                    onChange={(event) => setBookId(event.target.value)}
                  >
                    {generated.map((book) => (
                      <option key={book.id} value={book.id}>
                        Part {book.partNumber}: {book.title}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="audio-speed">Speed {speed.toFixed(2)}×</Label>
                  <input
                    id="audio-speed"
                    type="range"
                    min={0.8}
                    max={1.4}
                    step={0.05}
                    value={speed}
                    onChange={(event) => setSpeed(Number(event.target.value))}
                    className="accent-violet-500"
                  />
                </div>
              </div>

              <div>
                <Label className="mb-2 block text-xs">Voice</Label>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  {VOICES.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setVoice(item.id)}
                      aria-pressed={voice === item.id}
                      className={cn(
                        'rounded-lg border p-2 text-left text-xs',
                        voice === item.id
                          ? 'border-primary bg-primary/15 text-violet-100'
                          : 'border-border text-muted-foreground',
                      )}
                    >
                      <span className="block font-semibold">{item.name}</span>
                      <span className="block text-[11px] opacity-80">
                        {item.accent} · {item.gender}
                      </span>
                    </button>
                  ))}
                </div>
                {selectedVoice ? (
                  <p className="mt-2 text-xs text-muted-foreground">{selectedVoice.description}</p>
                ) : null}
              </div>

              {error ? (
                <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 p-2 text-xs text-rose-200">
                  {error}
                </p>
              ) : null}

              <div className="flex items-center gap-3">
                <Button type="button" onClick={narrate} disabled={busy || credits < cost}>
                  {busy ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Headphones aria-hidden="true" />}
                  Narrate · {cost} audio credits
                </Button>
                <p className="text-xs text-muted-foreground">{credits} audio credits available</p>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Audiobooks</CardTitle>
        </CardHeader>
        <CardContent>
          {audiobooks.length === 0 ? (
            <p className="text-sm text-muted-foreground">No audiobooks yet.</p>
          ) : (
            <div className="flex flex-col gap-4">
              {audiobooks.map((row) => (
                <div key={row.id} className="rounded-lg border border-border/60 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium">{row.bookTitle}</p>
                      <p className="text-xs text-muted-foreground">
                        {row.voice} · {row.speed.toFixed(2)}× ·{' '}
                        {row.totalSeconds ? minutes(row.totalSeconds) : '—'} · {row.chapters.length} files
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={row.status === 'ready' ? 'success' : 'muted'}>{row.status}</Badge>
                      {row.zipPath ? (
                        <Button asChild size="sm" variant="secondary">
                          <a href={`/api/files/exports/${row.zipPath}`} download>
                            <Download aria-hidden="true" /> ZIP
                          </a>
                        </Button>
                      ) : null}
                    </div>
                  </div>

                  {row.chapters.length > 0 ? (
                    <ul className="mt-3 flex flex-col divide-y divide-border/50">
                      {row.chapters.map((chapter) => (
                        <li key={chapter.path} className="flex items-center justify-between gap-2 py-1.5">
                          <button
                            type="button"
                            onClick={() => setPlaying(playing === chapter.path ? null : chapter.path)}
                            className="text-left text-xs hover:text-violet-200"
                          >
                            {chapter.number === 0
                              ? 'Opening credits'
                              : `Chapter ${chapter.number}: ${chapter.title}`}
                          </button>
                          <span className="text-[11px] text-muted-foreground">
                            {minutes(chapter.durationSec)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : null}

                  {playing && row.chapters.some((chapter) => chapter.path === playing) ? (
                    <audio
                      key={playing}
                      controls
                      autoPlay
                      className="mt-2 w-full"
                      src={`/api/files/audio/${playing}?stream=1`}
                    />
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <JobProgressDialog
        jobId={job?.jobId ?? null}
        title="Narrating your book"
        description="Chapter by chapter: synthesis, mastering, then the ZIP."
        onClose={() => setJob(null)}
        onSettled={() => {
          setJob(null);
          router.refresh();
        }}
      />
    </div>
  );
}
