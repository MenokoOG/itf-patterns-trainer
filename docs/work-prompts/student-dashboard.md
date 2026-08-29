# Work prompt — student progress dashboard

Hand this to `/plan`. Classify as **production**.

## Goal

A signed-in student sees where they stand against the syllabus for their own
rank: what the rank requires, what they have practised, what they have quizzed,
and what is untouched.

## What already exists (verified, not assumed)

- `src/lib/progress.ts` — `ProgressMap`, keyed by pattern slug, each holding
  `{ practiced, quizBest, updatedAt }`. Firestore at `users/{uid}` when signed
  in, `localStorage` otherwise.
- `src/data/syllabus.json` via `src/lib/syllabus.ts` — 16 ranks, each with
  `belt`, `promotesTo`, and numbered `sections` of `{ english, korean }`.
- `src/data/patterns.json` via `src/lib/patterns.ts` — movements per pattern,
  and `groupedByRank()` already groups patterns in curriculum order.
- `firestore.rules` — `users/{uid}` readable and writable by its owner only.

## The blocker to solve first

**A student's current rank is not stored anywhere.** `ProgressMap` has no rank
field and nothing in the user document records one. Without it the dashboard has
no syllabus to measure against, and rank cannot be inferred from progress —
practising Do-San does not make someone 7th gup; an examiner does.

So this change needs a `rank` on the user document, which means:

`firestore.rules` currently pins the document shape:

```
request.resource.data.keys().hasOnly(['progress'])
```

Adding a field **without** widening that rule makes every write fail. Rules and
data model change in the same commit, or the app breaks. Validate the new field
too — a rank is one of the 16 strings in `syllabus.json`, not free text.

## Second problem worth fixing here

Signed-out progress lives in `localStorage`; signing in reads Firestore and the
local map is silently abandoned (`loadProgress` returns the Firestore doc and
never merges). A student who practises for a week, then signs in, watches their
history vanish. Decide the merge rule — most likely per-pattern `max` on
`practiced` and `quizBest`, newest `updatedAt` — and write it down.

## Open questions for the human

1. Who sets a student's rank — self-selected, or instructor-assigned? Self-
   selected is far simpler and can ship first; instructor-assigned depends on
   the instructor dashboard's access model and should not block this.
2. Does "practised" mean anything stronger than "opened the stepper"? It is
   currently a counter with no threshold.

## Definition of done notes

- This repo has **no test tooling at all** — no `test` script, no test files, and
  CI runs `npm ci` + `npm run verify` only. Any progress-merge logic needs tests,
  so tooling has to be chosen and added as part of this work. Say so in the plan
  rather than quietly skipping gate 1.
- CHANGELOG entry required. ADR required if the rank model is non-obvious.
