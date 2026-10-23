'use client';

import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Loader2, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { EditorChapter } from './types';

interface ChapterListProps {
  chapters: EditorChapter[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onReorder: (ids: string[]) => void;
  onAdd: () => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  busy: boolean;
}

export function ChapterList({
  chapters,
  selectedId,
  onSelect,
  onReorder,
  onAdd,
  onDelete,
  busy,
}: ChapterListProps) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = chapters.findIndex((c) => c.id === active.id);
    const newIndex = chapters.findIndex((c) => c.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const next = arrayMove(chapters, oldIndex, newIndex);
    // The parent applies the optimistic order and persists it; this component stays stateless.
    onReorder(next.map((c) => c.id));
  }

  return (
    <div className="flex min-h-0 flex-col rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          Chapters
        </p>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => void onAdd()}
          disabled={busy}
          aria-label="Add chapter"
        >
          <Plus aria-hidden="true" /> Add
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={chapters.map((c) => c.id)} strategy={verticalListSortingStrategy}>
            <ul className="flex flex-col gap-1">
              {chapters.map((chapter) => (
                <SortableChapter
                  key={chapter.id}
                  chapter={chapter}
                  selected={chapter.id === selectedId}
                  onSelect={onSelect}
                  onDelete={onDelete}
                  busy={busy}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      </div>
    </div>
  );
}

function SortableChapter({
  chapter,
  selected,
  onSelect,
  onDelete,
  busy,
}: {
  chapter: EditorChapter;
  selected: boolean;
  onSelect: (id: string) => void;
  onDelete: (id: string) => Promise<void>;
  busy: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: chapter.id,
  });

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        'group flex items-center gap-1 rounded-lg pr-1',
        selected ? 'bg-primary/15' : 'hover:bg-muted/50',
        isDragging && 'opacity-70',
      )}
    >
      <button
        type="button"
        aria-label={`Reorder ${chapter.title}`}
        className="cursor-grab p-1.5 text-muted-foreground/60 hover:text-foreground"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-4" />
      </button>

      <button
        type="button"
        onClick={() => onSelect(chapter.id)}
        className="flex min-w-0 flex-1 flex-col items-start py-1.5 text-left"
        aria-current={selected ? 'true' : undefined}
      >
        <span className="line-clamp-2 w-full text-sm leading-snug">
          <span className="mr-1.5 text-muted-foreground">{chapter.number}.</span>
          {chapter.title}
        </span>
        <span className="text-[11px] text-muted-foreground">
          {chapter.wordCount.toLocaleString()} words
        </span>
      </button>

      <button
        type="button"
        aria-label={`Delete ${chapter.title}`}
        disabled={busy}
        onClick={() => {
          if (confirm(`Delete "${chapter.title}"? This cannot be undone.`)) {
            void onDelete(chapter.id);
          }
        }}
        className="rounded p-1.5 text-muted-foreground/50 opacity-0 transition group-hover:opacity-100 hover:text-rose-300"
      >
        {busy ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
      </button>
    </li>
  );
}

