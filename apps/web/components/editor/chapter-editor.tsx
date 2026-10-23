'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import {
  Bold,
  Heading2,
  Italic,
  Quote,
  Redo2,
  SeparatorHorizontal,
  Undo2,
} from 'lucide-react';
import { countWords, tiptapToPlainText, type TiptapDoc } from '@booksaga/shared';
import { saveChapterAction } from '@/lib/series/editor-actions';
import { cn } from '@/lib/utils';
import type { EditorChapter, SaveStatus } from './types';

const AUTOSAVE_MS = 3000;

interface ChapterEditorProps {
  chapter: EditorChapter;
  onSaved: (chapterId: string, doc: TiptapDoc, text: string, wordCount: number) => void;
  /** An AI result the author accepted; `nonce` changes to trigger the swap. */
  applied?: { doc: TiptapDoc; nonce: number } | null;
  onSelectionChange?: (text: string) => void;
}

/**
 * TipTap chapter editor (T3.6). Autosaves 3s after the last keystroke, keeps `content` (TipTap
 * JSON) and `content_text` in sync, and flushes on blur / chapter switch so nothing is lost.
 */
export function ChapterEditor({ chapter, onSaved, applied, onSelectionChange }: ChapterEditorProps) {
  const [status, setStatus] = useState<SaveStatus>('idle');
  const [words, setWords] = useState(chapter.wordCount);

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<{ doc: TiptapDoc; text: string } | null>(null);
  const chapterIdRef = useRef(chapter.id);

  const flush = useCallback(async () => {
    const payload = pending.current;
    const chapterId = chapterIdRef.current;
    if (!payload) return;

    pending.current = null;
    setStatus('saving');
    const result = await saveChapterAction({
      chapterId,
      doc: payload.doc,
      text: payload.text,
      wordCount: countWords(payload.text),
      snapshot: false,
    });
    setStatus(result.ok ? 'saved' : 'error');
    if (result.ok) onSaved(chapterId, payload.doc, payload.text, countWords(payload.text));
  }, [onSaved]);

  const scheduleSave = useCallback(
    (doc: TiptapDoc) => {
      pending.current = { doc, text: tiptapToPlainText(doc) };
      setStatus('dirty');
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), AUTOSAVE_MS);
    },
    [flush],
  );

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder: 'Start writing, or ask the AI to expand this chapter…' }),
    ],
    content: (chapter.doc ?? { type: 'doc', content: [{ type: 'paragraph' }] }) as object,
    editorProps: {
      attributes: {
        class:
          'prose-invert max-w-none min-h-[50vh] px-5 py-4 text-[15px] leading-7 outline-none',
      },
    },
    onUpdate: ({ editor: e }) => {
      const doc = e.getJSON() as unknown as TiptapDoc;
      setWords(countWords(tiptapToPlainText(doc)));
      scheduleSave(doc);
    },
    onBlur: () => void flush(),
    onSelectionUpdate: ({ editor: e }) => {
      const { from, to } = e.state.selection;
      onSelectionChange?.(from === to ? '' : e.state.doc.textBetween(from, to, '\n'));
    },
  });

  // Switching chapters / accepting an AI result: derive the counters during render (React's
  // "adjust state when props change" pattern) instead of cascading effects.
  const [trackedChapter, setTrackedChapter] = useState(chapter.id);
  const [trackedApplied, setTrackedApplied] = useState(applied?.nonce ?? 0);

  if (trackedChapter !== chapter.id) {
    setTrackedChapter(chapter.id);
    setWords(chapter.wordCount);
    setStatus('idle');
  }

  if (applied && applied.nonce !== trackedApplied) {
    setTrackedApplied(applied.nonce);
    setWords(countWords(tiptapToPlainText(applied.doc)));
    setStatus('saved');
  }

  useEffect(() => {
    chapterIdRef.current = chapter.id;
  }, [chapter.id]);

  useEffect(() => {
    if (!editor) return;
    if (pending.current) void flush();
    editor.commands.setContent(
      (chapter.doc ?? { type: 'doc', content: [{ type: 'paragraph' }] }) as object,
      { emitUpdate: false },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapter.id, editor]);

  // An accepted AI result replaces the document in place.
  useEffect(() => {
    if (!editor || !applied) return;
    editor.commands.setContent(applied.doc as object, { emitUpdate: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applied?.nonce, editor]);

  // Flush on unmount (navigating away from the editor).
  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
      if (pending.current) void flush();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const minutes = Math.max(1, Math.round(words / 230));

  return (
    <div className="flex min-h-0 flex-1 flex-col rounded-xl border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
        <div className="flex flex-wrap items-center gap-1">
          <ToolbarButton
            editor={editor}
            label="Bold"
            onClick={(e) => e.chain().focus().toggleBold().run()}
            active={editor?.isActive('bold')}
            icon={<Bold className="size-4" />}
          />
          <ToolbarButton
            editor={editor}
            label="Italic"
            onClick={(e) => e.chain().focus().toggleItalic().run()}
            active={editor?.isActive('italic')}
            icon={<Italic className="size-4" />}
          />
          <ToolbarButton
            editor={editor}
            label="Heading"
            onClick={(e) => e.chain().focus().toggleHeading({ level: 2 }).run()}
            active={editor?.isActive('heading', { level: 2 })}
            icon={<Heading2 className="size-4" />}
          />
          <ToolbarButton
            editor={editor}
            label="Quote"
            onClick={(e) => e.chain().focus().toggleBlockquote().run()}
            active={editor?.isActive('blockquote')}
            icon={<Quote className="size-4" />}
          />
          <ToolbarButton
            editor={editor}
            label="Scene break"
            onClick={(e) => e.chain().focus().setHorizontalRule().run()}
            icon={<SeparatorHorizontal className="size-4" />}
          />
          <span className="mx-1 h-5 w-px bg-border" aria-hidden="true" />
          <ToolbarButton
            editor={editor}
            label="Undo"
            onClick={(e) => e.chain().focus().undo().run()}
            icon={<Undo2 className="size-4" />}
          />
          <ToolbarButton
            editor={editor}
            label="Redo"
            onClick={(e) => e.chain().focus().redo().run()}
            icon={<Redo2 className="size-4" />}
          />
        </div>

        <p className="text-xs text-muted-foreground" aria-live="polite">
          {status === 'saving'
            ? 'Saving…'
            : status === 'dirty'
              ? 'Unsaved changes'
              : status === 'error'
                ? 'Save failed — retrying on next edit'
                : status === 'saved'
                  ? 'Saved'
                  : 'Autosaves every 3s'}
          <span className="mx-2 text-border">·</span>
          {words.toLocaleString()} words · ~{minutes} min read
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}

function ToolbarButton({
  editor,
  label,
  onClick,
  active,
  icon,
}: {
  editor: Editor | null;
  label: string;
  onClick: (editor: Editor) => void;
  active?: boolean;
  icon: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={!editor}
      onClick={() => editor && onClick(editor)}
      className={cn(
        'rounded-md p-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-40',
        active && 'bg-primary/20 text-violet-200',
      )}
    >
      {icon}
    </button>
  );
}

/** Exposed so the tools panel can apply an AI result without remounting the editor. */
export type { Editor };
