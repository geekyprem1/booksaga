'use client';

import { useEffect, useState } from 'react';
import { diffWords } from 'diff';
import {
  Check,
  ChevronRight,
  History,
  Loader2,
  RotateCcw,
  Sparkles,
  Wand2,
  X,
} from 'lucide-react';
import type { TiptapDoc } from '@booksaga/shared';
import { Badge } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';
import { useJob } from '@/components/jobs/use-job';
import {
  applyRewriteAction,
  listVersionsAction,
  regenerateMetadataAction,
  resolveIssueAction,
  restoreVersionAction,
  rewriteChapterAction,
  updateMetadataAction,
  type ChapterVersion,
} from '@/lib/series/editor-actions';
import { cn } from '@/lib/utils';
import type { BookMetadataDraft, ContinuityIssue, EditorChapter } from './types';

type Tab = 'ai' | 'versions' | 'continuity' | 'metadata';

const TABS: { key: Tab; label: string }[] = [
  { key: 'ai', label: 'AI tools' },
  { key: 'versions', label: 'Versions' },
  { key: 'continuity', label: 'Continuity' },
  { key: 'metadata', label: 'Metadata' },
];

interface ToolsPanelProps {
  bookId: string;
  chapter: EditorChapter;
  selection: string;
  metadata: BookMetadataDraft;
  issues: ContinuityIssue[];
  onApplied: (doc: TiptapDoc, text: string) => void;
  onOpenChapter: (number: number) => void;
  onRefresh: () => void;
}

interface RewriteResult {
  doc: TiptapDoc;
  text: string;
  wordCount: number;
  mode: string;
}

export function ToolsPanel({
  bookId,
  chapter,
  selection,
  metadata,
  issues,
  onApplied,
  onOpenChapter,
  onRefresh,
}: ToolsPanelProps) {
  const [tab, setTab] = useState<Tab>('ai');

  return (
    <div className="flex min-h-0 flex-col rounded-xl border border-border bg-card">
      <div className="flex gap-1 border-b border-border px-2 pt-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            aria-current={tab === t.key ? 'page' : undefined}
            className={cn(
              '-mb-px rounded-t-lg border-b-2 px-2.5 py-2 text-xs font-semibold transition',
              tab === t.key
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {tab === 'ai' ? (
          <AiTools
            chapter={chapter}
            selection={selection}
            onApplied={onApplied}
          />
        ) : null}
        {tab === 'versions' ? <Versions chapter={chapter} onRefresh={onRefresh} /> : null}
        {tab === 'continuity' ? (
          <Continuity bookId={bookId} issues={issues} onOpenChapter={onOpenChapter} />
        ) : null}
        {tab === 'metadata' ? (
          <Metadata bookId={bookId} metadata={metadata} onRefresh={onRefresh} />
        ) : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// AI tools
// ---------------------------------------------------------------------------

function AiTools({
  chapter,
  selection,
  onApplied,
}: {
  chapter: EditorChapter;
  selection: string;
  onApplied: (doc: TiptapDoc, text: string) => void;
}) {
  const [instruction, setInstruction] = useState('');
  const [jobId, setJobId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);

  const job = useJob(jobId);
  const result =
    job?.status === 'completed'
      ? (job.meta.result as RewriteResult | undefined)
      : undefined;

  async function run(mode: 'rewrite' | 'expand' | 'shorten' | 'regenerate') {
    setError(null);
    setBusy(mode);
    const response = await rewriteChapterAction({
      chapterId: chapter.id,
      mode,
      instruction: instruction.trim() || undefined,
      selection: mode === 'regenerate' ? undefined : selection || undefined,
    });
    setBusy(null);
    if (!response.ok) {
      setError(response.error.message);
      return;
    }
    setJobId(response.data.jobId);
  }

  async function apply() {
    if (!result) return;
    setApplying(true);
    const response = await applyRewriteAction({
      chapterId: chapter.id,
      doc: result.doc,
      text: result.text,
    });
    setApplying(false);
    if (!response.ok) {
      setError(response.error.message);
      return;
    }
    onApplied(result.doc, result.text);
    setJobId(null);
  }

  const working = busy !== null || (job && job.status !== 'completed' && job.status !== 'failed');

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-muted-foreground">
        {selection
          ? `${selection.split(/\s+/).length} words selected — the AI will only change the selection.`
          : 'Nothing selected — the AI will work on the whole chapter.'}
      </p>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="instruction">Instruction (optional)</Label>
        <Input
          id="instruction"
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          placeholder="More tension, slower pace, less dialogue…"
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Button type="button" size="sm" onClick={() => run('rewrite')} disabled={!!working}>
          <Wand2 aria-hidden="true" /> Rewrite
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={() => run('expand')}
          disabled={!!working}
        >
          Expand
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={() => run('shorten')}
          disabled={!!working}
        >
          Shorten
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => run('regenerate')}
          disabled={!!working}
        >
          <RotateCcw aria-hidden="true" /> Regenerate
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground">Each edit costs 1 credit.</p>

      {working ? (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="size-3 animate-spin" aria-hidden="true" />
          {job?.stepLabel ?? 'Queued…'} · {job?.progress ?? 0}%
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 p-2 text-xs text-rose-200">
          {error}
        </p>
      ) : null}

      {job?.status === 'failed' ? (
        <p className="text-xs text-amber-300">
          {job.error ?? 'The AI edit failed.'} Your credit was refunded.
        </p>
      ) : null}

      {result ? (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold">Preview</p>
            <Badge variant="muted">{result.wordCount.toLocaleString()} words</Badge>
          </div>

          <div className="max-h-72 overflow-y-auto rounded-lg border border-border/70 bg-background/40 p-2 text-xs leading-6">
            {diffWords(chapter.text, result.text).map((part, index) => (
              <span
                key={index}
                className={cn(
                  part.added && 'bg-green-500/20 text-green-200',
                  part.removed && 'bg-rose-500/20 text-rose-200 line-through',
                )}
              >
                {part.value}
              </span>
            ))}
          </div>

          <div className="flex gap-2">
            <Button type="button" size="sm" onClick={apply} disabled={applying}>
              {applying ? (
                <Loader2 className="animate-spin" aria-hidden="true" />
              ) : (
                <Check aria-hidden="true" />
              )}
              Accept
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => setJobId(null)}
              disabled={applying}
            >
              <X aria-hidden="true" /> Discard
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Versions
// ---------------------------------------------------------------------------

function Versions({ chapter, onRefresh }: { chapter: EditorChapter; onRefresh: () => void }) {
  const [versions, setVersions] = useState<ChapterVersion[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void listVersionsAction({ chapterId: chapter.id }).then((response) => {
      if (active && response.ok) setVersions(response.data);
    });
    return () => {
      active = false;
    };
  }, [chapter.id]);

  async function restore(versionId: string) {
    setBusy(versionId);
    const response = await restoreVersionAction({ versionId });
    setBusy(null);
    if (response.ok) onRefresh();
  }

  if (!versions) {
    return (
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="size-3 animate-spin" aria-hidden="true" /> Loading history…
      </p>
    );
  }

  if (versions.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        No snapshots yet. One is saved every few minutes while you write, and before any AI edit.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {versions.map((version) => (
        <li
          key={version.id}
          className="flex items-center justify-between gap-2 rounded-lg border border-border/70 p-2"
        >
          <div className="min-w-0">
            <p className="text-xs font-medium">
              {new Date(version.createdAt).toLocaleString(undefined, {
                dateStyle: 'medium',
                timeStyle: 'short',
              })}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {version.source} · {version.wordCount.toLocaleString()} words
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => restore(version.id)}
            disabled={busy === version.id}
          >
            {busy === version.id ? (
              <Loader2 className="animate-spin" aria-hidden="true" />
            ) : (
              <History aria-hidden="true" />
            )}
            Restore
          </Button>
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// Continuity
// ---------------------------------------------------------------------------

function Continuity({
  bookId,
  issues,
  onOpenChapter,
}: {
  bookId: string;
  issues: ContinuityIssue[];
  onOpenChapter: (number: number) => void;
}) {
  const [items, setItems] = useState(issues);
  const [busy, setBusy] = useState<number | null>(null);

  async function toggle(index: number) {
    setBusy(index);
    const next = !items[index]?.resolved;
    const response = await resolveIssueAction({ bookId, index, resolved: next });
    setBusy(null);
    if (response.ok) {
      setItems((prev) => prev.map((item, i) => (i === index ? { ...item, resolved: next } : item)));
    }
  }

  if (items.length === 0) {
    return <p className="text-xs text-muted-foreground">No contradictions found in this book.</p>;
  }

  return (
    <ul className="flex flex-col gap-2">
      {items.map((issue, index) => (
        <li
          key={index}
          className={cn(
            'rounded-lg border border-border/70 p-2 text-xs',
            issue.resolved && 'opacity-50',
          )}
        >
          <div className="flex items-start justify-between gap-2">
            <p className={cn(issue.resolved && 'line-through')}>{issue.detail}</p>
            <input
              type="checkbox"
              aria-label={`Mark issue ${index + 1} resolved`}
              checked={issue.resolved ?? false}
              disabled={busy === index}
              onChange={() => toggle(index)}
              className="mt-0.5"
            />
          </div>
          {issue.quote ? (
            <p className="mt-1 text-[11px] text-muted-foreground italic">“{issue.quote}”</p>
          ) : null}
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="mt-1 h-7 px-2 text-[11px]"
            onClick={() => onOpenChapter(issue.chapterNumber)}
          >
            Chapter {issue.chapterNumber} <ChevronRight aria-hidden="true" />
          </Button>
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

function Metadata({
  bookId,
  metadata,
  onRefresh,
}: {
  bookId: string;
  metadata: BookMetadataDraft;
  onRefresh: () => void;
}) {
  const [form, setForm] = useState({
    title: metadata.title,
    subtitle: metadata.subtitle,
    blurb: metadata.blurb,
    keywords: metadata.keywords.join(', '),
    categories: metadata.categories.join(', '),
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const job = useJob(jobId);
  const running = jobId !== null && job?.status !== 'completed' && job?.status !== 'failed';

  useEffect(() => {
    if (job?.status === 'completed') onRefresh();
  }, [job?.status, onRefresh]);

  async function save() {
    setSaving(true);
    setMessage(null);
    const keywords = form.keywords
      .split(',')
      .map((k) => k.trim())
      .filter(Boolean)
      .slice(0, 7);
    const categories = form.categories
      .split(',')
      .map((c) => c.trim())
      .filter(Boolean)
      .slice(0, 3);

    const response = await updateMetadataAction({
      bookId,
      title: form.title,
      subtitle: form.subtitle,
      blurb: form.blurb,
      keywords,
      categories,
    });
    setSaving(false);
    setMessage(response.ok ? 'Saved.' : response.error.message);
    if (response.ok) onRefresh();
  }

  async function regenerate() {
    setMessage(null);
    const response = await regenerateMetadataAction({ bookId });
    if (!response.ok) {
      setMessage(response.error.message);
      return;
    }
    setJobId(response.data.jobId);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="meta-title">Title</Label>
        <Input
          id="meta-title"
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="meta-subtitle">Subtitle</Label>
        <Input
          id="meta-subtitle"
          value={form.subtitle}
          onChange={(e) => setForm({ ...form, subtitle: e.target.value })}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="meta-blurb">Blurb</Label>
        <textarea
          id="meta-blurb"
          rows={6}
          value={form.blurb}
          onChange={(e) => setForm({ ...form, blurb: e.target.value })}
          className="w-full resize-y rounded-lg border border-input bg-background/60 p-2 text-xs"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="meta-keywords">Keywords (max 7, ≤50 chars each)</Label>
        <Input
          id="meta-keywords"
          value={form.keywords}
          onChange={(e) => setForm({ ...form, keywords: e.target.value })}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="meta-categories">Categories (max 3)</Label>
        <Input
          id="meta-categories"
          value={form.categories}
          onChange={(e) => setForm({ ...form, categories: e.target.value })}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" onClick={save} disabled={saving}>
          {saving ? <Loader2 className="animate-spin" aria-hidden="true" /> : null} Save
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={regenerate}
          disabled={running}
        >
          {running ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Sparkles aria-hidden="true" />}
          Regenerate · 1 credit
        </Button>
      </div>

      {message ? <p className="text-xs text-muted-foreground">{message}</p> : null}
      {running ? (
        <p className="text-xs text-muted-foreground">
          {job?.stepLabel ?? 'Queued…'} · {job?.progress ?? 0}%
        </p>
      ) : null}
    </div>
  );
}
