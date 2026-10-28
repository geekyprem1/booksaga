# BookSaga — Live Cost Report (T2.21)

**Measured:** 23 Oct 2026 · model `deepseek/deepseek-v4.1-flash-1017` via OpenRouter · `AI_MODE=live`
**Method:** `scripts/calibrate.ts <preset>` generates one complete book through the real worker
pipeline; every AI call is logged in `ai_usage_log` with tokens and provider-reported cost.

> These are **measured** numbers, not estimates. They replace the placeholder prices in
> `packages/ai/src/usage.ts` and the credit costs in PRD §4.1 once the presets are signed off.

---

## 1. Headline numbers

| Preset | Words | Chapters | Wall clock | AI calls | Cost | Cost / 1k words |
|---|---|---|---|---|---|---|
| **Short** (10 credits) | 13,262 | 9 | **16 min 04 s** | 30 | **$0.0979** | $0.0074 |
| **Standard** (20 credits) | 32,436 | 18 | **26 min 07 s** | 45 | **$0.1560** | $0.0048 |
| **Full** (35 credits) | 56,329 | 28 | **51 min 29 s** | 63 | **$0.2148** | $0.0038 |

Standard is cheaper **per word** than Short because the fixed costs (series plan, outline,
continuity, metadata) are amortised over 2.4× the words; Full is cheaper again at 4.2× the words.

---

## 2. Where the money goes (Standard book)

| Step | Calls | Input tokens | Output tokens | Cost | Share |
|---|---|---|---|---|---|
| Chapter writing | 18 | 180,398 | 68,419 | $0.0746 | 48% |
| Chapter extract (bible facts) | 21 | 57,200 | 62,836 | $0.0398 | 25% |
| Continuity pass | 1 | 15,692 | 15,026 | $0.0181 | 12% |
| Series plan (part 1 only) | 3 | 8,318 | 17,707 | $0.0092 | 6% |
| Book outline | 1 | 3,033 | 5,670 | $0.0077 | 5% |
| Metadata | 1 | 14,918 | 1,710 | $0.0065 | 4% |
| **Total** | **45** | **279,559** | **171,368** | **$0.1560** | 100% |

Full-length book, same shape (63 calls, $0.2148): chapters $0.1306 (61%), extract $0.0584 (27%),
continuity $0.0089, series plan $0.0073, metadata $0.0059, outline $0.0037. The fixed steps stay
flat while chapters scale, which is why cost per word drops with length.

Observations:

- **Reasoning tokens are ~40% of output** even at `reasoning.effort = 'low'`. Output is billed at
  $0.60/M, so reasoning is the single biggest cost driver after chapter prose itself.
- **Extract is 25% of cost for 1/5th of the words.** It is a simple structured task; a smaller/faster
  model would cut this materially (see §5).
- **Continuity** produced 15k output tokens for a short JSON report — mostly reasoning. Capping its
  budget or moving it to the fast model is worth ~10% of the book.

---

## 3. Margin check against the credit pricing

FE is $17 for 300 one-time credits → **$0.0567 per credit**.

| Preset | Credits | Revenue-equivalent | Measured cost | Gross margin |
|---|---|---|---|---|
| Short | 10 | $0.57 | $0.098 | **5.8×** |
| Standard | 20 | $1.13 | $0.156 | **7.3×** |
| Full | 35 | $1.98 | $0.215 | **9.2×** |

Even at 2× the measured cost (retries, longer books, higher-quality presets) the margin stays
healthy. The **reseller** case is the one to watch: a $97 licence grants 100 customers × 100 credits,
i.e. up to 1,000 Short books = **~$98 of AI cost against $97 of revenue** if every customer burns
every credit. That is a deliberate worst case (P0-1 in the review), not a typical one, but it is worth
re-checking after launch data.

---

## 4. Latency — the real constraint

| Preset | Wall clock | Bottleneck |
|---|---|---|
| Short | 16 min | 9 chapters × ~55 s + plan/outline ~4 min |
| Standard | 26 min | 18 chapters × ~50 s + fixed ~6 min |
| Full | **51 min** | 28 chapters × ~55 s + fixed ~10 min (continuity and metadata are slower at this size) |

Chapters run **sequentially** by design (the bible is updated after each one). At 50 concurrent text
jobs a worker can still serve many users, but a single book takes 16–40 minutes.

Options (not yet implemented):

1. **Fast model for extract / metadata / continuity** — these are structured, low-creativity calls.
   Expected: −25% cost, −4 to −6 min per book.
2. **Pipeline the extract** — write chapter N+1 while chapter N's facts are extracted, merging in
   order. Expected: −25% time, more complex failure handling.
3. **Accept it** and set the expectation in the UI ("your book will be ready in ~30 minutes").

---

## 5. Bugs found by running live (all fixed)

| # | Symptom | Root cause | Fix |
|---|---|---|---|
| 1 | `OpenRouter returned an empty completion`; 6-min failure | Reasoning model spent the whole `max_tokens` budget on hidden reasoning; JSON truncated (`finish_reason: length`) | `reasoning: { effort: 'low', exclude: true }`; all prompt budgets raised; auto-retry with 1.8× budget on `length` |
| 2 | 6 extra repair calls per Short book (40% waste) | `character.status` capped at 40 chars, model wrote plot summaries | Limit raised to 300; prompt now demands a short phrase; extract budget 4k → 3k |
| 3 | 2 extra repair calls per book | `age` returned as number, `style.pov` as a sentence, `conflicts` as objects | Schema made tolerant (coerce `age`, wider text fields, normalise `conflicts`) |
| 4 | Bible filled with empty duplicate characters | Extract returns short names ("Mara") while the plan uses full names ("Mara Vell"); merge treated them as different people and added stubs | **Fixed:** unique first-name matching, full names are never shortened, bare names without substance are ignored. 5 unit tests in `apps/worker/src/pipeline/bibleMerge.test.ts` |

After fixes 1–4 the Full run needed 63 calls (28 chapters + 30 extracts + 5 fixed steps) with no
failed book.

---

## 6. What to re-measure next

- Full-length book (running now) to complete the table.
- A book with `autoCovers` on, once M4 lands (image cost is separate: gpt-image-2 `low`).
- Audiobook cost per book (M6): Kokoro TTS + ffmpeg.
- Re-check after switching extract/continuity to a fast model.

## 7. Cover image policy — published rate, not a measured invoice

As of 24 Oct 2026, covers are fixed to **OpenAI GPT Image 2, low quality** through Replicate.
Neither environment settings nor a request can upgrade image quality to medium/high/auto.

The [provider's published pricing](https://replicate.com/openai/gpt-image-2#pricing) is
**$0.012 per low-quality output image**, approximately **$0.12 for ten template covers**.
The user's target is about $0.01 per cover; the $0.12 ten-cover batch was explicitly approved.
`ImageResult.costUsd` and image usage-log rows use the published estimate because this provider
does not return the actual invoice cost in a prediction response.

Native generation is portrait 1024×1536 for covers. Template covers generate artwork and lettering
together in AI Text Mode; Sharp only resizes the finished image to a 1600×2560 JPEG, without adding
engine-rendered text. Normal book covers still follow the author's chosen AI/overlay mode.
Upscaling and JPEG encoding do not change the requested AI quality tier or incur another AI generation.
