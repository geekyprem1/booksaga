'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toHexColor } from '@booksaga/shared';
import {
  ArrowRight,
  BookOpen,
  Check,
  CheckCircle2,
  Coins,
  Eye,
  ImageIcon,
  Loader2,
  LockKeyhole,
  Palette,
  Pencil,
  ShieldCheck,
  Sparkles,
  Unlock,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { JobProgressDialog } from '@/components/jobs/job-progress-dialog';
import { defaultCoverLayers, type CoverLayerData } from '@/components/covers/cover-editor';
import { ImageLibrary, type LibraryImage } from '@/components/covers/image-library';
import {
  generateCoverAction,
  setActiveCoverAction,
  unlockCoverStyleAction,
} from '@/lib/series/cover-actions';
import { cn } from '@/lib/utils';
import styles from './cover-studio.module.css';

// Konva touches `window` at import time, so the editor only ever loads in the browser.
const CoverEditor = dynamic(
  () => import('@/components/covers/cover-editor').then((mod) => mod.CoverEditor),
  {
    ssr: false,
    loading: () => <p className="p-6 text-sm text-muted-foreground">Loading editor…</p>,
  },
);

export interface CoverVariation {
  id: string;
  url: string | null;
  artUrl: string | null;
  layers: CoverLayerData[];
  fontFamily: 'serif' | 'sans' | 'display';
  textMode: 'overlay' | 'ai';
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
  images,
}: {
  seriesId: string;
  books: CoverBook[];
  credits: number;
  cost: number;
  style: { artPrompt?: string; palette?: string[] } | null;
  seriesTitle: string;
  author: string;
  images: LibraryImage[];
}) {
  const router = useRouter();
  const [job, setJob] = useState<{ jobId: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<CoverVariation | null>(null);
  const [previewing, setPreviewing] = useState<{ title: string; url: string } | null>(null);
  const [libraryFor, setLibraryFor] = useState<{ bookId: string; title: string } | null>(null);
  const [textMode, setTextMode] = useState<'overlay' | 'ai'>('overlay');
  const [filter, setFilter] = useState<'all' | 'covered' | 'uncovered'>('all');
  const covered = books.filter((book) => book.covers.length > 0);
  const visibleBooks = books.filter(
    (book) =>
      filter === 'all' || (filter === 'covered' ? covered.includes(book) : !covered.includes(book)),
  );

  async function generate(bookId: string) {
    setError(null);
    setBusy(`generate-${bookId}`);
    const response = await generateCoverAction({ bookId, textMode });
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
    setError(null);
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
    <div className={styles.studio}>
      <section className={styles.hero} aria-labelledby="cover-collection-title">
        <div className={styles.heroCopy}>
          <h2 id="cover-collection-title">
            <Palette aria-hidden="true" /> Cover Studio
          </h2>
          <p>
            {covered.length} of {books.length} books with covers
          </p>
        </div>
        <div className={styles.collectionSummary}>
          <div className={styles.wallet}>
            <Coins aria-hidden="true" />
            <span>
              <strong>{credits.toLocaleString('en-US')}</strong> credits available
            </span>
          </div>
        </div>
      </section>

      <section className={styles.directionBar} aria-label="Series art direction">
        <div className={styles.directionIcon}>
          <Palette aria-hidden="true" />
        </div>
        <div className={styles.directionCopy}>
          <div className={styles.directionTitle}>
            <strong>Series art direction</strong>
            <span className={cn(styles.styleStatus, style?.artPrompt && styles.styleLocked)}>
              {style?.artPrompt ? (
                <LockKeyhole aria-hidden="true" />
              ) : (
                <Sparkles aria-hidden="true" />
              )}
              {style?.artPrompt ? 'Style locked' : 'Ready to create'}
            </span>
          </div>
          {style?.artPrompt ? (
            <div className={styles.palette}>
              {(style.palette ?? []).length ? (
                style.palette!.map((color, index) => (
                  <span key={`${color}-${index}`}>
                    <i style={{ backgroundColor: toHexColor(color) }} aria-hidden="true" />
                    {color}
                  </span>
                ))
              ) : (
                <span>A shared visual style for every book in this series.</span>
              )}
            </div>
          ) : (
            <p>Your first generated cover sets the visual style for the series.</p>
          )}
        </div>
        {style?.artPrompt && (
          <button
            type="button"
            className={styles.unlockButton}
            onClick={unlockStyle}
            disabled={busy !== null}
          >
            {busy === 'unlock' ? (
              <Loader2 className="animate-spin" aria-hidden="true" />
            ) : (
              <Unlock aria-hidden="true" />
            )}{' '}
            Unlock style
          </button>
        )}
        <div className={styles.textSetting}>
          <label htmlFor="cover-text-mode">Cover typography</label>
          <select
            id="cover-text-mode"
            value={textMode}
            onChange={(event) => setTextMode(event.target.value as 'overlay' | 'ai')}
          >
            <option value="overlay">Engine · crisp & editable</option>
            <option value="ai">AI · integrated into artwork</option>
          </select>
        </div>
      </section>

      {error ? (
        <p
          role="alert"
          className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-rose-200"
        >
          {error}
        </p>
      ) : null}

      <div className={styles.galleryToolbar}>
        <div>
          <h2>
            Your book covers <span>{books.length}</span>
          </h2>
          <p>One cohesive collection. Every cover, in your control.</p>
        </div>
        <div className={styles.filters} aria-label="Filter book covers">
          {(
            [
              { id: 'all', label: 'All books', count: books.length },
              { id: 'covered', label: 'With covers', count: covered.length },
              { id: 'uncovered', label: 'Needs cover', count: books.length - covered.length },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={filter === item.id}
              onClick={() => setFilter(item.id)}
            >
              {item.label}
              <span>{item.count}</span>
            </button>
          ))}
        </div>
      </div>

      <div className={styles.gallery} role="region" aria-label="Covers in this series" tabIndex={0}>
        {visibleBooks.map((book) => {
          const active =
            book.covers.find((cover) => cover.isActive && cover.url) ??
            book.covers.find((cover) => cover.url) ??
            book.covers.find((cover) => cover.isActive) ??
            book.covers[0] ??
            null;
          const locked = book.status === 'locked';
          const hasCover = book.covers.length > 0;
          return (
            <article
              key={book.id}
              className={cn(
                styles.bookCard,
                hasCover && styles.coveredCard,
                locked && styles.lockedCard,
              )}
              aria-label={`Part ${book.partNumber}: ${book.title}`}
            >
              <div className={styles.cardTop}>
                <span className={styles.partLabel}>
                  BOOK <strong>{String(book.partNumber).padStart(2, '0')}</strong>
                </span>
                <span
                  className={cn(
                    styles.bookStatus,
                    hasCover
                      ? styles.coverReady
                      : locked
                        ? styles.bookLocked
                        : styles.awaitingCover,
                  )}
                >
                  {hasCover ? (
                    <CheckCircle2 aria-hidden="true" />
                  ) : locked ? (
                    <LockKeyhole aria-hidden="true" />
                  ) : (
                    <Sparkles aria-hidden="true" />
                  )}
                  {hasCover ? 'Cover ready' : locked ? 'Locked' : 'No cover'}
                </span>
              </div>

              <div className={styles.coverStage}>
                {active?.url ? (
                  <button
                    type="button"
                    className={styles.coverArtwork}
                    onClick={() => setPreviewing({ title: book.title, url: active.url! })}
                    aria-label={`Preview cover for ${book.title}`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={active.url} alt={`Cover for ${book.title}`} />
                    <span className={styles.previewHint}>
                      <Eye aria-hidden="true" /> Preview cover
                    </span>
                  </button>
                ) : (
                  <div className={styles.emptyCover}>
                    {locked ? <LockKeyhole aria-hidden="true" /> : <ImageIcon aria-hidden="true" />}
                    <strong>{book.title}</strong>
                    <span>
                      {hasCover
                        ? 'Cover preview unavailable. Reload to try again.'
                        : locked
                          ? 'Write this part to unlock its cover'
                          : 'Bring this book to life'}
                    </span>
                    <small>{author}</small>
                  </div>
                )}
              </div>

              <div className={styles.cardInfo}>
                <h3 title={book.title}>{book.title}</h3>
                <p>
                  Book {String(book.partNumber).padStart(2, '0')}
                  {hasCover ? ` · ${book.covers.length} designs` : ''}
                </p>
              </div>

              {book.covers.length > 1 && (
                <div className={styles.variationRow}>
                  <p className={styles.variationLabel}>Cover variations</p>
                  <>
                    <div
                      className={styles.variationThumbs}
                      aria-label={`Cover variations for ${book.title}`}
                    >
                      {book.covers.map((cover) => (
                        <button
                          key={cover.id}
                          type="button"
                          onClick={() => activate(cover.id)}
                          disabled={cover.isActive || busy !== null}
                          title={cover.isActive ? 'Active cover' : 'Use this variation'}
                          aria-label={
                            cover.isActive
                              ? `Active cover for ${book.title}`
                              : `Use variation ${book.covers.indexOf(cover) + 1} for ${book.title}`
                          }
                          aria-pressed={cover.isActive}
                          className={cn(
                            styles.variationThumb,
                            cover.isActive && styles.activeVariation,
                          )}
                        >
                          {cover.url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={cover.url} alt="" className="size-full object-cover" />
                          ) : null}
                          {busy === `active-${cover.id}` ? (
                            <Loader2 className="absolute inset-0 m-auto size-4 animate-spin" />
                          ) : null}
                          {cover.isActive && (
                            <span className={styles.activeTick}>
                              <Check aria-hidden="true" />
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  </>
                </div>
              )}

              <div className={styles.cardActions}>
                <Button
                  type="button"
                  size="sm"
                  variant={book.covers.length > 0 ? 'secondary' : 'default'}
                  onClick={() => generate(book.id)}
                  disabled={busy !== null || credits < cost || book.status === 'locked'}
                  className={styles.generateButton}
                  aria-label={
                    locked
                      ? 'Write this part first'
                      : `${book.covers.length ? 'New variation' : 'Generate cover'} for ${book.title} · ${cost} credits`
                  }
                >
                  {busy === `generate-${book.id}` ? (
                    <Loader2 className="animate-spin" aria-hidden="true" />
                  ) : (
                    <Sparkles aria-hidden="true" />
                  )}
                  {book.status === 'locked'
                    ? 'Locked'
                    : book.covers.length > 0
                      ? 'New variation'
                      : 'Generate cover'}
                  {book.status === 'locked' ? (
                    ''
                  ) : (
                    <span className={styles.costBadge}>{cost} cr</span>
                  )}
                </Button>

                {active?.artUrl && active.textMode !== 'ai' ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setEditing(active)}
                    aria-label={`Edit cover for ${book.title}`}
                    className={styles.editButton}
                  >
                    <Pencil aria-hidden="true" />
                    <span>Edit</span>
                  </Button>
                ) : null}
                <button
                  type="button"
                  onClick={() => setLibraryFor({ bookId: book.id, title: book.title })}
                  disabled={busy !== null || book.status === 'locked'}
                  aria-label={`Use my image for ${book.title}`}
                  title="Use an image from your library (free)"
                  className={styles.libraryButton}
                >
                  <ImageIcon aria-hidden="true" />
                  <span>My image</span>
                </button>
              </div>
              {credits < cost && !locked && (
                <p className={styles.creditWarning}>You need {cost} credits to generate a cover.</p>
              )}
            </article>
          );
        })}
      </div>

      {visibleBooks.length === 0 && (
        <div className={styles.emptyGallery}>
          <BookOpen aria-hidden="true" />
          <h3>
            {books.length === 0
              ? 'Your collection starts with a story'
              : filter === 'covered'
                ? 'Your first cover is waiting to happen'
                : 'Every book has a cover'}
          </h3>
          <p>
            {books.length === 0
              ? 'Write your first part, then give it a cover of its own.'
              : filter === 'covered'
                ? 'Generate a cover or choose an image from your library.'
                : 'Explore new variations to refine your collection.'}
          </p>
          {books.length === 0 ? (
            <Link href={`/series/${seriesId}`}>
              Open your roadmap <ArrowRight aria-hidden="true" />
            </Link>
          ) : (
            <button type="button" onClick={() => setFilter('all')}>
              Show all books <ArrowRight aria-hidden="true" />
            </button>
          )}
        </div>
      )}
      <footer className={styles.studioFooter}>
        <span>
          <ShieldCheck aria-hidden="true" /> A shared art direction keeps your collection connected.
        </span>
        <Link href="/kdp-preview">
          Preview for publishing <ArrowRight aria-hidden="true" />
        </Link>
      </footer>

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

      <ImageLibrary
        open={Boolean(libraryFor)}
        bookId={libraryFor?.bookId ?? null}
        bookTitle={libraryFor?.title ?? ''}
        images={images}
        onClose={() => setLibraryFor(null)}
        onJob={(jobId) => {
          setLibraryFor(null);
          setJob({ jobId });
        }}
      />

      <Dialog
        open={Boolean(previewing)}
        onOpenChange={(open) => (!open ? setPreviewing(null) : undefined)}
      >
        <DialogContent
          title={previewing ? `${previewing.title} — cover` : 'Cover preview'}
          className="max-w-lg"
        >
          {previewing ? (
            <div className="flex justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewing.url}
                alt={`Cover of ${previewing.title}`}
                className="max-h-[75vh] w-auto rounded-lg border border-border object-contain"
              />
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(editing)}
        onOpenChange={(open) => (!open ? setEditing(null) : undefined)}
      >
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
                      title:
                        books.find((b) => b.covers.some((c) => c.id === editing.id))?.title ??
                        'Untitled',
                      partNumber:
                        books.find((b) => b.covers.some((c) => c.id === editing.id))?.partNumber ??
                        1,
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
