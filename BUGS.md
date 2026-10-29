# BookSaga — Bug Report

**Original report:** 26 Oct 2026. Findings and original line references below are retained for context.

## Fix status — 28 Oct 2026

All 30 findings have been addressed in code: 29 fixes in this pass; #2 (`trash_purge`) was already fixed.
Targeted browser and database integration verification now passes; this is not a production launch sign-off.

| Findings | Implementation status |
|---|---|
| #1, #3–#4 | Book-job filtering; preview ownership/deletion filtering before the limit; safe running-head CSS strings |
| #2 | Existing cron fix verified in source: runs before the jobId guard with a CronRunner |
| #5–#12 | Genre id/label lookup; locked-book library-image gate; matching preview matter and per-format export lookup; chapter labels; finite/clamped template parts; usable duplicate roadmap with rollback on errors; visible expired export history |
| #13–#22 | EPUB Contents links; generated Read Next placeholder warning; no AI brief for library images; shared library subscription/poller/dialog; cover summary styling and real palette swatches; consistent keyword threshold; calculated-gutter warning; stale-wrap comparison across exports; checked history insertion |
| #23–#30 | Log/icon encoding; canonical DFY niche mapping; full cover proportions; cover existence independent of signed URLs with preview fallback; preview ownership/deletion gates; DOCX chapter labels |

**Verification:** `pnpm test` — 100 passed; `pnpm typecheck` — passed; `pnpm lint` — 0 errors, 1 pre-existing unused Badge warning; `pnpm build` — passed. Actual Chromium print smoke passed: malicious title/author could not inject a script, the chapter heading was normalized, and the PDF measured 432 × 648 pt (6 × 9 in).

**Integration follow-up (28 Oct 2026):** Docker/Supabase are running. `pnpm test:db` passed all 68 tests. All 8 targeted Playwright tests passed across `bug-regressions.spec.ts`, `kdp-preview.spec.ts`, `library.spec.ts`, and `cover-studio.spec.ts`. These cover FE template limits, unrelated-job filtering, library queued/active/completed progress without reload, desktop/mobile cover interactions and layout, preview ownership/deletion filtering before the 50-book limit, final-book matter, independent PDF/wrap selection and stale-wrap warnings, expired history, duplicate roadmap creation, Bible editing/export, and settings validation.

The live-update regression exposed a connection race: changes between the server snapshot and the Realtime join could be missed. The shared library subscription now refreshes on connect/reconnect and polls while connecting or disconnected. The updated regression passes. Web typecheck and lint were rerun after this fix (0 lint errors, the same pre-existing Badge warning).

Browser tests used `APP_URL=http://localhost:3000` to match the test web server and `AI_MODE=mock`. One export fixture was corrected to supply `created_at` consistently across a batch insert. These tests use seeded data and simulated worker state changes; they do not exercise paid AI generation or production deployment.

---

**Tags:** `[new]` = introduced by the current uncommitted changes. `[pre-existing]` = already in `HEAD`, but still a real bug. `[verify]` = needs a live render/runtime check to confirm the visual outcome.

---

## Severity summary

| # | Severity | Area | Bug |
|---|----------|------|-----|
| 1 | Critical | Roadmap / My Series | Cover/export/metadata/audiobook jobs are treated as book-generation jobs |
| 2 | Critical | Worker cron | `trash_purge` never runs |
| 3 | Critical | KDP Preview | Query fetches all users' books, then filters after the limit |
| 4 | Critical | Print PDF | Running-head title/author can break out of `<style>` |
| 5 | High | Export | Genre line is always missing (`getGenre` id/label mismatch) |
| 6 | High | Cover Studio | Library-image action bypasses the locked-book gate |
| 7 | High | KDP Preview | Ebook preview does not match the real export (matter fields missing) |
| 8 | High | KDP Preview | Only the latest export row is read; reader-only exports hide the print PDF/wrap |
| 9 | High | Exporters | Chapter titles duplicate “Chapter N:” in TOC/print/EPUB |
| 10 | High | Create Series | Template prefill can make the form unsubmittable |
| 11 | High | Series | Duplicate series has no Book 1 and cannot create one |
| 12 | High | Exports | History drops expired rows and can show no ready rows |
| 13 | Medium | EPUB | In-book TOC links (`#ch-N`) are broken across XHTML files |
| 14 | Medium | KDP Preview | “Read Next link” check always passes |
| 15 | Medium | Cover generation | Library-image covers still pay for an AI brief call |
| 16 | Medium | My Series | A full Roadmap (subscription + polling + dialog) per series |
| 17 | Medium | Cover Studio | `collectionSummary` CSS class is missing |
| 18 | Medium | Cover Studio | Palette swatches are hardcoded, not the actual palette |
| 19 | Medium | KDP Preview | Metadata status/detail thresholds disagree |
| 20 | Medium | KDP Preview | Gutter check always passes |
| 21 | Medium | KDP Preview | Stale-wrap check can never fire |
| 22 | Medium | Worker export | `exports` insert error is ignored |
| 23 | Low | Worker | Mojibake in log lines/comments |
| 24 | Low | Exports UI | Mojibake lock emoji |
| 25 | Low | DFY | Idea prefill passes a niche as the genre |
| 26 | Low | Dashboard/Templates | 2:3 cover frames crop 5:8 AI-lettered covers |
| 27 | Low | Cover Studio | “With covers” filter depends on signed URLs |
| 28 | Low | KDP Preview | Deleted-series books can still appear |
| 29 | Low | KDP Preview | Book lookup has no ownership predicate (defense in depth) |
| 30 | Low | DOCX | Chapter titles duplicate “Chapter N:” |

---

## Critical

### 1. Cover/export/metadata/audiobook jobs are treated as book-generation jobs

**Where**
- `apps/web/app/(app)/series/[id]/page.tsx:28-33` — jobs query
- `apps/web/app/(app)/my-series/page.tsx:90-95` — jobs query
- `apps/web/components/series/roadmap.tsx:79` — `anyGenerating`
- `apps/web/components/series/roadmap.tsx:185-186` — `generating` / `queued`
- `apps/web/components/series/roadmap.tsx:320` — Cancel button

**What happens**
Both pages query queued/active jobs with:

```ts
.in('ref_id', bookIds)
.in('status', ['queued', 'active'])
```

They do **not** filter `type = 'book'`. A cover, export, metadata, or audiobook job also stores the book id in `ref_id` (see `apps/web/lib/series/cover-actions.ts`, `apps/web/lib/series/export-actions.ts`, `apps/web/lib/series/editor-actions.ts`, `apps/web/lib/series/audiobook-actions.ts`). As a result:

- The Roadmap shows **“Writing” / “Queued”** for a book that is actually finished, because a cover or metadata job is running.
- The **“Open Part N”** link disappears and is replaced by “View progress”.
- The progress bar and step label show the cover/export step, not book writing.
- **Cancel** calls `cancelJobAction` with the cover/export/metadata job id, so it cancels the wrong job.
- `anyGenerating` becomes true, so the Roadmap polls every 8 seconds for the duration of an unrelated job.

The DB explicitly allows non-book jobs to run alongside a book job (`tests/db/credits.db.test.ts:255-262`), so this is reachable in normal use.

**Fix**
Add `.eq('type', 'book')` to both jobs queries (or select `type` and filter in the map). If other job types should appear in the future, give them a separate status model instead of reusing `jobId`.

---

### 2. `trash_purge` cron never runs

**Where**
- `apps/worker/src/index.ts:141-142` — dispatch case
- `apps/worker/src/index.ts:148-164` — `handleJob`
- `apps/worker/src/index.ts:311-322` — scheduler registration
- `apps/worker/src/processors/system/trashPurge.ts:10-13` — processor signature

**What happens**
BullMQ scheduler jobs have no `jobs` row, so they have no `jobId` in their payload. `handleJob` special-cases `stuck_reaper` and `export_cleanup` before the guard, but not `trash_purge`:

```ts
if (job.name === 'stuck_reaper') { ... return; }
if (job.name === 'export_cleanup') { ... return; }

const data = job.data as { jobId?: string };
if (!data?.jobId) throw new Error(`Job ${job.id} is missing a jobId in its payload.`);
```

Every daily `trash_purge` run therefore throws immediately. Deleted series older than 30 days are never hard-deleted, so the trash and storage keep growing.

**Fix**
Special-case `trash_purge` like `export_cleanup`, using a `CronRunner` (`Pick<JobRunner, 'progress' | 'complete'>`) and update `processTrashPurge` to accept it. The dispatch case can stay for type completeness.

---

### 3. KDP Preview fetches all users' books, then filters after the limit

**Where**
- `apps/web/app/(app)/kdp-preview/page.tsx:25-35`

**What happens**
The page uses the admin client to select the 50 newest generated books **across the whole database**, then filters to the current user's series in JavaScript:

```ts
const { data: rows } = await db
  .from('books')
  .select('id, title, part_number, status, series_id, series:series_id(title, user_id)')
  .eq('status', 'generated')
  .order('created_at', { ascending: false })
  .limit(50);

const books = (rows ?? []).filter((row) => {
  const series = row.series as { user_id?: string } | null;
  return series?.user_id === user.id;
});
```

If other users have 50 more recent generated books, the current user's books are all crowded out. The page then shows the **sample workspace** even though the user has books. This is the same anti-pattern the search action explicitly fixed in `apps/web/lib/search/actions.ts:71-90`.

**Fix**
Use an inner join and filter before the limit, as the dashboard does:

```ts
.from('books')
.select('id, title, part_number, status, series_id, series!inner(title, user_id, deleted_at)')
.eq('series.user_id', user.id)
.is('series.deleted_at', null)
.eq('status', 'generated')
.order('created_at', { ascending: false })
.limit(50);
```

---

### 4. Running-head title/author can break out of `<style>`

**Where**
- `packages/exporters/src/pdf/print.ts:106-108` — `cssString`
- `packages/exporters/src/pdf/print.ts:127` — author running head
- `packages/exporters/src/pdf/print.ts:133` — title running head
- `packages/exporters/src/pdf/print.ts:196` — `<style>${css}</style>`

**What happens**
`cssString` only escapes backslashes, double quotes, and newlines:

```ts
export function cssString(text: string): string {
  return `"${text.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/[\r\n]+/g, ' ')}"`;
}
```

The result is interpolated into a `<style>` element. A book title or pen name containing `</style>` terminates the style block regardless of CSS string quoting. The rest of the title becomes raw HTML, which Chromium parses and can execute. This breaks the PDF and runs attacker-controlled markup in the worker's Chromium context.

The title is user-controlled (`books.title`), and the author is the series pen name (`series.pen_name`), so this is reachable through normal input.

**Fix**
Escape `<` and `>` as CSS escapes inside the string, e.g. `text.replace(/</g, '\\3C ').replace(/>/g, '\\3E ')`, in addition to quotes/backslashes/newlines. Alternatively, HTML-escape the CSS text before insertion and keep the CSS escapes for quotes.

---

## High

### 5. Genre line is always missing in exported books

**Where**
- `apps/worker/src/processors/export/book.ts:92`
- `packages/shared/src/genres.ts:82-84`
- `apps/web/lib/series/actions.ts:64` — stores `genre.label`
- `apps/web/lib/series/series-actions.ts:168` — duplicate copies the label

**What happens**
`createSeriesAction` stores the genre **label** (`"Fantasy"`, `"Mystery & Thriller"`), but `getGenre` matches only the **id** (`"fantasy"`, `"mystery-thriller"`):

```ts
export function getGenre(id: string): Genre | undefined {
  return GENRES.find((g) => g.id === id);
}
```

Therefore `getGenre(series.genre)` is always `undefined` for real series, and `genreLine` is always `null`. The new title-page genre line never appears in the EPUB or print PDF.

**Fix**
Make the lookup accept both forms, case-insensitively:

```ts
export function getGenre(value: string): Genre | undefined {
  const key = value.trim().toLowerCase();
  return GENRES.find(
    (g) => g.id.toLowerCase() === key || g.label.toLowerCase() === key,
  );
}
```

Alternatively, change `createSeriesAction` to store `genre.id`, but that would require a data migration and would change every UI that displays `series.genre`.

---

### 6. Library-image action bypasses the locked-book gate

**Where**
- `apps/web/lib/covers/image-actions.ts:73-87`
- `apps/web/lib/series/cover-actions.ts:33-35` — the gate that was added

**What happens**
`generateCoverAction` now rejects locked books:

```ts
if (book.status === 'locked') {
  throw new AppError('PART_LOCKED', 'Write this part before generating a cover.');
}
```

`applyLibraryImageAction` selects only `id, series_id` and never checks `book.status`. The UI disables the “My image” button for locked books, but the server action can be called directly (or through a stale client) and will create a cover for a part that has not been written yet.

**Fix**
Select `id, series_id, status` and throw `PART_LOCKED` with the same message before enqueueing the job.

---

### 7. KDP ebook preview does not match the real export

**Where**
- `apps/web/app/(app)/kdp-preview/page.tsx:126-141`
- `packages/exporters/src/book/matter.ts:80-90` — `endOfBookPage`
- `packages/exporters/src/book/matter.ts:133` — `readNextPage`

**What happens**
The preview builds `matter` with only `seriesTitle`, `bookTitle`, `subtitle`, `partNumber`, `author`, `year`, `metadata`, and `chapters`. It omits the new fields:

- `isFinalPart`
- `readingOrder`
- `genreLine`
- `nextTitle`

Because `isFinalPart` is `undefined` (falsy), `endOfBookPage` renders **“Continued in Book N+1”** even for the final book of a series. The preview also omits the reading-order list, the genre line, and the next title, and calls `backMatter(matter, [])`, so “Also in this Series” is empty. The real EPUB/PDF produced by the worker includes all of these.

**Fix**
Load the series' books (the same query the worker uses), compute `nextBook`, `lastPart`, `readingOrder`, `genreLine`, and `nextTitle`, and pass them into `matter`. Use the same `alsoTitles` list for `backMatter`.

---

### 8. KDP Preview only reads the latest export row

**Where**
- `apps/web/app/(app)/kdp-preview/page.tsx:84-91` — selects one latest export
- `apps/web/app/(app)/kdp-preview/page.tsx:101-106` — reads `files.pdf` / `files.wrap`

**What happens**
The preview loads only the most recent `exports` row for the book:

```ts
.order('created_at', { ascending: false })
.limit(1)
.maybeSingle(),
```

If the user then exports **only** a Reader PDF or only an EPUB, that new row has no `files.pdf` and no `files.wrap`. The preview says “Export the book with Print PDF selected” and “Paperback wrap not exported”, even though a print PDF and wrap exist in an older export row. The same happens after an export that failed partway through.

**Fix**
Query recent export rows and pick the newest row that actually contains the file being previewed (print PDF, wrap), or merge the `files` maps from recent rows. Keep `pdfPages` from the row that supplied the PDF.

---

### 9. Chapter titles duplicate “Chapter N:” in TOC/print/EPUB

**Where**
- `packages/exporters/src/book/matter.ts:70` — TOC page
- `packages/exporters/src/pdf/print.ts:204` — print chapter heading
- `packages/exporters/src/epub/build.ts:107` — chapter `<title>`
- `packages/exporters/src/epub/build.ts:136` — EPUB nav
- `packages/exporters/src/epub/build.ts:159` — NCX nav
- `packages/exporters/src/html/render.ts:102` — `displayTitle` helper

**What happens**
`displayTitle()` exists specifically to strip a leading “Chapter 3:” before the exporter adds its own numbering:

```ts
export function displayTitle(title: string): string {
  const cleaned = title.replace(/^\s*chapter\s*\d+\s*[:.\-\u2013\u2014]\s*/i, '').trim();
  return cleaned || title;
}
```

Only `chapterHtml()` uses it. The TOC, print heading, EPUB `<title>`, EPUB nav, and NCX all prepend `Chapter N` to the raw title. A chapter titled “Chapter 3: The Iron Chorus” renders as “Chapter 3 Chapter 3: The Iron Chorus” (or “03 Chapter 3: …” in the TOC). The box-set EPUB already uses `displayTitle` (`packages/exporters/src/epub/boxset.ts:129,132`), so the regular EPUB is inconsistent with it.

**Fix**
Use `displayTitle(chapter.title)` in all five places. Import it where needed.

---

### 10. Template prefill can make Create Series unsubmittable

**Where**
- `apps/web/components/series/create-series-form.tsx:90` — state initialization
- `apps/web/components/series/create-series-form.tsx:118` — `maxPlanned`
- `apps/web/components/series/create-series-form.tsx:421-423` — input `max`
- `apps/web/app/(app)/create-series/page.tsx:103-108` — URL prefill
- `apps/web/components/dashboard/recommended-templates.tsx:48-54` and `apps/web/components/templates/template-library.tsx:169-175` — pass `parts`

**What happens**
The form initializes `plannedBooks` directly from the template/URL:

```ts
const [plannedBooks, setPlannedBooks] = useState(defaults?.plannedBooks ?? 5);
```

`maxPlanned` is `Math.min(12, maxBooksPerSeries)`. On the FE plan, `maxBooksPerSeries` is 5 (`packages/shared/src/plans.ts:78-80`). Legacy lite templates were seeded with `planned_books` 6, 9, 6, or 12 (`scripts/seed-templates.ts`), so a prefill can set the number input to 6/9/12 while its `max` is 5. The browser's constraint validation then blocks form submission; the user sees a native “Value must be less than or equal to 5” bubble on a field they may not have touched. The server would have clamped the value, but the submit never reaches it.

The starter templates are 3–5, so the new `--starter` data is safe; the legacy catalog and any future template with a larger planned count are not.

**Fix**
Clamp the initial value:

```ts
const maxPlanned = Math.min(12, maxBooksPerSeries);
const [plannedBooks, setPlannedBooks] = useState(
  Math.min(maxPlanned, Math.max(3, defaults?.plannedBooks ?? 5)),
);
```

`maxPlanned` must be computed before the `useState` call (or use a lazy initializer). Also guard `Number(parts)` in `create-series/page.tsx` against `NaN`.

---

### 11. Duplicate series has no Book 1 and cannot create one

**Where**
- `apps/web/lib/series/series-actions.ts:162-178` — duplicate insert
- `apps/worker/src/processors/text/arcExtend.ts:49` — `fromPart = planned_books + 1`

**What happens**
`duplicateSeriesAction` copies the series settings and bible but inserts **no books**. It also copies `planned_books` unchanged:

```ts
.insert({
  ...
  planned_books: series.planned_books,
  ...
})
```

The duplicated series therefore has `planned_books` (e.g. 5) but zero book rows. The Roadmap's “Add more parts” action starts at `series.planned_books + 1` (part 6), so there is no way to create Book 1. The series cannot be written at all.

**Fix**
On duplicate, either:

- set `planned_books: 1` and reset `arc.books` to a single entry, then insert a `ready` Book 1, or
- add an explicit “Create Book 1” path that inserts part 1 when the series has no books, and make `addMorePartsAction` start from `max(planned_books, 0) + 1` only after part 1 exists.

The first option matches the “duplicate settings + bible” intent while leaving the copy usable.

---

### 12. Exports history drops expired rows and can show no ready rows

**Where**
- `apps/web/app/(app)/series/[id]/exports/page.tsx:41-51`

**What happens**
The page selects the 10 most recent exports and only then filters `status === 'ready'`:

```ts
.limit(10);

const rows = (exportRows ?? [])
  .filter((row) => row.status === 'ready')
  ...
```

Two problems:

1. If the 10 most recent exports are expired or failed, older ready exports are not shown at all.
2. Expired exports are hidden from history, even though `processExportCleanup` deliberately marks them `expired` “so the history still explains what happened” (`apps/worker/src/processors/system/exportCleanup.ts:2-3`). The user loses the record of what was exported and when.

**Fix**
Filter `status` in the query if only ready rows are wanted, or show expired rows with a “Files expired” state and no download button. In either case, do not apply the 10-row limit before filtering.

---

## Medium

### 13. EPUB in-book TOC links are broken across XHTML files

**Where**
- `packages/exporters/src/book/matter.ts:70` — `<a href="#ch-N">`
- `packages/exporters/src/epub/build.ts:91-92` — front matter is its own file
- `packages/exporters/src/epub/build.ts:103-113` — chapters are separate files

**What happens**
`tableOfContents` emits fragment-only links:

```html
<a href="#ch-3">...</a>
```

The EPUB writes the entire front matter, including this TOC, into `OEBPS/front-matter.xhtml`. Chapters are separate files (`chapter-03.xhtml`) and contain `<section id="ch-3">`. A fragment-only href resolves within `front-matter.xhtml`, which has no `id="ch-3"`, so the in-book Contents page does nothing when tapped. The generated `nav.xhtml` works because it links to the chapter files directly.

**Fix**
For EPUB only, rewrite the TOC links to `chapter-NN.xhtml#ch-N` before writing `front-matter.xhtml`, or generate the EPUB front matter without the HTML TOC and rely on `nav.xhtml`. The print PDF can keep `#ch-N` because all chapters are in one document.

---

### 14. “Read Next link” check always passes

**Where**
- `apps/web/app/(app)/kdp-preview/page.tsx:199-206`
- `packages/exporters/src/book/matter.ts:99` — the placeholder is always emitted

**What happens**
The check looks at `metadata.readNext`:

```ts
status: metadataRow.readNext?.includes('{{NEXT_BOOK_URL}}') ? 'warn' : 'pass',
```

But `readNextPage` always appends:

```html
<p><a href="{{NEXT_BOOK_URL}}">{{NEXT_BOOK_URL}}</a></p>
```

`metadata.readNext` is the AI-written blurb and normally does **not** contain the placeholder, so the check reports “pass” while the exported book always contains an unresolved `{{NEXT_BOOK_URL}}`.

**Fix**
Check the generated back-matter HTML (`back.includes('{{NEXT_BOOK_URL}}')`) or always warn until the author replaces the placeholder in the exported file.

---

### 15. Library-image covers still pay for an AI brief call

**Where**
- `apps/worker/src/processors/image/cover.ts:74-108`

**What happens**
The style block runs before the library-image branch:

```ts
let style = series.cover_style as CoverBrief | null;

if (!style?.artPrompt) {
  // ... await ai.json(coverBriefPrompt(...))
  await db.from('series').update({ cover_style: style }).eq('id', series.id);
}

if (!style && data.sourceImagePath) {
  style = { artPrompt: '', palette: ['#f0e6d2'], ... };
}
```

The second block is unreachable: the first block always assigns `style` (brief or fallback). So a library-image cover for a series without `cover_style` makes an unnecessary structured text AI call and locks a generated art direction, even though the comment says “A library image needs a palette/font but not an AI art direction” and the branch at line 121 is supposed to avoid AI.

**Fix**
Check `data.sourceImagePath` first and set the static style before the brief block:

```ts
let style = series.cover_style;
if (data.sourceImagePath && !style?.artPrompt) {
  style = { artPrompt: '', palette: ['#f0e6d2'], scene: '', fontFamily: 'serif' };
}
if (!style?.artPrompt) { /* brief */ }
```

---

### 16. My Series renders a full Roadmap per series

**Where**
- `apps/web/app/(app)/my-series/page.tsx:288-298`

**What happens**
Each series in the list mounts a `<Roadmap>`, and each Roadmap:

- subscribes to its own Supabase Realtime channel (`roadmap.tsx:85-115`),
- starts an 8-second poll when any job is active,
- mounts its own `JobProgressDialog`,
- mounts its own `useJob` subscription when a dialog is open.

With 10–25 series, that is 10–25 channels and a large client tree for a page whose main job is browsing. The previous My Series page was a simple grid/list. The TASKS note only asked for queued/active progress on the list, not a full roadmap per card.

**Fix**
Use a compact progress row/button on My Series (status + percentage + “View progress” opening the existing dialog) and keep the full Roadmap on the series page. If the roadmap UI is required, use one shared jobs subscription and pass the relevant job snapshot down.

---

### 17. `collectionSummary` CSS class is missing

**Where**
- `apps/web/components/covers/cover-studio.tsx:146`
- `apps/web/components/covers/cover-studio.module.css` — no `.collectionSummary`

**What happens**
The JSX uses `className={styles.collectionSummary}`, but the CSS module never defines it. `styles.collectionSummary` is `undefined`, so the wrapper div has no styles. The hero still lays out because it is a flex container, but the intended alignment/spacing for the wallet block is missing.

**Fix**
Add a `.collectionSummary` rule (e.g. `display:flex; align-items:center; gap:12px;`) or remove the class.

---

### 18. Palette swatches are hardcoded, not the actual palette

**Where**
- `apps/web/components/covers/cover-studio.tsx:175-179`
- `apps/web/components/covers/cover-studio.module.css:136-147`

**What happens**
The art-direction bar renders each palette entry as:

```tsx
<i className={styles[`palette${index % 4}`]} />
{color}
```

The CSS classes `.palette0`–`.palette3` are fixed colours (`#7f8798`, `#6ea69d`, `#b6a177`, `#7c85b6`). They do not reflect the actual palette values (“Midnight blue”, “Antique gold”, etc.), so the coloured dots are misleading.

**Fix**
Render the dot with an inline background derived from the palette value, e.g. `style={{ background: toHexColor(color) }}`. Keep a border/contrast ring for very light colours.

---

### 19. KDP metadata status/detail thresholds disagree

**Where**
- `apps/web/app/(app)/kdp-preview/page.tsx:181-197`

**What happens**
The status passes with **more than zero** keywords:

```ts
(metadataRow.keywords?.length ?? 0) > 0
```

but the detail says `${count}/7 keywords` and is omitted only when `count >= 7`. A book with one keyword gets a green “Passed” check while the detail simultaneously says “1/7 keywords”. KDP allows up to 7 keywords; the intended requirement is 7.

**Fix**
Use the same threshold for status and detail (`>= 7`), or change the detail to “optional” if any keyword is acceptable.

---

### 20. KDP gutter check always passes

**Where**
- `apps/web/app/(app)/kdp-preview/page.tsx:163-171`

**What happens**
The check reports `pass` whenever `pageCount` is known:

```ts
status: pageCount === null ? 'warn' : 'pass',
detail: `${insideMarginFor(pageCount)}" gutter for ${pageCount} pages.`
```

It never inspects the actual PDF page boxes, so it cannot catch a PDF whose margins do not match `insideMarginFor`. It is a display of the expected value, not a preflight check.

**Fix**
Either read the PDF's page boxes (pdf-lib can expose MediaBox/CropBox) and compare the gutter, or label the row as “Calculated gutter” rather than “Passed”.

---

### 21. Stale-wrap check can never fire

**Where**
- `apps/web/app/(app)/kdp-preview/page.tsx:101-106`
- `apps/web/app/(app)/kdp-preview/page.tsx:207-216`

**What happens**
`wrapPages` and `pageCount` come from the **same** latest export row's `files` object. `buildWrapPdf` is built with the `pdfPages` from that same export job (`apps/worker/src/processors/export/book.ts:283-298`), so the two values are equal by construction. `wrapStale` is always false. If the manuscript changes and the user re-exports only the PDF, the latest row has no wrap, so the check says “Not exported” rather than “stale”.

**Fix**
Compare the wrap's page count against the page count of the **latest print PDF**, even when the wrap came from an older export row. This requires the query change from bug 8 (find the latest row with a PDF and the latest row with a wrap separately).

---

### 22. `exports` insert error is ignored

**Where**
- `apps/worker/src/processors/export/book.ts:368-377`

**What happens**
The worker uploads the ZIP and then inserts the `exports` history row, but never checks the insert result:

```ts
await db.from('exports').insert({
  id: exportId,
  ...
});
```

If the insert fails (constraint, RLS, transient DB error), the job still completes and notifies the user, but the exports page has no row to download. The ZIP exists in storage but is unreachable from the UI.

**Fix**
Destructure `{ error }`, and on failure throw or notify with a clear error (the files are already uploaded, so the job can still be marked complete with a warning, but the user needs to know).

---

## Low / polish

### 23. Mojibake in worker log lines/comments

**Where**
- `apps/worker/src/index.ts:149` — `no credits â€” run`
- `apps/worker/src/index.ts:327` — `[worker] up Â· queues=... Â· text=...`
- `apps/worker/src/index.ts:331` — `drainingâ€¦`

**Fix**
Replace with `—`, `·`, and `…`. These were introduced in the current working tree; the earlier “repair mojibake” commit fixed similar strings elsewhere.

---

### 24. Mojibake lock emoji

**Where**
- `apps/web/components/exports/exports-hub.tsx:156` — `{locked ? ' ðŸ”’' : ''}`

**Fix**
Use `' 🔒'` (or an icon). This is pre-existing but visible on every locked wrap chip.

---

### 25. DFY idea prefill passes a niche as the genre

**Where**
- `apps/web/components/dfy/dfy-library.tsx:141`
- `apps/web/components/series/create-series-form.tsx:78-82`

**What happens**
The “Use this idea” link passes `openIdea.niche` as `genre`:

```ts
`/create-series?idea=...&genre=${encodeURIComponent(openIdea.niche)}`
```

Niches such as “Vampire Romance”, “Wolf Shifter”, “Dark Academia”, and “Space Opera” are not in `GENRES`, so `matchedGenre` is `undefined` and the form silently defaults to `GENRES[0]` (Fantasy). The user's chosen idea arrives with the wrong genre.

**Fix**
Map the DFY niche to a canonical genre id/label (add a `genre` column to `dfy_ideas`, or maintain a niche→genre map). Pass that instead of the niche.

---

### 26. 2:3 cover frames crop 5:8 AI-lettered covers

**Where**
- `apps/web/components/dashboard/recommended-templates.tsx:63` — `aspect-[2/3]`
- `apps/web/components/dashboard/series-card.tsx:73` — `aspect-[2/3]`
- `apps/web/components/series/roadmap.module.css` — `.cover` aspect ratio (verify)

**What happens**
The AI-text template covers are 1600×2560 (5:8, 0.625). A 2:3 frame (0.667) with `object-cover` crops about 3% from the top and bottom. The template seed prompt asks for lettering at least 12% inside the edges, so it usually survives, but the TASKS note for the template gallery explicitly switched to `aspect-[5/8]` + `object-contain` to avoid cropping. The dashboard/roadmap still use 2:3.

**Fix**
Use `aspect-[5/8]` with `object-contain` (or `object-cover` if the cover is guaranteed 5:8) in the remaining cover frames.

---

### 27. “With covers” filter depends on signed URLs

**Where**
- `apps/web/components/covers/cover-studio.tsx:92`
- `apps/web/components/covers/cover-studio.tsx:265` — active cover fallback

**What happens**
`covered` counts a book only if a cover's signed URL is non-null:

```ts
const covered = books.filter((book) => book.covers.some((cover) => cover.url));
```

If `createSignedUrl` fails transiently, a book with covers is counted as “Needs cover” and its card shows “No cover”. The active cover is also chosen by `isActive` first; if its URL is null while another variation has a URL, the card still shows no cover.

**Fix**
Base the filter on `book.covers.length > 0` (or a `hasCover` flag independent of the signed URL), and when the active cover URL is null, fall back to the first variation with a URL.

---

### 28. KDP Preview can include books from deleted series

**Where**
- `apps/web/app/(app)/kdp-preview/page.tsx:25-35`

**What happens**
The books query filters `status = 'generated'` and then the user id, but not `series.deleted_at`. A generated book in a soft-deleted series can appear in the preview list.

**Fix**
Add `.is('series.deleted_at', null)` to the inner-join query from bug 3.

---

### 29. KDP Preview book lookup has no ownership predicate

**Where**
- `apps/web/app/(app)/kdp-preview/page.tsx:61`

**What happens**
After `selectedId` is chosen from the filtered list, the page loads the book by id alone:

```ts
const { data: book } = await db.from('books').select('*').eq('id', selectedId).maybeSingle();
```

This is currently safe because `selectedId` is validated against `books` (which is filtered to the user), but it is fragile: a future refactor that accepts a raw `?book=` id would expose another user's book. The same applies to the `series`, `exports`, and `covers` queries that follow.

**Fix**
Add an ownership predicate to the lookup (join `series.user_id` or check `series.user_id` after loading), even if the current selection path is safe.

---

### 30. DOCX chapter titles duplicate “Chapter N:”

**Where**
- `packages/exporters/src/docx/build.ts:104` — TOC line
- `packages/exporters/src/docx/build.ts:115-120` — heading + subheading

**What happens**
The DOCX TOC uses `Chapter ${chapter.number} · ${chapter.title}` and the chapter body uses a “Chapter N” heading followed by `chapter.title`. If the stored title already begins with “Chapter 3:”, the DOCX shows the prefix twice. `displayTitle` is not imported here.

**Fix**
Use `displayTitle(chapter.title)` for the TOC and the subheading.

---

## Original verification notes (26 Oct 2026)

- `pnpm test` runs 75 unit tests and passes; the new `replaceParagraph`, cover-quality, color, export-format, and env tests are green.
- `pnpm typecheck` passes for all 7 packages.
- `pnpm lint` has 0 errors and one pre-existing warning (`Badge` unused in `apps/web/components/reseller/reseller-dashboard.tsx:6`).
- I did not run the Playwright e2e suite or a live PDF render. Items 20, 21, and 26 are marked as needing a runtime/visual check.
- No source files were modified while producing this report.

## Suggested fix order

1. Job type filters (#1) — wrong status/cancel is user-visible and can cancel paid work.
2. `trash_purge` cron (#2) — silent data-retention failure.
3. KDP preview query (#3) and matter fields (#7, #8) — the preview is the last step before publishing.
4. Print CSS injection (#4) — correctness and worker safety.
5. Genre line (#5), locked gate (#6), chapter titles (#9), template clamp (#10), duplicate Book 1 (#11), exports history (#12).
6. Medium items as capacity allows.
