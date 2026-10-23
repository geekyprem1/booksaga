'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { ImageIcon, Loader2, Pencil, Sparkles, Unlock } from 'lucide-react';
import { Badge, Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { JobProgressDialog } from '@/components/jobs/job-progress-dialog';
import { defaultCoverLayers, type CoverLayerData } from '@/components/covers/cover-editor';
import {
  generateCoverAction,
  setActiveCoverAction,
  unlockCoverStyleAction,
} from '@/lib/series/cover-actions';
import { cn } from '@/lib/utils';

// Konva touches `window` at import time, so the editor only ever loads in the browser.
const CoverEditor = dynamic(
  () => import('@/components/covers/cover-editor').then((mod) => mod.CoverEditor),
  { ssr: false, loading: () => <p className="p-6 text-sm text-muted-foreground">Loading editor…</p> },
);

export interface CoverVariation {
  id: string;
  url: string | null;
  artUrl: string | null;
  layers: CoverLayerData[];
  fontFamily: 'serif' | 'sans' | 'display';
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
  seriesTitle,
  author,
}: {
  seriesId: string;
  books: CoverBook[];
  credits: number;
  cost: number;
  style: { artPrompt?: string; palette?: string[] } | null;
  seriesTitle: string;
  author: string;
}) {
  const router = useRouter();
  const [job, setJob] = useState<{ jobId: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<CoverVariation | null>(null);

  async function generate(bookId: string) {
    setError(null);
    setBusy(`generate-${bookId}`);
    const response = await generateCoverAction({ bookId });
    setBusy(null);
    if (!response.ok) {
      setError(response.error.message);
      return;
    }
    setJob({ jobId: response.data.jobId });
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

  async function unlockStyle() {
    if (!confirm('Unlock the series look? The next cover will re-direct the art style.')) return;
    setBusy('unlock');
    const response = await unlockCoverStyleAction({ seriesId });
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
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm text-muted-foreground">
            {style?.artPrompt
              ? `Series style locked · palette: ${(style.palette ?? []).join(', ')}`
              : 'The first cover you generate locks the art style for the whole series.'}
          </p>
          {style?.artPrompt ? (
            <Button type="button" size="sm" variant="ghost" onClick={unlockStyle} disabled={busy !== null}>
              {busy === 'unlock' ? (
                <Loader2 className="animate-spin" aria-hidden="true" />
              ) : (
                <Unlock aria-hidden="true" />
              )}
              Unlock style
            </Button>
          ) : null}
        </div>
        <Badge variant="muted">
          {credits} credits · {cost} per cover
        </Badge>
      </div>

      {error ? (
        <p
          role="alert"
          className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-rose-200"
        >
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

                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant={book.covers.length > 0 ? 'secondary' : 'default'}
                    onClick={() => generate(book.id)}
                    disabled={busy !== null || credits < cost || book.status === 'locked'}
                    className="flex-1"
                  >
                    {busy === `generate-${book.id}` ? (
                      <Loader2 className="animate-spin" aria-hidden="true" />
                    ) : (
                      <Sparkles aria-hidden="true" />
                    )}
                    {book.status === 'locked'
                      ? 'Write this part first'
                      : book.covers.length > 0
                        ? 'Variation'
                        : 'Generate cover'}
                    {book.status === 'locked' ? '' : ` · ${cost} cr`}
                  </Button>

                  {active?.artUrl ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setEditing(active)}
                      aria-label={`Edit cover for ${book.title}`}
                    >
                      <Pencil aria-hidden="true" />
                    </Button>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {books.length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center text-sm text-muted-foreground">
            Write a part first — covers are generated per book.
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

      <Dialog open={Boolean(editing)} onOpenChange={(open) => (!open ? setEditing(null) : undefined)}>
        <DialogContent
          title="Cover editor"
          description="Drag the text, then save — the server re-renders the final files."
          className="max-w-4xl"
        >
          {editing?.artUrl ? (
            <CoverEditor
              coverId={editing.id}
              artUrl={editing.artUrl}
              initialLayers={
                editing.layers.length > 0
                  ? editing.layers
                  : defaultCoverLayers({
                      seriesTitle,
                      title: books.find((b) => b.covers.some((c) => c.id === editing.id))?.title ?? 'Untitled',
                      partNumber: books.find((b) => b.covers.some((c) => c.id === editing.id))?.partNumber ?? 1,
                      author,
                    })
              }
              fontFamily={editing.fontFamily}
              onSaved={(jobId) => {
                setEditing(null);
                setJob({ jobId });
              }}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
