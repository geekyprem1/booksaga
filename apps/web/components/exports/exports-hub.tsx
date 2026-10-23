'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Download, FileArchive, Loader2 } from 'lucide-react';
import { Badge, Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { JobProgressDialog } from '@/components/jobs/job-progress-dialog';
import { exportBookAction } from '@/lib/series/export-actions';
import { cn } from '@/lib/utils';

export interface ExportBook {
  id: string;
  partNumber: number;
  title: string;
  status: string;
  coverUrl: string | null;
}

export interface ExportRow {
  id: string;
  bookTitle: string;
  formats: string[];
  zipPath: string | null;
  createdAt: string;
  expiresAt: string | null;
}

type Format = 'epub' | 'pdf' | 'docx' | 'metadata';

const FORMAT_LABELS: Record<Format, string> = {
  epub: 'EPUB',
  pdf: 'Print PDF',
  docx: 'DOCX',
  metadata: 'Metadata',
};

export function ExportsHub({
  books,
  exports,
}: {
  books: ExportBook[];
  exports: ExportRow[];
}) {
  const router = useRouter();
  const [job, setJob] = useState<{ jobId: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedFormats, setSelectedFormats] = useState<Record<string, Format[]>>({});

  function formatsFor(bookId: string): Format[] {
    return selectedFormats[bookId] ?? ['epub', 'pdf', 'docx', 'metadata'];
  }

  function toggle(bookId: string, format: Format) {
    setSelectedFormats((current) => {
      const active = current[bookId] ?? ['epub', 'pdf', 'docx', 'metadata'];
      const next = active.includes(format)
        ? active.filter((item) => item !== format)
        : [...active, format];
      return { ...current, [bookId]: next };
    });
  }

  async function run(bookId: string) {
    setError(null);
    setBusy(bookId);
    const response = await exportBookAction({ bookId, formats: formatsFor(bookId) });
    setBusy(null);
    if (!response.ok) {
      setError(response.error.message);
      return;
    }
    setJob({ jobId: response.data.jobId });
  }

  return (
    <div className="flex flex-col gap-5">
      {error ? (
        <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-rose-200">
          {error}
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {books.map((book) => (
          <Card key={book.id}>
            <CardContent className="flex flex-col gap-3 p-4">
              <div className="flex items-start gap-3">
                {book.coverUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={book.coverUrl}
                    alt=""
                    className="h-20 w-[52px] shrink-0 rounded border border-border object-cover"
                  />
                ) : null}
                <div className="min-w-0">
                  <p className="text-xs font-semibold tracking-wide text-muted-foreground">
                    PART {book.partNumber}
                  </p>
                  <p className="truncate text-sm font-semibold">{book.title}</p>
                  <Badge variant={book.status === 'generated' ? 'success' : 'muted'}>
                    {book.status}
                  </Badge>
                </div>
              </div>

              <div className="flex flex-wrap gap-1">
                {(['epub', 'pdf', 'docx', 'metadata'] as Format[]).map((format) => {
                  const active = formatsFor(book.id).includes(format);
                  return (
                    <button
                      key={format}
                      type="button"
                      onClick={() => toggle(book.id, format)}
                      aria-pressed={active}
                      className={cn(
                        'rounded-full border px-2.5 py-1 text-xs',
                        active
                          ? 'border-primary bg-primary/20 text-violet-100'
                          : 'border-border text-muted-foreground',
                      )}
                    >
                      {FORMAT_LABELS[format]}
                    </button>
                  );
                })}
              </div>

              <Button
                type="button"
                size="sm"
                onClick={() => run(book.id)}
                disabled={busy !== null || book.status !== 'generated' || formatsFor(book.id).length === 0}
              >
                {busy === book.id ? (
                  <Loader2 className="animate-spin" aria-hidden="true" />
                ) : (
                  <FileArchive aria-hidden="true" />
                )}
                {book.status === 'generated' ? 'Export · free' : 'Write this part first'}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Export history</CardTitle>
        </CardHeader>
        <CardContent>
          {exports.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No exports yet. Files stay available for 30 days.
            </p>
          ) : (
            <ul className="divide-y divide-border/60">
              {exports.map((row) => (
                <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{row.bookTitle}</p>
                    <p className="text-xs text-muted-foreground">
                      {row.formats.join(' · ')} ·{' '}
                      {new Date(row.createdAt).toLocaleString(undefined, {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      })}
                      {row.expiresAt
                        ? ` · expires ${new Date(row.expiresAt).toLocaleDateString()}`
                        : ''}
                    </p>
                  </div>
                  {row.zipPath ? (
                    <Button asChild size="sm" variant="secondary">
                      <a href={`/api/files/exports/${row.zipPath}`} download>
                        <Download aria-hidden="true" /> Download ZIP
                      </a>
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <JobProgressDialog
        jobId={job?.jobId ?? null}
        title="Packaging your files"
        description="EPUB, DOCX, metadata and the cover, zipped together."
        onClose={() => setJob(null)}
        onSettled={() => {
          setJob(null);
          router.refresh();
        }}
      />
    </div>
  );
}
