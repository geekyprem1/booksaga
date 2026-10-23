'use client';

import { Search } from 'lucide-react';
import { OPEN_COMMAND_EVENT } from './command-palette';

/** The topbar search box: opens the ⌘K palette (and advertises the shortcut). */
export function SearchTrigger() {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event(OPEN_COMMAND_EVENT))}
      aria-label="Search (⌘K)"
      className="relative hidden h-10 w-full max-w-md flex-1 items-center gap-2 rounded-lg border border-border bg-card pr-12 pl-9 text-left text-sm text-muted-foreground hover:bg-muted md:flex"
    >
      <Search
        className="absolute top-1/2 left-3 size-4 -translate-y-1/2"
        aria-hidden="true"
      />
      Search your series, books, chapters…
      <kbd className="absolute top-1/2 right-3 -translate-y-1/2 rounded border border-border px-1.5 text-[10px]">
        ⌘K
      </kbd>
    </button>
  );
}
