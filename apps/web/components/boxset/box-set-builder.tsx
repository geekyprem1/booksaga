'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Download, Loader2, Package } from 'lucide-react';
import { Badge, Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';
import { JobProgressDialog } from '@/components/jobs/job-progress-dialog';
import { createBoxSetAction } from '@/lib/series/box-set-actions';
import { cn } from '@/lib/utils';

export interface BoxSetBook {
  id: string;
  partNumber: number;
  title: string;
  status: string;
}

export interface BoxSetRow {
  id: string;
  title: string;
  bookCount: number;
  status: string;
  epubPath: string | null;
  coverPath: string | null;
  createdAt: string;
}

export function BoxSetBuilder({
  seriesId,
  seriesTitle,
  books,
  boxSets,
  coverCost,
}: {
  seriesId: string;
  seriesTitle: string;
  books: BoxSetBook[];
  boxSets: BoxSetRow[];
  coverCost: number;
}) {
  const router = useRouter();
  const generated = books.filter((book) => book.status === 'generated');
  const [selected, setSelected] = useState<string[]>(generated.map((book) => book.id));
  const [title, setTitle] = useState(
    generated.length > 1
      ? `${seriesTitle}: Books ${generated[0]?.partNumber}–${generated[generated.length - 1]?.partNumber}`
      : seriesTitle,
  );
  const [withCover, setWithCover] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [job, setJob] = useState<{ jobId: string } | null>(null);

  function toggle(bookId: string) {
    setSelected((current) =>
      current.includes(bookId) ? current.filter((id) => id !== bookId) : [...current, bookId],
    );
  }

  async function build() {
    setError(null);
    setBusy(true);
    const response = await createBoxSetAction({ seriesId, bookIds: selected, title, withCover });
    setBusy(false);
    if (!response.ok) {
      setError(response.error.message);
      return;
    }
    setJob({ jobId: response.data.jobId });
  }

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="size-4 text-violet-300" aria-hidden="true" />
            Build a box set
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div>
            <Label className="mb-2 block text-xs">Books in the set</Label>
            <div className="flex flex-wrap gap-2">
              {books.map((book) => {
                const active = selected.includes(book.id);
                const disabled = book.status !== 'generated';
                return (
                  <button
                    key={book.id}
                    type="button"
                    disabled={disabled}
                    onClick={() => toggle(book.id)}
                    aria-pressed={active}
                    className={cn(
                      'rounded-lg border px-3 py-2 text-left text-xs',
                      disabled
                        ? 'cursor-not-allowed border-border/50 text-muted-foreground/50'
                        : active
                          ? 'border-primary bg-primary/15 text-violet-100'
                          : 'border-border text-muted-foreground',
                    )}
                  >
                    <span className="block font-semibold">Part {book.partNumber}</span>
                    <span className="block max-w-[160px] truncate">{book.title}</span>
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {selected.length} selected · at least 2 required
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="box-title">Box set title</Label>
            <Input
              id="box-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={120}
            />
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={withCover}
              onChange={(event) => setWithCover(event.target.checked)}
              className="size-4 accent-violet-500"
            />
            Generate a box set cover · {coverCost} credits
          </label>

          {error ? (
            <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 p-2 text-xs text-rose-200">
              {error}
            </p>
          ) : null}

          <Button
            type="button"
            onClick={build}
            disabled={busy || selected.length < 2 || title.trim().length < 3}
            className="self-start"
          >
            {busy ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Package aria-hidden="true" />}
            Build box set
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Box sets</CardTitle>
        </CardHeader>
        <CardContent>
          {boxSets.length === 0 ? (
            <p className="text-sm text-muted-foreground">No box sets yet.</p>
          ) : (
            <ul className="divide-y divide-border/60">
              {boxSets.map((row) => (
                <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div className="flex items-center gap-3">
                    {row.coverPath ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={`/api/files/exports/${row.coverPath}?stream=1`}
                        alt=""
                        className="h-16 w-10 rounded border border-border object-cover"
                      />
                    ) : null}
                    <div>
                      <p className="text-sm font-medium">{row.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {row.bookCount} books ·{' '}
                        {new Date(row.createdAt).toLocaleString(undefined, {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        })}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={row.status === 'ready' ? 'success' : 'muted'}>{row.status}</Badge>
                    {row.epubPath ? (
                      <Button asChild size="sm" variant="secondary">
                        <a href={`/api/files/exports/${row.epubPath}`} download>
                          <Download aria-hidden="true" /> EPUB
                        </a>
                      </Button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <JobProgressDialog
        jobId={job?.jobId ?? null}
        title="Building the box set"
        description="Collecting the books, writing the description, then the EPUB."
        onClose={() => setJob(null)}
        onSettled={() => {
          setJob(null);
          router.refresh();
        }}
      />
    </div>
  );
}
