# Study Tool Standard

The contract every study tool on this site follows. If a tool can't meet a
**MUST**, we change the tool — not the standard — unless we deliberately revise
this doc. Claude will suggest updates to this standard as we build more tools and
learn what works.

Last updated: 2026-09-02 · v1

---

## 1. Modes (how a student practices)

Each tool declares which **modes** it offers. Available modes:

| Mode        | id       | What it is                                                        |
|-------------|----------|-------------------------------------------------------------------|
| Flashcards  | `flash`  | Flip card: prompt on front, answer on back.                       |
| From scratch | `write`  | Type the answer; the tool auto-grades, student can accept/override.|
| Multiple choice | `mc` | Pick from options; distractors are drawn from other real answers in the set.|
| Match | `match` | Batches of up to 5 prompts (left) against their answers plus extra decoys (right, up to 10 total) — tap a prompt, then tap the answer you think it pairs with. Cycles through the whole section in rounds of 5 (never repeats a prompt within a pass) so it tests recall across the full set, not just a few words at a time. Scored like `mc` (right on the first try = correct); a wrong pairing records that prompt as missed but lets the student keep trying.|
| Some help | `build` | Show the prompt + the answer's letters scrambled as tap-tiles; tap them in order to spell it. The "in-between" step between recognition (mc/match) and free recall (write). Uses `card.a` as the target; spaces auto-fill for multi-word answers.|
| Conjugation | `conj`   | Language tools: show prompt + a random pronoun; type the exact conjugated form. Needs each card to carry a `forms` array (index-aligned with `pronouns`).|
| Conjugation table | `conjtable` | Language tools: show the prompt and blanks for all pronouns; type every form. Grades each form; the missed-list shows which specific forms were wrong.|

Note the display labels don't always match the id — `write` shows as "From scratch", `build` shows as "Some help", `match` shows as "Match" — chosen to read as a plain-English difficulty ladder rather than technical mode names (see the three-tier pattern below).

**A three-tier difficulty progression** — a good default for vocab-heavy tools once there's enough content per section (~6+ cards):
```js
modes: ["match", "build", "write"]   // order matters: chips display left-to-right
```
This reads to the student as **Match → Some help → From scratch** — recognize the pairing, then reconstruct it from scrambled letters with partial scaffolding, then produce it with no help at all. Each tier is objectively harder than the last, so a student who's shaky can start at Match and work up, and results/history track each tier separately (same `storageKey`, different `mode`), so you can see exactly which tier he's stuck at.

**Navigation depth**
- Most tools use two levels: **Section → Mode** (via `sections` + `modes`).
- Tools that need a third level set `tracks` instead: **Track → Group → Mode**.
  Each track has its own `groups` and `modes`, and an optional
  `defaultModeFor(groupId)` to pick a smart default mode per group (e.g. the verb
  tool: irregular groups default to the `conjtable`, the Regular group to `conj`).
  Two-level tools are unaffected — `tracks` is fully opt-in.

**Strict matching (`strictMatch`)**
- Prose tools (Science, etc.) leave `strictMatch` off — write-in grades by keyword
  overlap (forgiving), since answers are sentences.
- Word-precise tools (vocab, verbs) set `strictMatch: true` — write-in and
  conjugation require an **exact** match, accents included (case-insensitive).
  These tools show an accent-key row (á é í ó ú ñ ü) for easy typing.
- Either way, the student can still accept/override the verdict.

**Rules**
- **MUST** — Every tool offers at least one mode.
- **MUST** — **Science tools offer Flashcards + From scratch** at minimum. (Add `mc` only if it fits the content.)
- **SHOULD** — Language/vocab tools use the three-tier progression (`match` → `build` → `write`) once a section has ~6+ cards; fall back to Multiple choice + From scratch for smaller sections where `match` wouldn't have room for real decoys.
- The tool shows a mode picker only if it has more than one mode.

## 2. Missed-questions review (non-negotiable)

- **MUST** — After completing a round, show a **"Review these"** list of every
  item missed that round, each with **the correct answer** (not just the prompt).
- **MUST** — A perfect round shows a positive "you got them all" message instead.
- **MUST** — Missed items are **de-duplicated** (each appears once per round).
- Definition of "missed" per mode:
  - `flash` → student tapped "Study again later."
  - `write` → the **accepted** verdict was "missed" (after any override).
  - `mc` → student chose a wrong option.

## 3. Results history + patterns (persists across rounds)

- **MUST** — Every completed round is saved to a persistent history (per device).
- **MUST** — A **"View results"** screen shows, per section/mode:
  - a **miss-pattern** list (which items were missed most often, highest first), and
  - a **per-run log** (date, score, what was missed).
- **MUST** — A way to **clear** the history.
- History is keyed per tool, so tools don't mix.
- **MUST** — Stopping partway through a round still saves progress, not just full
  completions. If he switches section/mode mid-round, or just closes the tab,
  that partial attempt is logged as its own run — "8 of 12 attempted (stopped
  early) — 7 correct" — rather than being silently lost. Partial rounds do
  **not** count toward the "Best" score (only a full completion can set a new
  best), but individual word attempts within a partial round still update word
  mastery (§3a) immediately, same as any other attempt.

## 3a. Word mastery (per word, per mode)

Beyond round-level history, the engine tracks **the last 3 attempts per word,
per mode** — not a single collapsed label, the actual recent sequence.

- **Display:** each word × mode cell in "View results" shows **3 small dots**,
  oldest to newest, left to right — green (correct), red (missed), or grey
  (not yet attempted, padding out slots that don't have history yet). Never
  attempted at all in that mode shows a plain dash instead of three greys —
  a dash reads as "nothing yet," not a wall of grey dots.
- **Why dots instead of a computed label** ("Solid" / "Needs practice"): a
  single label collapses information a parent actually wants. `grey·red·green`
  and `grey·green·green` were both "2 attempts, currently on a streak of 1-2"
  under the old label — but one is "stumbled, then recovered" and the other is
  "clean so far." The dots show the difference; a label can't.
- **Why per-mode, not one blended row:** recognizing a word (Match) and
  producing it from memory (From scratch) are genuinely different skills. A
  word solid in one tier and shaky in another is a real, useful signal —
  blending them into one row would erase exactly the distinction the
  three-tier progression (§1) exists to surface.
- This is tracked automatically by the engine for every mode (`flash`, `write`,
  `mc`, `match`, `build`, `conj`, `conjtable`) — a new tool gets it for free,
  nothing to configure.

## 3b. Focused Practice (pick up to 5 words, copy 5x, then a mini quiz)

From the mastery table (§3a), each word row has a checkbox — **up to 5 words,
from anywhere in the tool** (not limited to one section), can be picked for a
focused drill:

1. **Copy-practice.** A new screen shows one card per chosen word — the
   English prompt, the Spanish answer shown directly, and 5 blank inputs to
   write it out. Each input gets a gentle color cue on blur (green/red,
   reusing the same look as the verb-conjugation table) so a typo gets caught
   while copying, but there's no hard gate — he can move on whenever he wants,
   filled in or not.
2. **Mini quiz.** Same 5 words, shuffled order, this time with nothing shown —
   ordinary write-in grading (accept/override, accent row, corrected-answer
   badges, all identical to normal From-scratch mode).
- **MUST** — The mini quiz's per-word results feed the *same* word-mastery
  history (§3a) as any other From-scratch attempt — practicing this way
  genuinely moves the needle on his real mastery data, it isn't a side track.
  It's recorded under the `write` mode key specifically, so a tool needs
  `write` among its declared `modes` for Focused Practice results to have a
  column to show up in.
- The mini quiz is logged as its own "Focused Practice" entry in the results
  history (§3), but does **not** count toward any section's "Best" score —
  there's no stable, comparable baseline for an ad-hoc, differently-sized set
  of words each time.
- The copy-practice phase itself is **not** graded or recorded anywhere — it's
  looking-at-the-answer practice, not a recall test, so it shouldn't add a dot
  to the mastery history (only the quiz that follows it does).

## 4. Corrected answers (when we fix the student's original)

When a tool's answer differs from the student's original worksheet answer:
- **MUST** — Mark that item as `changed` and store her `orig` (original wording).
- **MUST** — When the answer is revealed, show a **"corrected"** badge **and** a
  callout with her original response ("You wrote: …").
- **MUST (flashcards)** — The corrected callout is hidden until the card is
  flipped to the answer (never visible on the prompt side).
- **SHOULD** — In `View results`, corrected items are visually distinguishable.

## 5. Mobile / cross-device

- **MUST** — Works in a phone browser. Includes `<meta name="viewport" ...>`.
- **MUST** — **Flashcards** size to their tallest face so long answers never clip;
  re-measure on rotate/resize.
- **MUST** — **Multiple choice** options wrap and are tap-friendly (full-width,
  ≥44px tall targets).
- **MUST** — Buttons stack/stretch on narrow screens; no horizontal scrolling.
- **SHOULD** — Respect `prefers-reduced-motion` (no flip/slide animations then).

## 6. Content accuracy

- **MUST** — If the source (student worksheet, notes) contains an error, the tool
  uses the **corrected** answer and flags it per §4. Never teach a known-wrong
  answer.
- **SHOULD** — Where a fact is class-specific (e.g. which checkpoint names a
  teacher uses), note it so the parent can confirm.
- Study **content** stays in the subject's language (e.g. Spanish answers stay
  Spanish); **UI/instructions** are in English.

## 7. Persistence & privacy

- **MUST** — Progress, best scores, and history save on the **device/browser**
  only (via the storage API). Nothing is uploaded.
- **MUST** — If storage isn't available, the tool still works for the session
  (it just can't save best/history).
- **MUST** — Changing the internal data format resets saved progress **gracefully**
  (detect mismatch → fresh start, never crash).

## 8. Look & feel

- **MUST** — Use the shared engine + stylesheet so tools look and behave alike.
- **MUST** — A **"‹ Study Buddy"** back link to the site home.
- Subject accent color is set per tool (a CSS variable) for a light touch of identity.
- Tone: encouraging, plain language, sentence case. Errors/empties give direction.

## 9. Site integration

- **MUST** — Tool file lives at `tools/<subject>/<name>.html`.
- **MUST** — Registered in `tools.js` with `title`, `topic`, `file`, `date`, and
  (optional) `note`.
- **MUST** — Its subject exists in `tools.js` (the home page filters by it automatically).

---

## How a new tool gets built (process)

1. Copy `_template/` to `tools/<subject>/<name>.html`.
2. Fill in the **content block** (sections → cards, each with `q`, `a`, and
   optional `orig` + `changed`), and set the tool's title, subject accent, and
   `modes`.
3. Register it in `tools.js`.
4. Run through **CHECKLIST.md** before publishing.

The engine (`assets/study-engine.js`) already implements §2–§5 and §7, so a new
tool that uses it inherits the missed-list, history/patterns, corrected-answer
highlighting, and mobile behavior automatically.
