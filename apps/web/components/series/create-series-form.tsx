'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  BookOpen,
  BookText,
  Check,
  ChevronDown,
  Coins,
  Library,
  Loader2,
  LockKeyhole,
  PenLine,
  Plus,
  ShieldCheck,
  Sparkles,
  Wand2,
} from 'lucide-react';
import { GENRES, LENGTH_PRESETS, type LengthPreset, type Suggestions } from '@booksaga/shared';
import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Label, Select } from '@/components/ui/input';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { JobProgressDialog } from '@/components/jobs/job-progress-dialog';
import { useJob } from '@/components/jobs/use-job';
import { createSeriesAction, enhanceIdeaAction, suggestIdeasAction } from '@/lib/series/actions';
import {
  AUDIENCES,
  DEFAULT_SERIES_SETTINGS,
  TONES,
  type CreateSeriesInput,
  type JobSnapshot,
  type SeriesSettings,
} from '@/lib/series/validation';
import { cn } from '@/lib/utils';
import styles from './create-series.module.css';

export interface CreateSeriesFormProps {
  penNames: string[];
  credits: number;
  costs: { short: number; standard: number; full: number; enhance: number };
  lengthPresets: LengthPreset[];
  maxBooksPerSeries: number;
  initialGeneration?: { jobId: string; seriesId: string } | null;
  /** Prefill from a template or DFY idea. */
  defaults?: {
    idea?: string;
    genre?: string;
    plannedBooks?: number;
    lengthPreset?: LengthPreset;
  };
}

const fictionGenres = GENRES.filter((g) => g.isFiction);
const nonFictionGenres = GENRES.filter((g) => !g.isFiction);

export function CreateSeriesForm({
  penNames,
  credits,
  costs,
  lengthPresets,
  maxBooksPerSeries,
  defaults,
  initialGeneration,
}: CreateSeriesFormProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const matchedGenre = GENRES.find(
    (genre) =>
      genre.label.toLowerCase() === (defaults?.genre ?? '').toLowerCase() ||
      genre.id.toLowerCase() === (defaults?.genre ?? '').toLowerCase(),
  );

  const [idea, setIdea] = useState(defaults?.idea ?? '');
  const [title, setTitle] = useState('');
  const [penName, setPenName] = useState(penNames[0] ?? '');
  const [genre, setGenre] = useState(matchedGenre?.id ?? GENRES[0]?.id ?? 'fantasy');
  const [tone, setTone] = useState<string>(TONES[0]);
  const [audience, setAudience] = useState<string>(AUDIENCES[4] ?? 'Adults');
  const maxPlanned = Math.min(12, maxBooksPerSeries);
  const defaultPlanned = defaults?.plannedBooks ?? 5;
  const [plannedBooks, setPlannedBooks] = useState(() =>
    Math.min(
      maxPlanned,
      Math.max(3, Number.isFinite(defaultPlanned) ? Math.trunc(defaultPlanned) : 5),
    ),
  );
  const [lengthPreset, setLengthPreset] = useState<LengthPreset>(
    defaults?.lengthPreset && lengthPresets.includes(defaults.lengthPreset)
      ? defaults.lengthPreset
      : (lengthPresets[0] ?? 'short'),
  );
  const [bookTitle, setBookTitle] = useState('');
  const [settings, setSettings] = useState<SeriesSettings>(DEFAULT_SERIES_SETTINGS);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [enhanceJob, setEnhanceJob] = useState<string | null>(null);
  const [generateJob, setGenerateJob] = useState(initialGeneration ?? null);
  const [generationOpen, setGenerationOpen] = useState(Boolean(initialGeneration));
  const generationTracking = useJob(generateJob?.jobId ?? null);
  const generation = generationTracking.job;
  const settledGeneration = useRef<string | null>(null);
  const [enhanced, setEnhanced] = useState<{
    concept: string;
    titles: string[];
    tone: string;
  } | null>(null);
  const [suggestJob, setSuggestJob] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestions['suggestions']>([]);
  const [success, setSuccess] = useState<string | null>(null);

  const bookCost = costs[lengthPreset] ?? costs.short;
  const canAfford = credits >= bookCost;
  const generationTerminal =
    generation?.status === 'completed' ||
    generation?.status === 'failed' ||
    generation?.status === 'cancelled';
  const generationPending = Boolean(generateJob) && !generationTerminal;
  const generationProgress = Math.min(100, Math.max(0, generation?.progress ?? 0));
  const chaptersDone =
    typeof generation?.meta.chaptersDone === 'number' ? generation.meta.chaptersDone : null;
  const chaptersTotal =
    typeof generation?.meta.chaptersTotal === 'number' ? generation.meta.chaptersTotal : null;
  const chapterNumber =
    typeof generation?.meta.chapterNumber === 'number' ? generation.meta.chapterNumber : null;

  useEffect(() => {
    if (!generateJob || !generation || generation.status !== 'completed') return;
    if (settledGeneration.current === generation.id) return;
    settledGeneration.current = generation.id;
    setGenerationOpen(false);
    setSuccess(generateJob.seriesId);
    router.refresh();
  }, [generateJob, generation, router]);

  const lengthOptions = useMemo(
    () =>
      (['short', 'standard', 'full'] as LengthPreset[]).map((key) => ({
        ...LENGTH_PRESETS[key],
        cost: costs[key],
        locked: !lengthPresets.includes(key),
      })),
    [costs, lengthPresets],
  );

  function handleEnhance() {
    setError(null);
    startTransition(async () => {
      const result = await enhanceIdeaAction({ idea, genre, tone, audience });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setEnhanceJob(result.data.jobId);
    });
  }

  function handleSuggestions() {
    setError(null);
    startTransition(async () => {
      const result = await suggestIdeasAction({ idea, genre });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setSuggestJob(result.data.jobId);
    });
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (pending) return;
    if (generateJob) {
      setGenerationOpen(true);
      return;
    }
    setError(null);

    const payload: CreateSeriesInput = {
      idea,
      title,
      penName,
      genre,
      tone,
      audience,
      plannedBooks,
      lengthPreset,
      bookTitle: bookTitle || undefined,
      settings,
    };

    startTransition(async () => {
      const result = await createSeriesAction(payload);
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setGenerateJob({ jobId: result.data.jobId, seriesId: result.data.seriesId });
      setGenerationOpen(true);
    });
  }

  function onEnhanceSettled(job: JobSnapshot) {
    setEnhanceJob(null);
    if (job.status !== 'completed') {
      if (job.error) setError(job.error);
      return;
    }
    const result = job.meta.result as
      { concept: string; titles: string[]; tone: string } | undefined;
    if (result) setEnhanced(result);
  }

  function onSuggestionsSettled(job: JobSnapshot) {
    setSuggestJob(null);
    if (job.status !== 'completed') return;
    const result = job.meta.result as Suggestions | undefined;
    if (result?.suggestions) setSuggestions(result.suggestions);
  }

  function closeGeneration() {
    setGenerationOpen(false);
    if (generationTerminal) setGenerateJob(null);
  }

  return (
    <>
      {generateJob ? (
        <Card className={cn(styles.panel, 'mb-6')}>
          <CardHeader>
            <CardTitle>
              {generation?.status === 'completed'
                ? 'Part 1 is ready'
                : generation?.status === 'failed'
                  ? 'Book generation failed'
                  : generation?.status === 'cancelled'
                    ? 'Book generation cancelled'
                    : generation?.status === 'queued'
                      ? 'Your book is queued'
                      : generation?.status === 'active'
                        ? `Writing your book · ${generationProgress}%`
                        : 'Loading your book progress'}
            </CardTitle>
            <CardDescription aria-live="polite">
              {generation?.status === 'queued'
                ? 'Waiting for the writing worker. You can close progress or leave this page without losing your place.'
                : generation?.status === 'failed'
                  ? (generation.error ??
                    'Generation stopped. Dismiss this update to start a new request.')
                  : generation?.status === 'cancelled'
                    ? 'Generation has stopped. Dismiss this update to start a new request.'
                    : generation?.status === 'completed'
                      ? 'Your series bible and Part 1 are saved. Open your roadmap to continue.'
                      : (generation?.stepLabel ?? 'Retrieving the latest saved progress.')}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {generation?.status === 'active' ? (
              <>
                <progress
                  className="h-2 w-full accent-violet-400"
                  max={100}
                  value={generationProgress}
                  aria-label="Book generation progress"
                />
                {chaptersDone !== null && chaptersTotal !== null ? (
                  <p className="text-sm text-muted-foreground">
                    {chaptersDone} of {chaptersTotal} chapters saved
                    {chapterNumber !== null && chapterNumber > chaptersDone
                      ? ` · Writing chapter ${chapterNumber}`
                      : ''}
                  </p>
                ) : null}
              </>
            ) : null}
            {generationTracking.error ? (
              <p role="alert" className="text-sm text-amber-300">
                {generationTracking.error} Your request is still tracked; do not generate it again.
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="secondary" onClick={() => setGenerationOpen(true)}>
                View progress
              </Button>
              <Button variant="secondary" asChild>
                <Link href={`/series/${generateJob.seriesId}`}>View roadmap</Link>
              </Button>
              {generationTerminal ? (
                <Button type="button" variant="ghost" onClick={closeGeneration}>
                  Dismiss update
                </Button>
              ) : null}
            </div>
          </CardContent>
        </Card>
      ) : null}
      <form onSubmit={handleSubmit} className={styles.form}>
        <div className={styles.formMain}>
          <Card className={styles.panel}>
            <CardHeader className={styles.panelHeader}>
              <div className={styles.sectionHeading}>
                <span className={styles.sectionNumber} aria-hidden="true">
                  01
                </span>
                <div>
                  <CardTitle>Your series idea</CardTitle>
                  <CardDescription>
                    Set the direction. Your story and style carry through every book.
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className={styles.panelContent}>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="idea">Series idea / concept *</Label>
                <textarea
                  id="idea"
                  required
                  aria-describedby="idea-help idea-count"
                  minLength={40}
                  maxLength={2000}
                  rows={5}
                  value={idea}
                  onChange={(e) => setIdea(e.target.value)}
                  placeholder="A harbour city where debts are inherited like weather. When a reclusive bookkeeper dies, her estranged niece inherits a ledger that proves half the city's founding families bought their reputations…"
                  className="w-full resize-y rounded-lg border border-input bg-background/60 p-3 text-sm placeholder:text-muted-foreground/60 focus-visible:border-ring"
                />
                <div className={styles.ideaMeta}>
                  <span id="idea-help">A setting, a central idea, and what happens next.</span>
                  <span id="idea-count">{idea.length} / 2000</span>
                </div>
              </div>

              <div className={styles.fields}>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="title">Series title *</Label>
                  <Input
                    id="title"
                    required
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="The Ledger of Small Debts"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="penName">Author / pen name *</Label>
                  <Input
                    id="penName"
                    required
                    list="pen-names"
                    value={penName}
                    onChange={(e) => setPenName(e.target.value)}
                    placeholder="Your author name"
                  />
                  <datalist id="pen-names">
                    {penNames.map((name) => (
                      <option key={name} value={name} />
                    ))}
                  </datalist>
                </div>
              </div>

              <div className={styles.fields}>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="genre">Genre *</Label>
                  <Select id="genre" value={genre} onChange={(e) => setGenre(e.target.value)}>
                    <optgroup label="Fiction">
                      {fictionGenres.map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.label}
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="Non-fiction">
                      {nonFictionGenres.map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.label}
                        </option>
                      ))}
                    </optgroup>
                  </Select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="audience">Target audience</Label>
                  <Select
                    id="audience"
                    value={audience}
                    onChange={(e) => setAudience(e.target.value)}
                  >
                    {AUDIENCES.map((a) => (
                      <option key={a} value={a}>
                        {a}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>

              <div className={styles.fields}>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="tone">Tone / writing style</Label>
                  <Select id="tone" value={tone} onChange={(e) => setTone(e.target.value)}>
                    {TONES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="plannedBooks">Planned books</Label>
                  <Input
                    id="plannedBooks"
                    type="number"
                    min={3}
                    max={maxPlanned}
                    value={plannedBooks}
                    onChange={(e) => setPlannedBooks(Number(e.target.value))}
                  />
                  <p className="text-xs text-muted-foreground">
                    Start with {maxPlanned} or fewer; you can add more parts later.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className={styles.panel}>
            <CardHeader className={styles.panelHeader}>
              <div className={styles.sectionHeading}>
                <span className={styles.sectionNumber} aria-hidden="true">
                  02
                </span>
                <div>
                  <CardTitle>Book 1 &amp; publishing settings</CardTitle>
                  <CardDescription>
                    Choose your book length. Refine the publishing details when you&apos;re ready.
                  </CardDescription>
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setAdvancedOpen((v) => !v)}
                aria-expanded={advancedOpen}
                aria-controls="publishing-options"
                className={styles.detailsButton}
              >
                {advancedOpen ? 'Hide details' : 'More settings'} <ChevronDown aria-hidden="true" />
              </Button>
            </CardHeader>

            <CardContent className={styles.panelContent}>
              <fieldset>
                <legend className={styles.lengthLegend}>Book length</legend>
                <div className={styles.lengthGrid}>
                  {lengthOptions.map((option) => (
                    <label
                      key={option.key}
                      className={cn(
                        styles.lengthChoice,
                        option.locked && styles.lockedLength,
                        !option.locked && lengthPreset === option.key && styles.selectedLength,
                      )}
                    >
                      <input
                        type="radio"
                        name="lengthPreset"
                        className="sr-only"
                        value={option.key}
                        checked={lengthPreset === option.key}
                        disabled={option.locked}
                        onChange={() => setLengthPreset(option.key)}
                      />
                      <span className={styles.lengthTop}>
                        <span className={styles.lengthIcon}>
                          {option.locked ? (
                            <LockKeyhole aria-hidden="true" />
                          ) : option.key === 'short' ? (
                            <BookText aria-hidden="true" />
                          ) : option.key === 'standard' ? (
                            <BookOpen aria-hidden="true" />
                          ) : (
                            <Library aria-hidden="true" />
                          )}
                        </span>
                        {!option.locked && lengthPreset === option.key && (
                          <Check className={styles.lengthCheck} aria-hidden="true" />
                        )}
                      </span>
                      <span className={styles.lengthName}>
                        {option.label}
                        <span className={styles.lengthCost}>{option.cost} cr</span>
                      </span>
                      <span className={styles.lengthDescription}>{option.description}</span>
                      {option.locked ? (
                        <span className="text-xs text-amber-300">Upgrade to unlock</span>
                      ) : null}
                    </label>
                  ))}
                </div>
              </fieldset>

              {advancedOpen ? (
                <div id="publishing-options" className={cn(styles.fields, styles.advancedFields)}>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="bookTitle">Book 1 title (optional)</Label>
                    <Input
                      id="bookTitle"
                      value={bookTitle}
                      onChange={(e) => setBookTitle(e.target.value)}
                      placeholder="AI suggests one if you leave this empty"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="trim">Trim size</Label>
                    <Select
                      id="trim"
                      value={settings.trim}
                      onChange={(e) =>
                        setSettings({ ...settings, trim: e.target.value as SeriesSettings['trim'] })
                      }
                    >
                      {['5x8', '5.25x8', '5.5x8.5', '6x9'].map((t) => (
                        <option key={t} value={t}>
                          {t.replace('x', ' × ')} in
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="pov">Point of view</Label>
                    <Select
                      id="pov"
                      value={settings.pov}
                      onChange={(e) =>
                        setSettings({ ...settings, pov: e.target.value as SeriesSettings['pov'] })
                      }
                    >
                      <option value="third">Third person</option>
                      <option value="first">First person</option>
                    </Select>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="tense">Tense</Label>
                    <Select
                      id="tense"
                      value={settings.tense}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          tense: e.target.value as SeriesSettings['tense'],
                        })
                      }
                    >
                      <option value="past">Past</option>
                      <option value="present">Present</option>
                    </Select>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="paper">Paper</Label>
                    <Select
                      id="paper"
                      value={settings.paper}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          paper: e.target.value as SeriesSettings['paper'],
                        })
                      }
                    >
                      <option value="white">White</option>
                      <option value="cream">Cream</option>
                    </Select>
                  </div>
                  <label className="flex items-center gap-2 self-end text-sm">
                    <input
                      type="checkbox"
                      checked={settings.bleed}
                      onChange={(e) => setSettings({ ...settings, bleed: e.target.checked })}
                    />
                    Print with bleed
                  </label>
                </div>
              ) : null}
            </CardContent>
          </Card>

          {error ? (
            <p
              role="alert"
              className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-rose-200"
            >
              {error}
            </p>
          ) : null}

          <div className={styles.submitBar}>
            <div className={styles.submitCopy}>
              <ShieldCheck aria-hidden="true" />
              <div>
                <strong>Start with Book 1</strong>
                <p>The rest of your series unlocks as you write.</p>
              </div>
            </div>
            {generationPending ? (
              <Button type="button" size="lg" onClick={() => setGenerationOpen(true)}>
                <BookOpen aria-hidden="true" /> View progress
              </Button>
            ) : (
              <Button
                type="submit"
                size="lg"
                disabled={pending || !canAfford || Boolean(generateJob)}
              >
                {pending ? (
                  <Loader2 className="animate-spin" aria-hidden="true" />
                ) : (
                  <Wand2 aria-hidden="true" />
                )}
                Generate Part 1 · {bookCost} credits
              </Button>
            )}
          </div>
          {!canAfford ? (
            <p className="text-sm text-amber-300">
              Not enough credits for this length. Upgrade your plan or pick a shorter preset.
            </p>
          ) : null}
        </div>

        <aside className={styles.aside} aria-label="Series summary and AI tools">
          <Card className={cn(styles.panel, styles.summary)}>
            <p className={styles.summaryEyebrow}>
              <BookOpen aria-hidden="true" /> Your series at a glance
            </p>
            <h3>{title.trim() || 'Untitled series'}</h3>
            <p className={styles.summaryAuthor}>
              {penName.trim() ? `by ${penName.trim()}` : 'Add your author name'}
            </p>
            <dl>
              <div>
                <dt>Genre</dt>
                <dd>{GENRES.find((item) => item.id === genre)?.label ?? genre}</dd>
              </div>
              <div>
                <dt>Planned books</dt>
                <dd>{plannedBooks || '—'} books</dd>
              </div>
              <div>
                <dt>Book length</dt>
                <dd>{LENGTH_PRESETS[lengthPreset].label}</dd>
              </div>
            </dl>
            <div className={styles.wallet}>
              <Coins aria-hidden="true" />
              <span>
                <strong>{credits.toLocaleString('en-US')}</strong> credits available
              </span>
            </div>
          </Card>
          <Card className={styles.panel}>
            <CardHeader className={styles.assistantHeader}>
              <CardTitle>
                <Sparkles aria-hidden="true" /> Your creative assistant
              </CardTitle>
              <CardDescription>A little inspiration, without leaving your draft.</CardDescription>
            </CardHeader>
            <CardContent className={styles.assistantContent}>
              <Button
                type="button"
                variant="secondary"
                onClick={handleEnhance}
                disabled={pending || idea.trim().length < 20}
              >
                <Wand2 aria-hidden="true" /> Enhance with AI · {costs.enhance} credit
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={handleSuggestions}
                disabled={pending || idea.trim().length < 10}
                className={styles.suggestionsButton}
              >
                <Sparkles aria-hidden="true" /> AI suggestions
              </Button>

              {suggestions.length > 0 ? (
                <ul className="flex flex-col gap-2">
                  {suggestions.map((s) => (
                    <li key={s.title} className="rounded-lg border border-border/70 p-3 text-sm">
                      <p className="font-semibold">{s.title}</p>
                      <p className="text-xs text-muted-foreground">{s.detail}</p>
                      <Badge variant="muted" className="mt-2">
                        {s.kind}
                      </Badge>
                    </li>
                  ))}
                </ul>
              ) : null}

              <label className={styles.autoCover}>
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={settings.autoCovers}
                  onChange={(e) => setSettings({ ...settings, autoCovers: e.target.checked })}
                />
                <span>
                  Auto-generate covers
                  <small>A matching cover after each book (2 credits per cover).</small>
                </span>
              </label>
            </CardContent>
          </Card>
          <Card className={cn(styles.panel, styles.nextSteps)}>
            <strong>What happens next</strong>
            <ol>
              <li>
                <PenLine aria-hidden="true" />
                <span>Plan your series and build its shared bible.</span>
              </li>
              <li>
                <BookOpen aria-hidden="true" />
                <span>Write the outline and chapters of Book 1.</span>
              </li>
              <li>
                <Library aria-hidden="true" />
                <span>Open your roadmap and continue the series.</span>
              </li>
            </ol>
          </Card>

          {enhanced ? (
            <Card className={styles.panel}>
              <CardHeader>
                <CardTitle>Enhanced concept</CardTitle>
                <CardDescription>Use it as-is or keep editing.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <p className="max-h-48 overflow-y-auto text-sm text-muted-foreground">
                  {enhanced.concept}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {enhanced.titles.map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setTitle(t)}
                      className="rounded-full border border-border px-2.5 py-1 text-xs hover:bg-muted"
                    >
                      {t}
                    </button>
                  ))}
                </div>
                <Button type="button" size="sm" onClick={() => setIdea(enhanced.concept)}>
                  Use this concept
                </Button>
              </CardContent>
            </Card>
          ) : null}
        </aside>
      </form>

      <JobProgressDialog
        jobId={enhanceJob}
        title="Enhancing your idea"
        description="Expanding the concept and suggesting titles."
        onClose={() => setEnhanceJob(null)}
        onSettled={onEnhanceSettled}
      />

      <JobProgressDialog
        jobId={suggestJob}
        title="Finding story ideas"
        onClose={() => setSuggestJob(null)}
        onSettled={onSuggestionsSettled}
      />

      <JobProgressDialog
        jobId={generationOpen ? (generateJob?.jobId ?? null) : null}
        tracking={generationTracking}
        title="Writing your series"
        description="Series plan, bible, outline and every chapter of Part 1."
        onClose={closeGeneration}
      />

      <Dialog
        open={Boolean(success)}
        onOpenChange={(open) => (!open ? setSuccess(null) : undefined)}
      >
        <DialogContent title="Series foundation saved">
          <div className="flex flex-col gap-4">
            <p className="text-sm text-muted-foreground">
              Part 1 is written, the series bible is built and the roadmap is ready. You can keep
              going whenever you like.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button asChild>
                <Link href={`/series/${success}`}>View series</Link>
              </Button>
              <Button variant="secondary" asChild>
                <Link
                  href="/create-series"
                  onClick={() => {
                    setSuccess(null);
                    setGenerateJob(null);
                  }}
                >
                  <Plus aria-hidden="true" /> New series
                </Link>
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
