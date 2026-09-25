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

## 3a. Word mastery (per word, per mode)

Beyond round-level history, the engine tracks **mastery per word per mode** —
not just "missed how many times" but "is this word actually solid right now."

- **Rule:** a word is **Solid** in a mode once the last 3 attempts in that mode
  came back correct **in a row**. Any wrong attempt resets that word's streak to
  0 — it goes back to **Needs practice** until he strings together 3 clean
  answers again. Never attempted in that mode = **Not tried yet** (shown as a
  plain dash, not a warning — it isn't a red flag).
- **Why per-mode, not one blended score:** recognizing a word (Match) and
  producing it from memory (From scratch) are genuinely different skills. A
  word solid in one tier and shaky in another is a real, useful signal —
  blending them into one number would erase exactly the distinction the
  three-tier progression (§1) exists to surface.
- **MUST** — The "View results" screen shows a **word × mode table** for each
  section/group: rows are the section's words, columns are the modes this tool
  offers, cells show Solid / Needs practice / Not tried yet. This sits above
  the existing miss-pattern detail (§3), since "what does he need to practice
  right now" is the more immediate question.
- This is tracked automatically by the engine for every mode (`flash`, `write`,
  `mc`, `match`, `build`, `conj`, `conjtable`) — a new tool gets it for free,
  nothing to configure.

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
