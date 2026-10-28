'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import * as pdfjs from 'pdfjs-dist';
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist';
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Circle,
  Download,
  Eye,
  FileText,
  ImageIcon,
  LayoutGrid,
  Loader2,
  Maximize2,
  Minus,
  Plus,
  Send,
  ShieldCheck,
  Sparkles,
  WandSparkles,
} from 'lucide-react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import styles from './kdp-preview.module.css';

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

interface PreviewProps {
  books: PreviewBook[];
  selectedId: string | null;
  pdfUrl: string | null;
  downloadUrl: string | null;
  checks: PreflightCheck[];
  ebookHtml: string;
  pageCount: number | null;
  coverUrl?: string | null;
  wrapUrl?: string | null;
  seriesId?: string;
  bookTitle?: string;
  author?: string;
  trimLabel?: string;
  bleed?: boolean;
}

const reviewItems = [
  'Review full book layout',
  'Check cover (front, back, spine)',
  'Verify page numbers',
  'Review table of contents',
  'Ensure images render correctly',
  'Test on different devices',
  'Confirm publishing guidelines',
];

const sampleChecks = [
  'Title and metadata formatting',
  'Page margins and spacing',
  'Image quality and resolution',
  'Chapter structure and TOC',
  'Links and internal navigation',
];

function PdfPage({ doc, page, zoom }: { doc: PDFDocumentProxy; page: number; zoom: number }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [width, setWidth] = useState(0);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!hostRef.current) return;
    const observer = new ResizeObserver(([entry]) =>
      setWidth(Math.floor(entry!.contentRect.width)),
    );
    observer.observe(hostRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!width) return;
    let cancelled = false;
    let task: RenderTask | undefined;
    void doc
      .getPage(page)
      .then(async (pdfPage) => {
        if (cancelled || !canvasRef.current) return;
        const base = pdfPage.getViewport({ scale: 1 });
        const viewport = pdfPage.getViewport({ scale: ((width - 32) / base.width) * zoom });
        const canvas = canvasRef.current;
        const density = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.round(viewport.width * density);
        canvas.height = Math.round(viewport.height * density);
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;
        const context = canvas.getContext('2d');
        if (!context) return;
        task = pdfPage.render({
          canvasContext: context,
          viewport,
          canvas,
          transform: [density, 0, 0, density, 0, 0],
        });
        await task.promise;
      })
      .catch((err: Error) => {
        if (!cancelled && err.name !== 'RenderingCancelledException') setError(true);
      });
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [doc, page, zoom, width]);

  return (
    <div ref={hostRef} className={styles.pdfPage}>
      {error ? (
        <p role="alert">Could not render this page. Download the PDF to review it.</p>
      ) : (
        <canvas ref={canvasRef} aria-label={`Manuscript page ${page}`} />
      )}
    </div>
  );
}

function SampleSpread({ page, zoom }: { page: number; zoom: number }) {
  const spreadPage = page <= 2 ? 1 : 3;
  return (
    <div className={styles.spreadFrame}>
      <div className={styles.spread} style={{ width: `${zoom * 100}%` }}>
        <article className={styles.paper}>
          <header>
            <span>{spreadPage < 3 ? 'CHAPTER ONE' : 'CHAPTER TWO'}</span>
            <h3>{spreadPage < 3 ? 'The Awakening' : 'Beyond the Gate'}</h3>
            <i />
          </header>
          <p className={styles.dropCap}>
            {spreadPage < 3
              ? 'The morning mist curled around the ancient spires of Eldorfall, where legends slept beneath layers of time. At the forest’s edge, the castle stood silent against the first light of dawn.'
              : 'Beyond the gate, the world was different. A thousand paths wound through the valley, and every one of them held a story waiting to be told.'}
          </p>
          <p>
            He tightened the worn leather strap of his satchel. The journey ahead would change
            everything.
          </p>
          <span className={styles.pageNumber}>{spreadPage}</span>
        </article>
        <article className={cn(styles.paper, styles.illustratedPage)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/hero/dashboard.webp"
            alt="Sample chapter illustration of a misty fantasy castle"
          />
          <span className={styles.pageNumber}>{spreadPage + 1}</span>
        </article>
      </div>
    </div>
  );
}

function SampleCover({ side = 'front' }: { side?: 'front' | 'back' | 'spine' }) {
  return (
    <div className={cn(styles.sampleCover, side === 'spine' && styles.sampleSpine)}>
      <small>THE SHADOW CHRONICLES</small>
      {side === 'back' ? (
        <p>
          Some stories are hidden.
          <br />
          Others are waiting
          <br />
          to be awakened.
        </p>
      ) : (
        <strong>
          THE THIRD
          <br />
          DAUGHTER
        </strong>
      )}
      <span>MORGAN HAYES</span>
    </div>
  );
}

export function KdpPreview(props: PreviewProps) {
  // Keep navigation, review ticks and PDF state scoped to the selected book.
  return (
    <PreviewWorkspace key={`${props.selectedId ?? 'sample'}:${props.pdfUrl ?? ''}`} {...props} />
  );
}

function PreviewWorkspace({
  books,
  selectedId,
  pdfUrl,
  downloadUrl,
  checks,
  ebookHtml,
  pageCount,
  coverUrl,
  wrapUrl,
  seriesId,
  bookTitle,
  author,
  trimLabel = '6 × 9 in',
  bleed = false,
}: PreviewProps) {
  const router = useRouter();
  const sample = !selectedId;
  const [mode, setMode] = useState<'ebook' | 'print' | 'cover'>('ebook');
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [thumbs, setThumbs] = useState<string[]>([]);
  const [showThumbs, setShowThumbs] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [showIssues, setShowIssues] = useState(false);
  const [coverSide, setCoverSide] = useState<'front' | 'back' | 'spine'>('front');
  const [threeD, setThreeD] = useState(true);
  const [reviewed, setReviewed] = useState<string[]>([]);
  const loading = Boolean(pdfUrl) && !doc && !error;
  const total = sample ? 4 : (doc?.numPages ?? pageCount ?? 0);
  const canPaginate = sample || (mode === 'print' && Boolean(doc));
  const failed = checks.filter((check) => check.status === 'fail');
  const warnings = checks.filter((check) => check.status === 'warn');
  const ready = !sample && checks.length > 0 && failed.length === 0 && warnings.length === 0;
  const exportHref = seriesId ? `/series/${seriesId}/exports` : '/create-series';
  const ebookDocument = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>html{color-scheme:light}body{margin:0;padding:36px;color:#26231f;background:#faf8f3;font: ${16 * zoom}px/1.8 Georgia,serif;overflow-wrap:anywhere}h1,h2,h3{text-align:center;line-height:1.4}img{max-width:100%;height:auto}a{color:#315e92}hr{border:0;border-top:1px solid #ccc}nav{font-size:.9em}</style></head><body>${ebookHtml}</body></html>`;

  useEffect(() => {
    if (!pdfUrl) return;
    let cancelled = false;
    const loadingTask = pdfjs.getDocument({ url: pdfUrl });
    void loadingTask.promise
      .then(async (loaded) => {
        if (cancelled) return;
        setDoc(loaded);
        const previews: string[] = [];
        for (let index = 1; index <= Math.min(loaded.numPages, 12); index++) {
          if (cancelled) return;
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
      void loadingTask.destroy();
    };
  }, [pdfUrl]);

  function manuscript() {
    if (mode === 'cover') return <div className={styles.largeCover}>{coverPreview()}</div>;
    if (sample) return <SampleSpread page={page} zoom={zoom} />;
    if (mode === 'ebook')
      return ebookHtml ? (
        <iframe
          title="Kindle ebook manuscript"
          sandbox=""
          srcDoc={ebookDocument}
          className={styles.ebook}
        />
      ) : (
        <div className={styles.viewerMessage}>
          <BookOpen />
          <p>No manuscript yet. Generate this book to preview it.</p>
        </div>
      );
    if (loading)
      return (
        <div className={styles.viewerMessage}>
          <Loader2 className="animate-spin" />
          <p>Rendering your print PDF…</p>
        </div>
      );
    if (error)
      return (
        <div className={styles.viewerMessage} role="alert">
          <AlertTriangle />
          <p>Could not load the print PDF.</p>
          <small>{error}</small>
          <button onClick={() => router.refresh()}>Reload preview</button>
        </div>
      );
    if (doc) return <PdfPage doc={doc} page={page} zoom={zoom} />;
    return (
      <div className={styles.viewerMessage}>
        <FileText />
        <p>Export a print PDF to preview your paperback.</p>
        <Link href={exportHref}>
          Go to book exports <ArrowRight size={14} />
        </Link>
      </div>
    );
  }

  function coverPreview() {
    if (sample) return <SampleCover side={coverSide} />;
    if (coverSide === 'front' && coverUrl)
      return (
        <div className={cn(styles.realCover, threeD && styles.book3d)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={coverUrl}
            alt={`${bookTitle ?? 'Book'} front cover${author ? ` by ${author}` : ''}`}
          />
        </div>
      );
    return (
      <div className={styles.coverEmpty}>
        <ImageIcon />
        <p>
          {coverSide === 'front'
            ? 'Your cover goes here'
            : `Review the ${coverSide} in your paperback wrap`}
        </p>
        <Link
          href={coverSide !== 'front' && wrapUrl ? wrapUrl : '/cover-studio'}
          target={coverSide !== 'front' && wrapUrl ? '_blank' : undefined}
          rel="noreferrer"
        >
          {coverSide !== 'front' && wrapUrl ? 'Open paperback wrap' : 'Open Cover Studio'}{' '}
          <ArrowRight size={12} />
        </Link>
      </div>
    );
  }

  function toolbar() {
    return (
      <div className={styles.viewerToolbar}>
        <div className={styles.controlGroup}>
          <button
            aria-label="Zoom out"
            onClick={() => setZoom((value) => Math.max(0.6, +(value - 0.1).toFixed(1)))}
            disabled={mode === 'cover' || zoom <= 0.6}
          >
            <Minus />
          </button>
          <span>{Math.round(zoom * 100)}%</span>
          <button
            aria-label="Zoom in"
            onClick={() => setZoom((value) => Math.min(2, +(value + 0.1).toFixed(1)))}
            disabled={mode === 'cover' || zoom >= 2}
          >
            <Plus />
          </button>
        </div>
        <div className={styles.controlGroup}>
          <button
            aria-label="Previous page"
            disabled={!canPaginate || page <= 1}
            onClick={() => setPage((value) => Math.max(1, value - 1))}
          >
            <ChevronLeft />
          </button>
          <span aria-live="polite">
            {canPaginate ? `${page} / ${total}` : mode === 'ebook' ? 'Reflowable' : '—'}
          </span>
          <button
            aria-label="Next page"
            disabled={!canPaginate || page >= total}
            onClick={() => setPage((value) => Math.min(total, value + 1))}
          >
            <ChevronRight />
          </button>
        </div>
        <button className={styles.fitButton} onClick={() => setZoom(1)} disabled={mode === 'cover'}>
          <Maximize2 /> Fit Width
        </button>
        <button
          aria-label="Toggle page thumbnails"
          aria-pressed={showThumbs}
          onClick={() => setShowThumbs((value) => !value)}
          disabled={!canPaginate}
        >
          <LayoutGrid />
        </button>
      </div>
    );
  }

  return (
    <div className={styles.workspace}>
      <section className={styles.hero}>
        <div className={styles.heroText}>
          <span className={styles.eyebrow}>
            <Sparkles size={13} /> YOUR FINAL LOOK BEFORE PUBLISHING
          </span>
          <h1>
            KDP <span>Preview</span>
          </h1>
          <p>See your book through your readers’ eyes.</p>
          <p className={styles.heroSub}>
            Catch detail and resolve issues before your publishing handoff.
          </p>
        </div>
        <div className={styles.features}>
          {[
            {
              icon: FileText,
              title: 'Accurate Book Preview',
              text: 'Inspect your exported book',
              tone: 'cyan',
            },
            {
              icon: Check,
              title: 'Check for Issues',
              text: 'Find and fix problems',
              tone: 'purple',
            },
            {
              icon: ImageIcon,
              title: 'Print-Ready Validation',
              text: 'Review book specifications',
              tone: 'orange',
            },
            {
              icon: ShieldCheck,
              title: 'Publish with Confidence',
              text: 'Review before continuing',
              tone: 'green',
            },
          ].map((item) => (
            <div key={item.title} className={styles.feature}>
              <span className={cn(styles.iconTile, styles[item.tone])}>
                <item.icon />
              </span>
              <div>
                <strong>{item.title}</strong>
                <small>{item.text}</small>
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className={styles.formatBar}>
        <div className={styles.formatTabs} aria-label="Preview format">
          {(
            [
              { value: 'ebook', label: 'Kindle eBook', icon: FileText },
              { value: 'print', label: 'Paperback', icon: BookOpen },
              { value: 'cover', label: 'Cover Preview', icon: ImageIcon },
            ] as const
          ).map((tab) => (
            <button
              type="button"
              key={tab.value}
              aria-pressed={mode === tab.value}
              className={cn(styles.formatTab, mode === tab.value && styles.activeTab)}
              onClick={() => setMode(tab.value)}
            >
              <tab.icon />
              {tab.label}
            </button>
          ))}
        </div>
        <label className={styles.bookSelect}>
          Book
          <select
            aria-label="Choose a book"
            value={selectedId ?? ''}
            onChange={(event) =>
              router.push(`/kdp-preview?book=${encodeURIComponent(event.target.value)}`)
            }
          >
            {sample && <option value="">Sample: The Shadow Chronicles</option>}
            {books.map((book) => (
              <option key={book.id} value={book.id}>
                {book.label}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className={styles.neonButton} onClick={() => setExpanded(true)}>
          <Eye /> Open Previewer
        </button>
      </div>

      <div className={styles.columns}>
        <section
          className={cn(styles.panel, styles.manuscriptPanel)}
          aria-labelledby="manuscript-title"
        >
          <h2 id="manuscript-title">
            <BookOpen /> {mode === 'cover' ? 'Cover Preview' : 'Manuscript Preview'}{' '}
            <span>
              ({mode === 'print' ? 'Paperback' : mode === 'cover' ? 'Cover' : 'Kindle eBook'})
            </span>
          </h2>
          <div className={styles.viewer}>
            {toolbar()}
            <div className={styles.viewerBody}>
              {showThumbs && canPaginate && (
                <div className={styles.thumbnails} aria-label="Manuscript pages">
                  {sample
                    ? Array.from({ length: 4 }, (_, index) => (
                        <button
                          key={index}
                          aria-label={`Go to page ${index + 1}`}
                          aria-current={page === index + 1 ? 'page' : undefined}
                          onClick={() => setPage(index + 1)}
                        >
                          <div
                            className={cn(styles.miniPaper, index === 1 && styles.miniIllustration)}
                          >
                            {index !== 1 && (
                              <>
                                <b />
                                <i />
                                <i />
                                <i />
                                <i />
                                <i />
                                <i />
                              </>
                            )}
                          </div>
                          <span>{index + 1}</span>
                        </button>
                      ))
                    : thumbs.map((thumb, index) => (
                        <button
                          key={index}
                          aria-label={`Go to page ${index + 1}`}
                          aria-current={page === index + 1 ? 'page' : undefined}
                          onClick={() => setPage(index + 1)}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={thumb} alt="" />
                          <span>{index + 1}</span>
                        </button>
                      ))}
                </div>
              )}
              <div className={styles.manuscript}>{manuscript()}</div>
            </div>
          </div>
          <div className={styles.viewerActions}>
            {pdfUrl ? (
              <a href={pdfUrl} download>
                <Download /> Download Preview (PDF)
              </a>
            ) : (
              <Link href={exportHref}>
                <Download /> {sample ? 'Create Your Book' : 'Export Preview (PDF)'}
              </Link>
            )}
            {downloadUrl ? (
              <a href={downloadUrl} download>
                <FileText /> Download Book Files
              </a>
            ) : (
              <Link href={exportHref}>
                <FileText /> {sample ? 'Create Book Files' : 'Export Book Files'}
              </Link>
            )}
            <Link href="/publishing">
              <ShieldCheck /> Check Guidelines
            </Link>
          </div>
        </section>

        <div className={styles.middleColumn}>
          <section className={cn(styles.panel, styles.coverPanel)} aria-labelledby="cover-title">
            <div className={styles.panelHeading}>
              <h2 id="cover-title">
                <ImageIcon /> Cover Preview
              </h2>
              <button
                className={styles.view3d}
                aria-pressed={threeD}
                onClick={() => setThreeD((value) => !value)}
              >
                <Maximize2 /> {threeD ? '3D View' : 'Flat View'}
              </button>
            </div>
            <div className={cn(styles.coverStage, threeD && sample && styles.sample3d)}>
              {coverPreview()}
            </div>
            <div className={styles.coverTabs}>
              {(['front', 'back', 'spine'] as const).map((side) => (
                <button
                  key={side}
                  aria-pressed={coverSide === side}
                  onClick={() => setCoverSide(side)}
                >
                  <span
                    className={cn(styles.coverSwatch, side === 'spine' && styles.spineSwatch)}
                  />
                  {side === 'front' ? 'Front Cover' : side === 'back' ? 'Back Cover' : 'Spine'}
                </button>
              ))}
            </div>
          </section>

          <section className={styles.validation} aria-labelledby="validation-title">
            <div className={styles.validationHeading}>
              <span className={cn(styles.iconTile, ready || sample ? styles.green : styles.orange)}>
                {ready || sample ? <Check /> : <AlertTriangle />}
              </span>
              <div>
                <h2 id="validation-title">Validation Results</h2>
                <p>
                  {sample
                    ? 'Review your selected book’s actual checks.'
                    : ready
                      ? 'All available preflight checks passed.'
                      : `${failed.length} blocking · ${warnings.length} to review`}
                </p>
              </div>
            </div>
            <div className={styles.checkResults}>
              {sample
                ? sampleChecks.map((label) => (
                    <div key={label}>
                      <Circle />
                      <span>{label}</span>
                      <small>Not checked</small>
                    </div>
                  ))
                : checks.map((check) => (
                    <details key={check.id} className={styles.resultDetail}>
                      <summary>
                        <span
                          className={cn(
                            styles.resultIcon,
                            check.status === 'pass'
                              ? styles.pass
                              : check.status === 'fail'
                                ? styles.fail
                                : styles.warn,
                          )}
                        >
                          {check.status === 'pass' ? <CheckCircle2 /> : <AlertTriangle />}
                        </span>
                        <span>{check.label}</span>
                        <small>
                          {check.status === 'pass'
                            ? 'Passed'
                            : check.status === 'fail'
                              ? 'Fix needed'
                              : 'Review'}
                        </small>
                      </summary>
                      <p>{check.detail}</p>
                    </details>
                  ))}
            </div>
          </section>
          <button type="button" className={styles.fixButton} onClick={() => setShowIssues(true)}>
            <WandSparkles /> Fix Issues
          </button>
        </div>

        <div className={styles.rightColumn}>
          <section className={cn(styles.panel, styles.specs)} aria-labelledby="specs-title">
            <h2 id="specs-title">
              <FileText /> Book Specifications
            </h2>
            {[
              {
                label: 'Trim Size',
                value: trimLabel,
                hint: sample ? 'Sample dimensions' : 'Series settings',
                icon: FileText,
                tone: 'purple',
              },
              {
                label: 'Page Count',
                value: sample ? '4 sample pages' : total ? `${total} pages` : 'Export to calculate',
                icon: FileText,
                tone: 'blue',
              },
              {
                label: 'Bleed',
                value: sample ? 'From book settings' : bleed ? 'With bleed' : 'No bleed',
                icon: ImageIcon,
                tone: 'pink',
              },
              {
                label: 'Margins',
                value: sample
                  ? 'Review required'
                  : (checks.find((check) => check.id === 'gutter')?.detail ?? 'Review required'),
                icon: BookOpen,
                tone: 'orange',
              },
              {
                label: 'File Size',
                value: pdfUrl ? 'See exported PDF' : 'From actual export',
                icon: FileText,
                tone: 'blue',
              },
              {
                label: 'Print-Ready',
                value: sample ? 'Not validated' : ready ? 'Preflight passed' : 'Review required',
                icon: Check,
                tone: 'green',
              },
            ].map((spec) => (
              <div key={spec.label} className={styles.specRow}>
                <span className={cn(styles.iconTile, styles[spec.tone])}>
                  <spec.icon />
                </span>
                <span>{spec.label}</span>
                <div>
                  <strong>{spec.value}</strong>
                  {spec.hint && <small>{spec.hint}</small>}
                </div>
              </div>
            ))}
          </section>
          <section className={cn(styles.panel, styles.checklist)} aria-labelledby="checklist-title">
            <h2 id="checklist-title">
              <Check /> Preview Checklist
            </h2>
            {reviewItems.map((item) => (
              <label key={item}>
                <input
                  type="checkbox"
                  checked={reviewed.includes(item)}
                  onChange={(event) =>
                    setReviewed((current) =>
                      event.target.checked
                        ? [...current, item]
                        : current.filter((value) => value !== item),
                    )
                  }
                />
                <span>{item}</span>
              </label>
            ))}
            <p aria-live="polite">
              {reviewed.length} of {reviewItems.length} reviewed
            </p>
          </section>
          <Link href="/publishing" className={styles.neonButton}>
            <Send /> Continue to Publishing
          </Link>
        </div>
      </div>
      <p className={styles.footnote}>
        {sample
          ? 'Sample book and layout only. Validation results must come from your actual book.'
          : 'Preflight checks help you review your export. Confirm the final layout in KDP’s own previewer before publishing.'}
      </p>

      <Dialog open={expanded} onOpenChange={setExpanded}>
        <DialogContent
          title={`${sample ? 'Sample book' : (bookTitle ?? 'Book')} · ${mode === 'print' ? 'Paperback' : mode === 'cover' ? 'Cover' : 'Kindle eBook'}`}
          description="Inspect your manuscript and cover before publishing."
          className={styles.previewDialog}
        >
          <div className={styles.workspace}>
            {toolbar()}
            <div className={styles.expandedManuscript}>{manuscript()}</div>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={showIssues} onOpenChange={setShowIssues}>
        <DialogContent
          title="Review and fix issues"
          description={
            sample
              ? 'Choose a generated book to run actual preflight checks.'
              : 'Resolve these items, then export your book again.'
          }
        >
          {sample ? (
            <Link className={styles.issueLink} href="/create-series">
              Create your first book <ArrowRight size={16} />
            </Link>
          ) : (
            <div className={styles.issuesList}>
              {checks
                .filter((check) => check.status !== 'pass')
                .map((check) => (
                  <div key={check.id}>
                    <strong>{check.label}</strong>
                    <p>{check.detail}</p>
                  </div>
                ))}
              {ready && (
                <p>All available checks passed. Complete your visual review before continuing.</p>
              )}
              <Link className={styles.issueLink} href={exportHref}>
                Open book exports <ArrowRight size={16} />
              </Link>
              <Link className={styles.issueLink} href="/cover-studio">
                Open Cover Studio <ArrowRight size={16} />
              </Link>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
