# New Tool Checklist

Run through this before publishing each tool. It maps to STANDARD.md.
(Most items are automatic if the tool uses the shared engine + template.)

## Content
- [ ] Every card has a clear `q` and a correct `a`.
- [ ] Any answer we corrected from her worksheet has `changed: true` **and** her
      `orig` wording. (STANDARD §4, §6)
- [ ] Facts checked; class-specific wording flagged to the parent if unsure.
- [ ] Study content is in the right language; UI stays English. (§6)

## Setup
- [ ] `storageKey` is **unique** to this tool (no reuse from another tool). (§7)
- [ ] `modes` fits the subject — Science includes `flash` + `write`. (§1)
- [ ] `accent` set to the subject color. (§8)
- [ ] File saved at `tools/<subject>/<name>.html`. (§9)
- [ ] Registered in `tools.js` (title, topic, file, date, note). (§9)
- [ ] Subject exists in `tools.js` (the home page adds its filter tile automatically). (§9)

## Behavior (spot-check in a browser)
- [ ] Loads with a **‹ Study Buddy** back link. (§8)
- [ ] Complete a round → **missed list shows question + correct answer**; a
      perfect round shows the positive message. (§2)
- [ ] **View results** shows miss-patterns + per-run log, and Clear works. (§3)
- [ ] Corrected items show the **badge + "You wrote…" callout** on reveal; in
      flashcards it's **hidden until flipped**. (§4)

## Mobile (check at phone width)
- [ ] Long flashcard answers are fully visible (card grows, no clipping). (§5)
- [ ] Multiple-choice options wrap and are easy to tap. (§5)
- [ ] No horizontal scrolling; buttons stack/stretch. (§5)

## Quick technical check
- [ ] Open the file directly (double-click) — it runs without errors.
- [ ] If served from the site, `View results` saves across a reload.
