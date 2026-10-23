'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Coins, Loader2, Plus, Sparkles, Wand2 } from 'lucide-react';
import {
  GENRES,
  LENGTH_PRESETS,
  type LengthPreset,
  type Suggestions,
} from '@booksaga/shared';
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Label, Select } from '@/components/ui/input';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { JobProgressDialog } from '@/components/jobs/job-progress-dialog';
import { createSeriesAction, enhanceIdeaAction, suggestIdeasAction } from '@/lib/series/actions';
import {
  AUDIENCES,
  DEFAULT_SERIES_SETTINGS,
  TONES,
  type CreateSeriesInput,
  type JobSnapshot,
  type SeriesSettings,
} from '@/lib/series/validation';

export interface CreateSeriesFormProps {
  penNames: string[];
  credits: number;
  costs: { short: number; standard: number; full: number; enhance: number };
  lengthPresets: LengthPreset[];
  maxBooksPerSeries: number;
}

const fictionGenres = GENRES.filter((g) => g.isFiction);
const nonFictionGenres = GENRES.filter((g) => !g.isFiction);

export function CreateSeriesForm({
  penNames,
  credits,
  costs,
  lengthPresets,
  maxBooksPerSeries,
}: CreateSeriesFormProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [idea, setIdea] = useState('');
  const [title, setTitle] = useState('');
  const [penName, setPenName] = useState(penNames[0] ?? '');
  const [genre, setGenre] = useState(GENRES[0]?.id ?? 'fantasy');
  const [tone, setTone] = useState<string>(TONES[0]);
  const [audience, setAudience] = useState<string>(AUDIENCES[4] ?? 'Adults');
  const [plannedBooks, setPlannedBooks] = useState(5);
  const [lengthPreset, setLengthPreset] = useState<LengthPreset>(
    lengthPresets[0] ?? 'short',
  );
  const [bookTitle, setBookTitle] = useState('');
  const [settings, setSettings] = useState<SeriesSettings>(DEFAULT_SERIES_SETTINGS);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [enhanceJob, setEnhanceJob] = useState<string | null>(null);
  const [generateJob, setGenerateJob] = useState<{ jobId: string; seriesId: string } | null>(null);
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
  const maxPlanned = Math.min(12, maxBooksPerSeries);

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
    });
  }

  function onEnhanceSettled(job: JobSnapshot) {
    setEnhanceJob(null);
    if (job.status !== 'completed') {
      if (job.error) setError(job.error);
      return;
    }
    const result = job.meta.result as
      | { concept: string; titles: string[]; tone: string }
      | undefined;
    if (result) setEnhanced(result);
  }

  function onSuggestionsSettled(job: JobSnapshot) {
    setSuggestJob(null);
    if (job.status !== 'completed') return;
    const result = job.meta.result as Suggestions | undefined;
    if (result?.suggestions) setSuggestions(result.suggestions);
  }

  function onGenerateSettled(job: JobSnapshot) {
    if (job.status === 'completed' && generateJob) {
      setSuccess(generateJob.seriesId);
      router.refresh();
    }
  }

  return (
    <>
      <form onSubmit={handleSubmit} className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Your series idea</CardTitle>
              <CardDescription>
                One idea becomes a connected series: same cast, same world, a cliffhanger per book.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="idea">Series idea / concept *</Label>
                <textarea
                  id="idea"
                  required
                  minLength={40}
                  maxLength={2000}
                  rows={5}
                  value={idea}
                  onChange={(e) => setIdea(e.target.value)}
                  placeholder="A harbour city where debts are inherited like weather. When a reclusive bookkeeper dies, her estranged niece inherits a ledger that proves half the city's founding families bought their reputations…"
                  className="w-full resize-y rounded-lg border border-input bg-background/60 p-3 text-sm placeholder:text-muted-foreground/60 focus-visible:border-ring"
                />
                <p className="text-xs text-muted-foreground">{idea.length} / 2000</p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
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

              <div className="grid gap-4 sm:grid-cols-2">
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

              <div className="grid gap-4 sm:grid-cols-2">
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

          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <div>
                <CardTitle>Book 1 &amp; publishing settings</CardTitle>
                <CardDescription>Applies to the whole series; editable later.</CardDescription>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setAdvancedOpen((v) => !v)}
                aria-expanded={advancedOpen}
              >
                {advancedOpen ? 'Hide' : 'Show'}
              </Button>
            </CardHeader>

            <CardContent className="flex flex-col gap-4">
              <fieldset className="flex flex-col gap-2">
                <legend className="mb-1 text-sm font-medium">Book length</legend>
                <div className="grid gap-2 sm:grid-cols-3">
                  {lengthOptions.map((option) => (
                    <label
                      key={option.key}
                      className={[
                        'flex cursor-pointer flex-col gap-1 rounded-xl border p-3 text-sm transition',
                        option.locked
                          ? 'cursor-not-allowed border-border/60 opacity-50'
                          : lengthPreset === option.key
                            ? 'border-primary bg-primary/10'
                            : 'border-border hover:bg-muted/40',
                      ].join(' ')}
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
                      <span className="flex items-center justify-between font-semibold">
                        {option.label}
                        <Badge variant="muted">{option.cost} cr</Badge>
                      </span>
                      <span className="text-xs text-muted-foreground">{option.description}</span>
                      {option.locked ? (
                        <span className="text-xs text-amber-300">Upgrade to unlock</span>
                      ) : null}
                    </label>
                  ))}
                </div>
              </fieldset>

              {advancedOpen ? (
                <div className="grid gap-4 sm:grid-cols-2">
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
            <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-rose-200">
              {error}
            </p>
          ) : null}

          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" size="lg" disabled={pending || !canAfford}>
              {pending ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Wand2 aria-hidden="true" />}
              Generate Part 1 · {bookCost} credits
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="lg"
              onClick={handleEnhance}
              disabled={pending || idea.trim().length < 20}
            >
              <Sparkles aria-hidden="true" /> Enhance with AI · {costs.enhance} credit
            </Button>
            <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Coins className="size-4 text-amber" aria-hidden="true" />
              {credits} credits available
            </span>
          </div>
          {!canAfford ? (
            <p className="text-sm text-amber-300">
              Not enough credits for this length. Upgrade your plan or pick a shorter preset.
            </p>
          ) : null}
        </div>

        <aside className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="size-4 text-violet-300" aria-hidden="true" /> AI Assistant &amp; Tools
              </CardTitle>
              <CardDescription>Story ideas, covers and continuity.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={handleSuggestions}
                disabled={pending || idea.trim().length < 10}
                className="justify-start"
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

              <label className="flex items-start gap-2 rounded-lg border border-border/70 p-3 text-sm">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={settings.autoCovers}
                  onChange={(e) => setSettings({ ...settings, autoCovers: e.target.checked })}
                />
                <span>
                  Auto-generate covers
                  <span className="block text-xs text-muted-foreground">
                    A matching cover after each book (2 credits per cover).
                  </span>
                </span>
              </label>

              <div className="rounded-lg border border-border/70 p-3 text-xs text-muted-foreground">
                Series Continuity and Publishing Structure unlock with the roadmap (M3).
              </div>
            </CardContent>
          </Card>

          {enhanced ? (
            <Card>
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
        jobId={generateJob?.jobId ?? null}
        title="Writing your series"
        description="Series plan, bible, outline and every chapter of Part 1."
        onClose={() => setGenerateJob(null)}
        onSettled={onGenerateSettled}
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
                <Link href="/create-series">
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
