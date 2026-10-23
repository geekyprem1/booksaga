'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Command } from 'cmdk';
import { BookOpen, FileText, Layers, Loader2, Search } from 'lucide-react';
import { searchAction, type SearchResults } from '@/lib/search/actions';

export const OPEN_COMMAND_EVENT = 'booksaga:open-command';

const EMPTY: SearchResults = { series: [], books: [], chapters: [] };

/**
 * ⌘K / Ctrl+K palette (T3.12): series, books and chapter text for the signed-in user.
 */
export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResults>(EMPTY);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen((value) => !value);
      }
      if (event.key === 'Escape') setOpen(false);
    };
    const onOpen = () => setOpen(true);

    window.addEventListener('keydown', onKey);
    window.addEventListener(OPEN_COMMAND_EVENT, onOpen);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener(OPEN_COMMAND_EVENT, onOpen);
    };
  }, []);

  useEffect(() => {
    const trimmed = query.trim();
    if (!open || trimmed.length < 2) return;

    let active = true;
    const timer = setTimeout(async () => {
      setLoading(true);
      const response = await searchAction(trimmed);
      if (!active) return;
      setLoading(false);
      if (response.ok) setResults(response.data);
    }, 220);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query, open]);

  function close() {
    setOpen(false);
    setQuery('');
    setResults(EMPTY);
    setLoading(false);
  }

  function go(href: string) {
    close();
    router.push(href);
  }

  if (!open) return null;

  const showHint = query.trim().length < 2;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-4 pt-24 backdrop-blur-sm"
      onClick={close}
      role="presentation"
    >
      <div
        className="w-full max-w-xl overflow-hidden rounded-2xl border border-border bg-popover shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <Command shouldFilter={false} label="Global search" className="flex flex-col">
          <div className="flex items-center gap-2 border-b border-border px-4">
            <Search className="size-4 text-muted-foreground" aria-hidden="true" />
            <Command.Input
              autoFocus
              value={query}
              onValueChange={setQuery}
              placeholder="Search series, books, chapters…"
              className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/70"
            />
            {loading ? (
              <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden="true" />
            ) : (
              <kbd className="rounded border border-border px-1.5 text-[10px] text-muted-foreground">
                esc
              </kbd>
            )}
          </div>

          <Command.List className="max-h-96 overflow-y-auto p-2">
            {showHint ? (
              <p className="p-3 text-xs text-muted-foreground">
                Type at least two characters to search your library.
              </p>
            ) : (
              <Command.Empty className="p-3 text-xs text-muted-foreground">
                {loading ? 'Searching…' : 'No matches.'}
              </Command.Empty>
            )}

            {!showHint && results.series.length > 0 ? (
              <Command.Group
                heading="Series"
                className="px-1 py-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase"
              >
                {results.series.map((hit) => (
                  <Item key={hit.id} hit={hit} icon={<Layers className="size-4" />} onSelect={go} />
                ))}
              </Command.Group>
            ) : null}

            {!showHint && results.books.length > 0 ? (
              <Command.Group
                heading="Books"
                className="px-1 py-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase"
              >
                {results.books.map((hit) => (
                  <Item key={hit.id} hit={hit} icon={<BookOpen className="size-4" />} onSelect={go} />
                ))}
              </Command.Group>
            ) : null}

            {!showHint && results.chapters.length > 0 ? (
              <Command.Group
                heading="Chapters"
                className="px-1 py-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase"
              >
                {results.chapters.map((hit) => (
                  <Item key={hit.id} hit={hit} icon={<FileText className="size-4" />} onSelect={go} />
                ))}
              </Command.Group>
            ) : null}
          </Command.List>
        </Command>
      </div>
    </div>
  );
}

function Item({
  hit,
  icon,
  onSelect,
}: {
  hit: { id: string; label: string; hint?: string; href: string };
  icon: React.ReactNode;
  onSelect: (href: string) => void;
}) {
  return (
    <Command.Item
      value={`${hit.href}-${hit.id}`}
      onSelect={() => onSelect(hit.href)}
      className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-sm text-muted-foreground data-[selected=true]:bg-muted data-[selected=true]:text-foreground"
    >
      <span aria-hidden="true">{icon}</span>
      <span className="truncate">{hit.label}</span>
      {hit.hint ? (
        <span className="ml-auto truncate text-[11px] text-muted-foreground/70">{hit.hint}</span>
      ) : null}
    </Command.Item>
  );
}
