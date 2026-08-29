# Work prompt — student progress dashboard

> **STATUS: DELIVERED.** Merged in PR #12 (`1bfa06b`, 2026-08-29). Kept for the
> reasoning, not as a to-do. What shipped, what changed against this prompt, and
> what was deliberately left are recorded at the bottom under
> [Outcome](#outcome).

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

- ~~This repo has **no test tooling at all**~~ *(no longer true — Vitest was
  added by this work and runs in `verify` and CI)* — no `test` script, no test files, and
  CI runs `npm ci` + `npm run verify` only. Any progress-merge logic needs tests,
  so tooling has to be chosen and added as part of this work. Say so in the plan
  rather than quietly skipping gate 1.
- CHANGELOG entry required. ADR required if the rank model is non-obvious.

---

## Outcome

Delivered in PR #12. `/progress` shows the patterns for a student's rank with
practice counts and best quiz scores, what is untouched, the requirement
sections the next grading covers, and a collapsed view of earlier ranks.

**Decisions taken** (the open questions above):

1. Rank is **self-selected** from the 16 syllabus ranks. Instructor assignment
   was not built; it stays blocked on the instructor dashboard's access model.
2. "Practised" still means "reached the final movement in the stepper". No
   stronger threshold was added — see `follow-ups.md`.

**What this prompt did not predict.** `practiced` was not merely "a counter with
no threshold": `saveProgress` assigned `update.practiced ?? prev.practiced` while
the stepper always passed `1`, so it was pinned at 1 forever. It now increments,
once per run rather than once per arrival at the last movement.

**Also fixed on the way past**, because `npm ci` failed on every clean checkout
and blocked all of it: a Dependabot bump to TypeScript 7 that `typescript-eslint`
cannot accept (PR #10), and Netlify secrets scanning failing on two non-secret
env values (PR #11).

**Deliberately not done:**

- Syllabus requirements render as reference and are visibly marked untracked.
  The app has data on patterns only, so a completion bar over sparring or theory
  would be a lie.
- Individual requirements are not linked to patterns. Those items are free text
  mixing ITF and WT forms, so the join stays at rank level.
- No ADR. Self-selected rank has no live alternative once chosen, and the merge
  rule is documented in `src/lib/mergeProgress.ts`. **0003 is left free for the
  instructor dashboard's access model.**

**Known limits carried forward** into `follow-ups.md`: the rules are still not
executed by any test, and `saveProgress` still read-modify-writes the whole map.
