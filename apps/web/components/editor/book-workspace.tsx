'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { TiptapDoc } from '@booksaga/shared';
import { ChapterEditor } from './chapter-editor';
import { ChapterList } from './chapter-list';
import { ToolsPanel } from './tools-panel';
import type { BookMetadataDraft, ContinuityIssue, EditorChapter } from './types';
import {
  addChapterAction,
  deleteChapterAction,
  reorderChaptersAction,
} from '@/lib/series/editor-actions';

interface BookWorkspaceProps {
  bookId: string;
  chapters: EditorChapter[];
  metadata: BookMetadataDraft;
  issues: ContinuityIssue[];
  initialChapterId?: string;
}

/** Three-pane writing workspace: chapter list · editor · tools (PRD §8.7). */
export function BookWorkspace({
  bookId,
  chapters,
  metadata,
  issues,
  initialChapterId,
}: BookWorkspaceProps) {
  const router = useRouter();
  const [list, setList] = useState(chapters);
  const [syncedChapters, setSyncedChapters] = useState(chapters);
  const [selectedId, setSelectedId] = useState<string | null>(
    initialChapterId ?? chapters[0]?.id ?? null,
  );
  const [selection, setSelection] = useState('');
  const [applied, setApplied] = useState<{ doc: TiptapDoc; nonce: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Server refresh sent a new list: adopt it (React's "adjust state when props change" pattern).
  if (syncedChapters !== chapters) {
    setSyncedChapters(chapters);
    setList(chapters);
  }

  const selected = list.find((c) => c.id === selectedId) ?? list[0] ?? null;

  function handleSaved(chapterId: string, doc: TiptapDoc, text: string, wordCount: number) {
    setList((prev) =>
      prev.map((c) => (c.id === chapterId ? { ...c, doc, text, wordCount } : c)),
    );
  }

  function handleReorder(ids: string[]) {
    const byId = new Map(list.map((c) => [c.id, c]));
    const next = ids
      .map((id) => byId.get(id))
      .filter((c): c is EditorChapter => Boolean(c))
      .map((c, index) => ({ ...c, number: index + 1 }));
    setList(next);
    void reorderChaptersAction({ bookId, orderedIds: ids }).then((response) => {
      if (!response.ok) setError(response.error.message);
    });
  }

  async function handleAdd() {
    setBusy(true);
    const response = await addChapterAction({ bookId });
    setBusy(false);
    if (!response.ok) {
      setError(response.error.message);
      return;
    }
    setSelectedId(response.data.chapterId);
    router.refresh();
  }

  async function handleDelete(chapterId: string) {
    setBusy(true);
    const response = await deleteChapterAction({ chapterId });
    setBusy(false);
    if (!response.ok) {
      setError(response.error.message);
      return;
    }
    const remaining = list.filter((c) => c.id !== chapterId);
    setList(remaining);
    if (selectedId === chapterId) setSelectedId(remaining[0]?.id ?? null);
    router.refresh();
  }

  function handleApplied(doc: TiptapDoc, text: string) {
    if (!selected) return;
    const words = text.trim() ? text.trim().split(/\s+/).length : 0;
    handleSaved(selected.id, doc, text, words);
    setApplied({ doc, nonce: Date.now() });
  }

  function handleOpenChapter(number: number) {
    const target = list.find((c) => c.number === number);
    if (target) setSelectedId(target.id);
  }

  return (
    <div className="flex flex-col gap-3">
      {error ? (
        <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 p-2 text-sm text-rose-200">
          {error}
        </p>
      ) : null}

      <div className="grid min-h-[70vh] gap-3 lg:grid-cols-[260px_minmax(0,1fr)] xl:grid-cols-[260px_minmax(0,1fr)_330px]">
        <ChapterList
          chapters={list}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onReorder={handleReorder}
          onAdd={handleAdd}
          onDelete={handleDelete}
          busy={busy}
        />

        <div className="flex min-h-0 flex-col">
          {selected ? (
            <ChapterEditor
              chapter={selected}
              onSaved={handleSaved}
              applied={applied}
              onSelectionChange={setSelection}
            />
          ) : (
            <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-border text-sm text-muted-foreground">
              Add a chapter to start writing.
            </div>
          )}
        </div>

        {selected ? (
          <div className="min-h-0 xl:sticky xl:top-4 xl:h-[calc(100vh-8rem)]">
            <ToolsPanel
              bookId={bookId}
              chapter={selected}
              selection={selection}
              metadata={metadata}
              issues={issues}
              onApplied={handleApplied}
              onOpenChapter={handleOpenChapter}
              onRefresh={() => router.refresh()}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
