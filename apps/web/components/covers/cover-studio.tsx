'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ImageIcon, Loader2, Sparkles } from 'lucide-react';
import { Badge, Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { JobProgressDialog } from '@/components/jobs/job-progress-dialog';
import { generateCoverAction, setActiveCoverAction } from '@/lib/series/cover-actions';
import { cn } from '@/lib/utils';

export interface CoverVariation {
  id: string;
  url: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface CoverBook {
  id: string;
  partNumber: number;
  title: string;
  status: string;
  covers: CoverVariation[];
}

export function CoverStudio({
  seriesId,
  books,
  credits,
  cost,
  style,
}: {
  seriesId: string;
  books: CoverBook[];
  credits: number;
  cost: number;
  style: { artPrompt?: string; palette?: string[] } | null;
}) {
  const router = useRouter();
  const [job, setJob] = useState<{ jobId: string; bookId: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function generate(bookId: string) {
    setError(null);
    setBusy(`generate-${bookId}`);
    const response = await generateCoverAction({ bookId });
    setBusy(null);
    if (!response.ok) {
      setError(response.error.message);
      return;
    }
    setJob({ jobId: response.data.jobId, bookId });
  }

  async function activate(coverId: string) {
    setError(null);
    setBusy(`active-${coverId}`);
    const response = await setActiveCoverAction({ coverId });
    setBusy(null);
    if (!response.ok) {
      setError(response.error.message);
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {style?.artPrompt
            ? `Series style locked Â· palette: ${(style.palette ?? []).join(', ')}`
            : 'The first cover you generate locks the art style for the whole series.'}
        </p>
        <Badge variant="muted">{credits} credits Â· {cost} per cover</Badge>
      </div>

      {error ? (
        <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-rose-200">
          {error}
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {books.map((book) => {
          const active = book.covers.find((cover) => cover.isActive) ?? book.covers[0] ?? null;
          return (
            <Card key={book.id}>
              <CardContent className="flex flex-col gap-3 p-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold tracking-wide text-muted-foreground">
                    PART {book.partNumber}
                  </p>
                  <Badge variant={book.status === 'generated' ? 'success' : 'muted'}>
                    {book.status}
                  </Badge>
                </div>

                <div className="relative mx-auto aspect-[1600/2560] w-full max-w-[190px] overflow-hidden rounded-lg border border-border bg-muted/40">
                  {active?.url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={active.url}
                      alt={`Cover for ${book.title}`}
                      className="size-full object-cover"
                    />
                  ) : (
                    <div className="flex size-full flex-col items-center justify-center gap-2 text-muted-foreground">
                      <ImageIcon className="size-8" aria-hidden="true" />
                      <span className="text-xs">No cover yet</span>
                    </div>
                  )}
                </div>

                <p className="truncate text-sm font-semibold">{book.title}</p>

                {book.covers.length > 1 ? (
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {book.covers.map((cover) => (
                      <button
                        key={cover.id}
                        type="button"
                        onClick={() => activate(cover.id)}
                        disabled={cover.isActive || busy === `active-${cover.id}`}
                        title={cover.isActive ? 'Active cover' : 'Use this variation'}
                        className={cn(
                          'relative h-16 w-10 shrink-0 overflow-hidden rounded border',
                          cover.isActive ? 'border-primary ring-2 ring-primary/40' : 'border-border',
                        )}
                      >
                        {cover.url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={cover.url} alt="" className="size-full object-cover" />
                        ) : null}
                        {busy === `active-${cover.id}` ? (
                          <Loader2 className="absolute inset-0 m-auto size-4 animate-spin" />
                        ) : null}
                      </button>
                    ))}
                  </div>
                ) : null}

                <Button
                  type="button"
                  size="sm"
                  variant={book.covers.length > 0 ? 'secondary' : 'default'}
                  onClick={() => generate(book.id)}
                  disabled={busy !== null || credits < cost || book.status === 'locked'}
                >
                  {busy === `generate-${book.id}` ? (
                    <Loader2 className="animate-spin" aria-hidden="true" />
                  ) : (
                    <Sparkles aria-hidden="true" />
                  )}
                  {book.covers.length > 0 ? 'Generate variation' : 'Generate cover'} Â· {cost} cr
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {books.length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center text-sm text-muted-foreground">
            Write a part first â€” covers are generated per book.
          </CardContent>
        </Card>
      ) : null}

      <JobProgressDialog
        jobId={job?.jobId ?? null}
        title="Painting the cover"
        description="Art direction, artwork, then the ebook and print files."
        onClose={() => setJob(null)}
        onSettled={() => {
          setJob(null);
          router.refresh();
        }}
      />
    </div>
  );
}
