'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import * as pdfjs from 'pdfjs-dist';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  Loader2,
  Maximize2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { Badge, Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/input';
import { cn } from '@/lib/utils';

pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

export interface PreflightCheck {
  id: string;
  label: string;
  status: 'pass' | 'warn' | 'fail';
  detail: string;
}

export interface PreviewBook {
  id: string;
  label: string;
}

/**
 * KDP preview (T5.11): the print PDF with page navigation, zoom and thumbnails, the reflowable
 * ebook view, and the pre-flight checks that catch KDP rejections before uploading.
 */
export function KdpPreview({
  books,
  selectedId,
  pdfUrl,
  downloadUrl,
  checks,
  ebookHtml,
  pageCount,
}: {
  books: PreviewBook[];
  selectedId: string | null;
  pdfUrl: string | null;
  downloadUrl: string | null;
  checks: PreflightCheck[];
  ebookHtml: string;
  pageCount: number | null;
}) {
  const router = useRouter();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [mode, setMode] = useState<'print' | 'ebook'>('print');
  const [error, setError] = useState<string | null>(null);
  const [thumbs, setThumbs] = useState<string[]>([]);

  // A new file resets the viewer (render-phase adjustment, so no effect cascade).
  if (loadedUrl !== pdfUrl) {
    setLoadedUrl(pdfUrl);
    setDoc(null);
    setError(null);
    setThumbs([]);
    setPage(1);
  }

  const loading = Boolean(pdfUrl) && !doc && !error;

  useEffect(() => {
    if (!pdfUrl) return;

    let cancelled = false;

    void pdfjs
      .getDocument({ url: pdfUrl })
      .promise.then(async (loaded) => {
        if (cancelled) return;
        setDoc(loaded);

        // Thumbnails for the first pages only - enough to navigate, cheap to render.
        const previews: string[] = [];
        for (let index = 1; index <= Math.min(loaded.numPages, 12); index++) {
          const thumbPage = await loaded.getPage(index);
          const viewport = thumbPage.getViewport({ scale: 0.18 });
          const canvas = document.createElement('canvas');
          canvas.width = Math.round(viewport.width);
          canvas.height = Math.round(viewport.height);
          const context = canvas.getContext('2d');
          if (!context) continue;
          await thumbPage.render({ canvasContext: context, viewport, canvas }).promise;
          previews.push(canvas.toDataURL('image/jpeg', 0.7));
        }
        if (!cancelled) setThumbs(previews);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      });

    return () => {
      cancelled = true;
    };
  }, [pdfUrl]);

  useEffect(() => {
    if (!doc || !canvasRef.current) return;
    let cancelled = false;

    void doc.getPage(page).then(async (pdfPage) => {
      if (cancelled || !canvasRef.current) return;
      const container = canvasRef.current.parentElement;
      const available = container ? container.clientWidth - 32 : 520;
      const base = pdfPage.getViewport({ scale: 1 });
      const fitScale = available / base.width;
      const viewport = pdfPage.getViewport({ scale: fitScale * zoom });
      const canvas = canvasRef.current;
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      const context = canvas.getContext('2d');
      if (!context) return;
      await pdfPage.render({ canvasContext: context, viewport, canvas }).promise;
    });

    return () => {
      cancelled = true;
    };
  }, [doc, page, zoom]);

  const failed = checks.filter((check) => check.status === 'fail');
  const warnings = checks.filter((check) => check.status === 'warn');

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Select
            aria-label="Choose a book"
            className="w-64"
            value={selectedId ?? ''}
            onChange={(event) => router.push(`/kdp-preview?book=${event.target.value}`)}
          >
            {books.map((book) => (
              <option key={book.id} value={book.id}>
                {book.label}
              </option>
            ))}
          </Select>

          <div className="flex overflow-hidden rounded-lg border border-border">
            {(['print', 'ebook'] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setMode(value)}
                aria-pressed={mode === value}
                className={cn(
                  'px-3 py-2 text-xs capitalize',
                  mode === value ? 'bg-muted text-foreground' : 'text-muted-foreground',
                )}
              >
                {value} preview
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {failed.length > 0 ? (
            <Badge variant="danger">{failed.length} blocking</Badge>
          ) : warnings.length > 0 ? (
            <Badge variant="warning">{warnings.length} warning</Badge>
          ) : (
            <Badge variant="success">Ready to upload</Badge>
          )}
          {downloadUrl ? (
            <Button asChild size="sm" variant="secondary">
              <a href={downloadUrl} download>
                <Download aria-hidden="true" /> ZIP
              </a>
            </Button>
          ) : null}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)_300px]">
        <Card className="hidden lg:block">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs">Pages</CardTitle>
          </CardHeader>
          <CardContent className="max-h-[70vh] overflow-y-auto p-2">
            {thumbs.length === 0 ? (
              <p className="p-2 text-xs text-muted-foreground">No PDF yet.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {thumbs.map((thumb, index) => (
                  <button
                    key={index}
                    type="button"
                    onClick={() => setPage(index + 1)}
                    className={cn(
                      'overflow-hidden rounded border',
                      page === index + 1 ? 'border-primary ring-2 ring-primary/40' : 'border-border',
                    )}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={thumb} alt={`Page ${index + 1}`} className="w-full" />
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex flex-col gap-3 p-3">
            {mode === 'print' ? (
              <>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => setPage((value) => Math.max(1, value - 1))}
                      disabled={!doc || page <= 1}
                      aria-label="Previous page"
                    >
                      <ChevronLeft aria-hidden="true" />
                    </Button>
                    <span className="text-xs tabular-nums">
                      Page {page} / {doc?.numPages ?? pageCount ?? '—'}
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => setPage((value) => Math.min(doc?.numPages ?? 1, value + 1))}
                      disabled={!doc || page >= (doc?.numPages ?? 1)}
                      aria-label="Next page"
                    >
                      <ChevronRight aria-hidden="true" />
                    </Button>
                  </div>

                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => setZoom((value) => Math.max(0.6, Number((value - 0.2).toFixed(1))))}
                      aria-label="Zoom out"
                    >
                      <ZoomOut aria-hidden="true" />
                    </Button>
                    <span className="w-10 text-center text-xs tabular-nums">
                      {Math.round(zoom * 100)}%
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => setZoom((value) => Math.min(3, Number((value + 0.2).toFixed(1))))}
                      aria-label="Zoom in"
                    >
                      <ZoomIn aria-hidden="true" />
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => setZoom(1)}
                      aria-label="Fit to width"
                    >
                      <Maximize2 aria-hidden="true" />
                    </Button>
                  </div>
                </div>

                <div className="flex min-h-[60vh] items-start justify-center overflow-auto rounded-lg bg-muted/30 p-4">
                  {loading ? (
                    <p className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="size-4 animate-spin" aria-hidden="true" /> Rendering…
                    </p>
                  ) : error ? (
                    <p className="text-sm text-rose-300">{error}</p>
                  ) : pdfUrl ? (
                    <canvas ref={canvasRef} className="max-w-full rounded shadow-lg" />
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Export this book with the print PDF to preview it here.
                    </p>
                  )}
                </div>
              </>
            ) : (
              <div className="max-h-[75vh] overflow-y-auto rounded-lg bg-white px-8 py-10 text-[15px] leading-7 text-neutral-900">
                <div dangerouslySetInnerHTML={{ __html: ebookHtml }} />
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Pre-flight</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {checks.map((check) => (
              <div key={check.id} className="flex gap-2 text-xs">
                {check.status === 'pass' ? (
                  <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-green-400" aria-hidden="true" />
                ) : (
                  <AlertTriangle
                    className={cn(
                      'mt-0.5 size-3.5 shrink-0',
                      check.status === 'fail' ? 'text-rose-400' : 'text-amber-300',
                    )}
                    aria-hidden="true"
                  />
                )}
                <div>
                  <p className="font-medium">{check.label}</p>
                  <p className="text-muted-foreground">{check.detail}</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
