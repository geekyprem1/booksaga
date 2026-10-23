# BookSaga — Docs Review

Reviewer: AI code agent · Date: 23 Oct 2026
Scope: [`PRD.md`](./PRD.md) (647 lines) · [`ARCHITECTURE.md`](./ARCHITECTURE.md) (656 lines) · [`TASKS.md`](./TASKS.md) (344 lines)
Method: full read + cross-doc consistency check + arithmetic/factual verification of specs

> Ye document **sirf review** hai. Kisi bhi source doc me koi edit nahi kiya gaya.

---

## 0. Verdict

Docs ki quality industry-average PRD se **kaafi upar** hai. Architecture decisions defensible hain aur implementation detail (SQL functions, queue lifecycle, exporter approaches, test strategy) tak consistent depth hai.

Lekin build shuru karne se pehle **7 blocker** aur **~18 gaps** close karne hain. Sabse bada issue economics ka hai, code ka nahi.

| Severity | Count | Matlab                                                   |
| -------- | ----- | -------------------------------------------------------- |
| 🔴 P0    | 7     | Build/launch block. Inke bina M1 shuru karna risky hai.  |
| 🟠 P1    | 18    | Docs aapas me contradict karte hain ya spec adhoori hai. |
| 🟡 P2    | 14    | Polish/gaps — build ke dauran fix ho sakte hain.         |

**Verified correct (chhedne ki zaroorat nahi):**

- Paperback wrap math — 6×9, 200 pages, white paper → `0.125 + 6 + 0.4504 + 6 + 0.125 = 12.7004"` ✅ (200 × 0.002252 = 0.4504)
- KDP inside-margin table (24–150 → 0.375" … 701–828 → 0.875") ✅
- KDP spine-text minimum 79 pages ✅
- ACX specs: RMS −23…−18 dB, peak ≤ −3 dB, 192 kbps CBR, 44.1 kHz, mono ✅
- KDP keyword limit (7 × ≤50 chars) aur 3 categories ✅
- Ebook cover 1600×2560 (1.6 ratio) ✅
- Length preset arithmetic: 10×1,300 ≈ 13k · 18×1,700 ≈ 30.6k · 27.5×2,000 ≈ 55k ✅
- 12 template categories (list me "All" ke alawa gine to exactly 12) ✅
- 11 plans (FE + 5 OTO + 5 downsell) — PRD §3.1, §12, ARCH §3.3, TASKS T1.9 sab match ✅

---

## 1. 🔴 P0 — Blockers

### P0-1 · Lifetime pricing vs perpetual monthly credits

**Evidence**

- [`PRD.md:59`](./PRD.md:59) — har plan ko **monthly** credits milte hain (FE 150, U-Lite 500, U 1500).
- [`PRD.md:98`](./PRD.md:98) — credits har month reset hote hain, carry-forward nahi.
- [`PRD.md:48-53`](./PRD.md:48-L53) — saare prices **one-time** ($17 / $47 / $37 / $47 / $67 / $97).
- Koi **sunset clause nahi** — na "12 months of credits", na "credits expire with licence".

**Why it blocks**
Ye ek one-time payment pe **infinite recurring COGS** hai. Sabse kharab case:

| Plan       | Price | Credits/month          | Standard books/month (÷20) | Recurring AI cost @ $0.05/book | @ $0.25/book |
| ---------- | ----- | ---------------------- | -------------------------- | ------------------------------ | ------------ |
| FE         | $17   | 150                    | 7.5                        | $0.38                          | $1.88        |
| U (OTO1)   | $47   | 1,500                  | 75                         | $3.75                          | $18.75       |
| Res (OTO5) | $97   | 100 × 150 = **15,000** | **750**                    | **$37.50**                     | **$187.50**  |

Reseller ek $97 one-time pe 100 accounts × 150 credits/month generate kar sakta hai — **har month, hamesha**. Ye launch ke 6–12 mahine me margin kha jaayega.

**Recommended fix**

1. Credits ko **licence-bound** karo: "12 months of monthly credits from purchase date" (ya 24 — decide karke likho).
2. Reseller ke liye **customer credits ko reseller ke pool se cap** karo, ya reseller customers ko "credits purchase karo" model do (reseller ke paas credit wallet ho).
3. PRD §18 Risks table me isko **explicit risk** ke roop me daalo — abhi wahan sirf "credits + daily caps" likha hai, jo recurring exposure ko nahi rokte.

---

### P0-2 · Agency clients ke credits ka source undefined

**Evidence**

- [`PRD.md:76`](./PRD.md:76) — "Agency client accounts ko owner ke plan ki limits milti hain".
- [`PRD.md:420`](./PRD.md:420) — "Credits client ke **apne pool** se jaate hain."
- Par client ne kuch kharida hi nahi → uska pool **kahan se aaya**?

**Why it blocks**
OTO4 ka pura value proposition ("100 clients ko series banao") economically undefined hai. Agar 100 clients owner ke 150/1500 credits share karte hain, toh feature bekaar hai. Agar har client ko alag 1,500 milte hain, toh ye P0-1 ka 100× version hai.

**Recommended fix**
Ek rule likho, e.g.: "Agency owner ke paas **client credit wallet** hota hai (admin se top-up ya plan se allotment). Client ke jobs usi wallet se debit hote hain. Client ka apna credit pool nahi hota." — aur `credit_balances.pool` me `client` value add karo.

---

### P0-3 · Entitlement matrix me 6 columns blank

**Evidence** — [`PRD.md:57-71`](./PRD.md:57-L71)

| Row                                             | Problem                                                                   |
| ----------------------------------------------- | ------------------------------------------------------------------------- |
| Monthly credits, Series limit, Books per series | U-Lite/U me values hain, AB/Ag/Res me `—` (matlab inherit FE? ya zero?)   |
| Series Templates                                | FE = "0 (preview locked)", U-Lite/U = **blank**, DFY-Lite = 40, DFY = All |
| Audiobook credits                               | sirf AB-Lite/AB me; baaki blank                                           |
| Client accounts / Resell licences               | sirf respective OTO me                                                    |

Notation bhi mixed hai: `—`, blank, `❌`, `✅` — chaar tarah ke markers, teen different meanings imply karte hain.

**Sabse important ambiguity:** [`PRD.md:355`](./PRD.md:355) section ka title **"Series Templates (OTO2 / DFY Lite)"** hai, par matrix U-Lite/U ke liye blank chhodta hai. **OTO1 buyer ko templates milte hain ya nahi?** Ye UI, gating, aur seed logic teeno decide karta hai.

**Recommended fix**

1. Har cell bharo — `—` ko explicitly `0` / `inherit FE` / `❌` me resolve karo. Ek legend line add karo.
2. Templates row ke liye explicit decision: `none` / `lite` / `full` per plan (ARCH §3.3 me `templatesTier` field already hai — usi ke values use karo).

---

### P0-4 · `jobs` table me wo columns missing hain jo architecture maang raha hai

**Evidence**

| Column             | Kahan use hota hai                                                             | PRD §12 me? |
| ------------------ | ------------------------------------------------------------------------------ | ----------- |
| `idempotency_key`  | [`ARCH.md:255`](./ARCHITECTURE.md:255), [`ARCH.md:552`](./ARCHITECTURE.md:552) | ❌          |
| `heartbeat_at`     | [`ARCH.md:260`](./ARCHITECTURE.md:260), [`ARCH.md:275`](./ARCHITECTURE.md:275) | ❌          |
| `cancel_requested` | [`ARCH.md:278`](./ARCHITECTURE.md:278)                                         | ❌          |
| `meta jsonb`       | [`ARCH.md:266`](./ARCHITECTURE.md:266)                                         | ❌          |

[`PRD.md:520`](./PRD.md:520) ki list: `user_id, type, ref_id, status, progress, step_label, error, attempts, credits_reserved` — bas.

**Why it blocks**
[`TASKS.md:99`](./TASKS.md:99) (T2.7 heartbeat + cancel) aur [`TASKS.md:101`](./TASKS.md:101) (T2.8 idempotent insert) in columns pe depend karte hain. Migration likhte waqt hi pata chalega. Stuck-reaper (T2.9) bina `heartbeat_at` ke exist nahi kar sakta.

**Recommended fix** — PRD §12 `jobs` row me add karo:
`idempotency_key text unique`, `heartbeat_at timestamptz`, `cancel_requested bool default false`, `meta jsonb`.

---

### P0-5 · `billing_anchor_day` kahin define nahi hai (+ multi-plan anchor ambiguity)

**Evidence**

- [`PRD.md:98`](./PRD.md:98) — "Credits har plan ki `billing_anchor_day` pe monthly reset hote hain."
- [`PRD.md:502`](./PRD.md:502) `user_plans` — `granted_at` hai, `billing_anchor_day` nahi.
- [`PRD.md:505`](./PRD.md:505) `credit_balances` — `period_start` / `period_end` hai, anchor nahi.

**Second problem:** user ne FE 5 Jan ko aur OTO1 20 Jan ko kharida → **do anchor days**. Reset kis din hoga? Undefined. Aur timezone bhi nahi likha (cron 00:10 UTC hai, par user ko "resets on 5th" dikhana hai — kis tz me?).

**Recommended fix**
`user_plans.billing_anchor_day smallint` add karo + rule likho: "anchor = **earliest** active plan ka anchor day; audio pool apna alag anchor rakhta hai." User-facing reset date user ke local tz me dikhao.

---

### P0-6 · BullMQ custom jobId me `:` — enqueue fail karega

**Evidence**

- [`ARCH.md:552`](./ARCHITECTURE.md:552) — idempotency key format: `book:{id}:v{n}`
- [`ARCH.md:255`](./ARCHITECTURE.md:255) — `queue.add(type, {...}, { jobId: idempotency_key })`

BullMQ custom job IDs me `:` allowed nahi hai (Redis key namespace me `:` separator hai) — `queue.add` throw karega. ⚠️ Exact version behaviour BullMQ docs se confirm karo, par design me hi safe separator use karna better hai.

**Recommended fix**
Key format `book-{id}-v{n}` ya `book_{id}_v{n}` karo (dono jagah: enqueue + reaper + T2.8 acceptance test).

---

### P0-7 · "1,000+ users signup" vs public signup OFF

**Evidence**

- [`PRD.md:581`](./PRD.md:581) — NFR: "1,000+ users signup" launch day pe.
- [`PRD.md:289`](./PRD.md:289) — public signup **disabled**; accounts sirf admin, CSV import, ya webhook se.
- [`PRD.md:454`](./PRD.md:454) — webhooks **default OFF**.

**Why it blocks**
Launch day pe 1,000 accounts ka matlab hai 1,000 manual creates ya ek 1,000-row CSV import — plus 1,000 "Copy Login Details" emails. Wo operationally possible nahi. Aur agar webhook ON karke chhoda, toh W+/JVZoo launch se pehle tested hone chahiye (T7.5 abhi M7 me hai — launch ke baad!).

**Second half — throughput:** 200 concurrent book jobs ÷ text concurrency 10 × ~12 min = **~4 ghante** ka queue wait ([`PRD.md:543`](./PRD.md:543), [`PRD.md:581`](./PRD.md:581)). Buyers 4 ghante wait nahi karenge — refund/chargeback.

**Recommended fix**

1. NFR ko sach ke hisaab se likho: "1,000 account provisions (CSV batch) within X hours".
2. Webhook adapters (T7.5) ko **launch-critical** me move karo, ya launch ko pure-CSV model maan ke plan karo.
3. Launch-day worker replicas pre-plan karo (3 workers → 30 text concurrency → ~80 min). Ya `U` plan buyers ko "first 48h me queue delays" expectation set karo.

---

## 2. 🟠 P1 — Cross-doc contradictions & incomplete specs

| #     | Issue                                                                                                                                       | Evidence                                                                                                                                                               | Fix                                                                                                               |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| P1-1  | Export concurrency **3** vs **2**                                                                                                           | [`PRD.md:547`](./PRD.md:547) vs [`ARCH.md:240`](./ARCHITECTURE.md:240) + [`ARCH.md:586`](./ARCHITECTURE.md:586) (`WORKER_EXPORT_CONCURRENCY=2`)                        | Ek value choose karo (2 safer — Chromium memory)                                                                  |
| P1-2  | Export job attempts **3** vs **2**                                                                                                          | [`PRD.md:272`](./PRD.md:272) vs [`ARCH.md:240`](./ARCHITECTURE.md:240)                                                                                                 | Export ko 2 rakho, PRD me exception likho                                                                         |
| P1-3  | Stuck-reaper **30 min** vs **5 min** heartbeat                                                                                              | [`PRD.md:553`](./PRD.md:553) vs [`ARCH.md:275`](./ARCHITECTURE.md:275)                                                                                                 | 5 min heartbeat + 15 min "abandoned" define karo                                                                  |
| P1-4  | Chapter target **2,000–2,500 words** vs preset 1,300/1,700/2,000                                                                            | [`PRD.md:232`](./PRD.md:232) vs [`PRD.md:255-261`](./PRD.md:255-L261); ARCH ka "3–4k output tokens" ([`ARCH.md:330`](./ARCHITECTURE.md:330)) bhi Short se takraata hai | Preset table ko single source banao; generic line ko "preset ke hisaab se" karo                                   |
| P1-5  | Buckets mismatch: PRD me `avatars`, ARCH me `uploads`; **`avatars` + `branding` bucket kisi migration task me nahi**                        | [`PRD.md:173`](./PRD.md:173) vs [`ARCH.md:218-226`](./ARCHITECTURE.md:218-L226); [`TASKS.md:182`](./TASKS.md:182)                                                      | Dono list unify karo + T4.1 me `avatars`/`branding` add karo (T3.13 avatar upload inpe depend karta hai)          |
| P1-6  | **Refund loophole** — plan revoke hota hai, credits claw-back nahi                                                                          | [`ARCH.md:495`](./ARCHITECTURE.md:495) vs [`PRD.md:478`](./PRD.md:478)                                                                                                 | Refund pe "unused granted credits expire" rule + ledger `revoked` entry                                           |
| P1-7  | **Realtime publication missing** — `jobs`/`books`/`notifications` ko `supabase_realtime` me add karne ka koi task/migration nahi            | [`TASKS.md:130`](./TASKS.md:130) (T2.19 live progress iske bina dead hai)                                                                                              | Migration `0002_rls.sql` me `alter publication supabase_realtime add table ...` + `replica identity full`         |
| P1-8  | "Planned books **3–12**" vs "Add More Parts → **plan limit tak (∞)**"                                                                       | [`PRD.md:308`](./PRD.md:308) vs [`PRD.md:329`](./PRD.md:329)                                                                                                           | Hard max define karo (e.g. 30) ya 3–12 ko "initial plan" bolo                                                     |
| P1-9  | **Wrap cover ko page count chahiye**, par auto-cover book generate hote hi ban jaata hai (export se pehle) → estimated count se galat spine | [`PRD.md:379-382`](./PRD.md:379-L382), [`ARCH.md:357`](./ARCHITECTURE.md:357), [`TASKS.md:213`](./TASKS.md:213)                                                        | Rule: paperback wrap **sirf** interior PDF ke baad generate ho; page count badle toh wrap invalidate + regenerate |
| P1-10 | "**Saari** tables pe `id uuid pk`" — `app_settings` (key), `plans` (code), `credit_costs` (action) key-based hain                           | [`PRD.md:496`](./PRD.md:496) vs [`PRD.md:507`](./PRD.md:507), [`522`](./PRD.md:522), [`529`](./PRD.md:529)                                                             | "Except key-value/config tables" exception likho                                                                  |
| P1-11 | `app_settings`/`audit_log` "sirf service role" — par admin panel user JWT + RLS se padhta hai                                               | [`PRD.md:536`](./PRD.md:536) vs [`PRD.md:460`](./PRD.md:460)                                                                                                           | `is_admin()` SELECT policies add karo; secrets (SMTP pass) column-level exclude karo                              |
| P1-12 | **"Pending credentials" list** flow me hai par Admin sections me nahi                                                                       | [`PRD.md:477`](./PRD.md:477) vs [`PRD.md:447-461`](./PRD.md:447-L461)                                                                                                  | Admin → Users me filter/tab + task add karo (email OFF hone pe ye critical hai)                                   |
| P1-13 | **Genre taxonomy defined nahi** — "fiction + non-fiction list" bola, list nahi; templates 12 categories use karte hain                      | [`PRD.md:305`](./PRD.md:305)                                                                                                                                           | `packages/shared/genres.ts` me canonical list; templates categories ke saath map karo                             |
| P1-14 | **Cancel feature PRD me hi nahi** — ARCH me refund rule (`<20% → full refund`) hai, PRD me zero mention; T3.14 isko implement karta hai     | [`ARCH.md:277-278`](./ARCHITECTURE.md:277-L278) vs PRD (absent)                                                                                                        | PRD §8.4/§4 me cancel UX + refund policy add karo                                                                 |
| P1-15 | `$0.05/Standard book` target realistic nahi (~20 ch × ~20k input ≈ 400k input tokens + 40k output + cover)                                  | [`PRD.md:583`](./PRD.md:583)                                                                                                                                           | Target ko "$0.15–0.40, T2.21 se measure" karo; credit costs isi pe tune honge                                     |
| P1-16 | docker-compose paths: PRD root, ARCH `docker/`, TASKS `docker/`                                                                             | [`PRD.md:604-605`](./PRD.md:604-L605) vs [`ARCH.md:132`](./ARCHITECTURE.md:132)                                                                                        | `docker/` pe standardize karo                                                                                     |
| P1-17 | Per-user concurrency **check-then-insert** race — 2 parallel clicks = 2 book jobs                                                           | [`PRD.md:108`](./PRD.md:108), [`ARCH.md:245`](./ARCHITECTURE.md:245)                                                                                                   | Partial unique index: `unique (user_id) where type='book' and status in ('queued','active')`                      |
| P1-18 | `reserve_credits` ke baad `queue.add` fail → credits `reserved` me atke                                                                     | [`ARCH.md:252-255`](./ARCHITECTURE.md:252-L255)                                                                                                                        | Compensating `refund_credits` + `jobs.status='cancelled'`; T2.8 acceptance test me cover karo                     |

---

## 3. 🟡 P2 — Gaps (build ke dauran)

1. **Series "Settings" tab** sidebar me hai ([`PRD.md:331`](./PRD.md:331)) par spec/task nahi — rename, planned books edit, delete, cover style unlock.
2. **Legal pages** (Terms, Privacy, AI-disclosure page) kisi doc me nahi — JV launch pe chahiye.
3. **Admin → credit ledger view** missing — refund/chargeback disputes debug karne ka rasta nahi.
4. **`credit_costs` canonical action keys** undefined — PRD human names deta hai, ARCH `book_${preset}` use karta hai ([`ARCH.md:443`](./ARCHITECTURE.md:443)). Ek enum likho: `book_short|book_standard|book_full|cover|enhance|rewrite|audiobook|metadata`.
5. **"Add More Parts" (arc extend) ka credit cost** defined nahi ([`PRD.md:329`](./PRD.md:329)).
6. **`autoCovers` location** — `series.settings` ([`ARCH.md:357`](./ARCHITECTURE.md:357)) ya UI toggle ([`PRD.md:319`](./PRD.md:319))? Dono ko ek jagah karo.
7. **Next.js "latest stable"** likha hai jabki exact-pin policy hai ([`PRD.md:119`](./PRD.md:119)) — concrete version pin karo.
8. **Model IDs verify** karne ka open item add karo: `gpt-image-2` ka 1600×2560 support, `referenceImages` support, Kokoro voice list ([`PRD.md:127-129`](./PRD.md:127-L129), [`PRD.md:644`](./PRD.md:644)).
9. **ARCH CSV import "sequential, 5 parallel"** — ek hi line me contradiction ([`ARCH.md:496`](./ARCHITECTURE.md:496)).
10. **ACX noise floor ≤ −60 dB** missing ([`PRD.md:413`](./PRD.md:413)).
11. **Templates "120+"** vs seed exactly 120 ([`PRD.md:66`](./PRD.md:66) vs [`PRD.md:360`](./PRD.md:360)).
12. **FE ka 150 credits/month + 3-series lifetime cap** — 3 series ke baad kharch ki jagah nahi par credits aate rehte hain. UX/economics decide karo.
13. **`series.status` allowed values** defined nahi (`books.status` defined hai).
14. **Konva vs `@napi-rs/canvas` "visually identical"** optimistic hai — text wrap/metrics differ karte hain. T4.3 ka screenshot-diff test achha hai, bas fallback (server output = canonical) likho.

---

## 4. Jo genuinely strong hai (isko mat chhedo)

| Area                       | Why it's good                                                                                                                                                                              |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Credit atomicity**       | `reserve → commit → refund` with `SECURITY DEFINER` + `FOR UPDATE`, app code me koi read-modify-write nahi ([`ARCH.md:159-173`](./ARCHITECTURE.md:159-L173)) — race-safe design            |
| **Resumability**           | Chapter-level checkpoints, DB state se skip logic, reaper re-queue ([`ARCH.md:268-275`](./ARCHITECTURE.md:268-L275)) — 25-min jobs ke liye zaroori                                         |
| **Sequential part gating** | Part N sirf N-1 ke baad ([`PRD.md:328`](./PRD.md:328)) — continuity bible sequential hai, isliye ye correct trade-off hai                                                                  |
| **Bible merge**            | Stable IDs + `source: user` protection + `conflicts[]` ([`ARCH.md:361-364`](./ARCHITECTURE.md:361-L364)) — AI ka user edits overwrite karna sabse common bug hai, yahan pehle se roka gaya |
| **Context budgeting**      | 1M context available hone ke bawajood 40–80k pe disciplined ([`ARCH.md:320-333`](./ARCHITECTURE.md:320-L333)) — cost/latency dono ke liye sahi                                             |
| **`AI_MODE=mock`**         | Deterministic fixtures ([`ARCH.md:630`](./ARCHITECTURE.md:630)) — dev aur CI me paisa nahi jalega                                                                                          |
| **KDP pre-flight**         | Page count, trim, margins, cover dims, unresolved `{{NEXT_BOOK_URL}}` warning ([`PRD.md:387`](./PRD.md:387)) — user ko reject hone se bachata hai                                          |
| **Webhook safety**         | Default OFF + toggle-gated 404 + payload not logged when off + idempotency ([`PRD.md:480`](./PRD.md:480))                                                                                  |
| **T2.21 cost calibration** | Real keys se Short/Standard/Full generate karke measure ([`TASKS.md:136`](./TASKS.md:136)) — credit pricing guess pe nahi chalega                                                          |
| **Validation tooling**     | epubcheck, pdf page-size assertions, ffprobe ACX checks ([`ARCH.md:626`](./ARCHITECTURE.md:626)) — exporter bugs pakadne ka sahi tarika                                                    |

---

## 5. Suggested fix order

```
Week 0 (decisions — no code)
  P0-1  credits sunset + reseller model        ← business call
  P0-2  agency client credit pool              ← business call
  P0-3  matrix blanks + templates tier per plan ← product call
  P0-7  launch provisioning model (CSV vs webhook) ← ops call

Week 0 (doc edits — 1 hour)
  P0-4, P0-5, P0-6   schema + queue key fixes
  P1-1…P1-18         consistency pass
  P2 items           backlog me daalo

M1 se pehle
  P1-7 realtime publication migration
  P1-5 avatars/branding buckets
  P1-17 partial unique index
```

---

## 6. Ek line me

Architecture build-ready hai; **economics aur entitlement matrix build-ready nahi hain**. P0-1 se P0-3 pehle decide karo — warna M6 (OTO features) tak pahunch ke pata chalega ki Reseller plan loss-making hai, aur tab refactor mehnga hoga.

---

## 7. Resolution Status (PRD/ARCH/TASKS v1.1, 23 Oct 2026)

| Item                                             | Status                                                                                                                            | Kahan                                   |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| P0-1 lifetime credits                            | ✅ Decided: lifetime monthly; reseller customers 50/month; 60-din inactivity pause                                                | PRD §3.2, §4.2, §18 · ARCH §3.2         |
| P0-2 agency credits                              | ✅ Decided: alag agency pool (Ag-Lite 1,000 / Ag 3,000), per-client cap                                                           | PRD §3.2, §8.14 · ARCH §3.2–3.3 · T6.17 |
| P0-3 matrix blanks                               | ✅ Legend + har cell filled; OTO1 me templates nahi                                                                               | PRD §3.2, §8.8                          |
| P0-4 jobs columns                                | ✅                                                                                                                                | PRD §12 · ARCH §3.1 · T1.6              |
| P0-5 anchor day                                  | ✅ `profiles.credit_anchor_day` = pehla grant                                                                                     | PRD §4.2 · ARCH §3.2                    |
| P0-6 BullMQ `:`                                  | ✅ `{type}-{refId}-v{n}`                                                                                                          | PRD §13 · ARCH §4.2, §9.1               |
| P0-7 launch provisioning                         | ✅ Delivery team ke thank-you page se (app scope ke bahar); app: admin create/CSV + plans assign. Queue: text concurrency 50      | PRD §10.1, §15 · T1.19, T7.2            |
| P1-1 … P1-18                                     | ✅ Sab apply (P1-9 aur P1-11 partially valid the; jo gap tha wo fix kiya)                                                         | —                                       |
| P1-15 cost                                       | ✅ ARCH §5.3 ka "40–80k" galat sum tha (blocks ka total ~14–40k hai). Estimate ab ~$0.07–0.15/Standard book; T2.21 economics gate | PRD §15 · ARCH §5.3 · T2.21             |
| P2-1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14 | ✅ Apply                                                                                                                          | —                                       |
| Extra (review me nahi tha)                       | ✅ Cover art 1856×2784 (paperback front @300 DPI); prompt caching ordering                                                        | PRD §8.9 · ARCH §5.3, §7 · T4.2, T6.3   |

**Update v1.2:** P0-1 ka decision badla. Credits ab **one-time** hain (monthly reset, anchor day aur inactivity pause hata diye), aur credit packs nahi hain. Isse recurring-cost wala risk khatam ho gaya, kyunki har buyer ka max AI cost uske one-time credits tak fix hai. P0-5 (anchor day) ab lagu nahi hota. Details PRD §3.2, §4.2, §20.
