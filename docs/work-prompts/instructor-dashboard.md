# Work prompt — instructor dashboard

> **STATUS: NEXT UP, and now unblocked to start.** The student dashboard it
> depended on landed in PR #12. Refreshed 2026-08-29 against `main` at `1bfa06b`
> — the dependencies below are verified as they now stand, not as they were.

Hand this to `/plan`. Classify as **production**. Read the blocker before
scoping: this is not a UI task.

## Goal

An instructor sees their students' readiness against the syllabus for the rank
each is testing for, and can tell at a glance who is ready to grade.

## The blocker: the current security model forbids this

`firestore.rules` — deliberately, and correctly for a student-only app — says:

```
match /users/{uid} {
  allow get: if isOwner(uid);
  allow list, delete: if false;
}
```

An instructor is not the owner of a student's document, and `list` is denied
outright, so the collection cannot be enumerated. **No amount of UI work gets
around this.** The dashboard needs an access model first, and that is an
architecture decision deserving an ADR, not an implementation detail.

Three approaches, with the cost that actually matters:

| Approach | How it works | Real cost |
|---|---|---|
| Custom claims | Mint an `instructor` claim, allow reads where the claim matches the student's school | Requires `firebase-admin` and a **service-account private key**. ADR 0002 and the coach work both avoided introducing that secret. Reversing that is the decision. |
| School/class documents | `schools/{id}/students/{uid}`, membership drives access | No new secret. More data modelling; students must be enrolled somehow. |
| Student-granted access | A student opts in to sharing with an instructor | Weakest for an instructor's actual workflow — chasing consent — but cleanest on privacy. |

Do not pick one in code. Bring the trade-off to the human, then write ADR 0003.

## Data that already exists

- `src/data/syllabus.json` — 16 ranks and their requirement sections.
- Per-student `progress` **and `rank`** at `users/{uid}`. Rank landed with the
  student dashboard: it is one of the 16 canonical syllabus strings
  (`"10th gup"` … `"6th dan"`), self-selected by the student, and
  `firestore.rules` already validates it. **This dependency is satisfied — do
  not re-model it.**
- `src/lib/rank.ts` — the rank vocabulary and every selector this dashboard
  needs: `RANKS`, `isRank`, `rankIndex`, `rankRecord`, `patternsForRank`,
  `patternsBeforeRank`, and `rankOfPattern`, which joins the two data files that
  spell ranks differently (`syllabus.json` says `"9th gup"`, `patterns.json` says
  `"Yellow Tip / 9th Gup"`). All 16 ranks and all 27 patterns map. Reuse these
  rather than writing a second join.
- `src/components/ProgressDashboard.tsx` — the per-student readiness view, and
  the reference for how a rank's patterns and requirement sections are rendered.
  An instructor view is largely this, per student, behind an access check.
- `ITIF-Handbooks/TITF Gup Examination Sheet.pdf` and the Dan sheet are **blank
  scoring forms**, not data. Their value is the grading schema they name:
  Fundamental Movement, Pattern/Exercise, Sparring/Self Defense,
  Power/Destruction, Theory. That is the natural shape for a readiness view, and
  it maps closely onto the numbered syllabus sections. Parsing the PDFs
  themselves yields nothing; do not spend time on it.

**Honesty constraint inherited from the student dashboard.** The app has data on
patterns only — it knows nothing about a student's stances, sparring,
self-defense, or theory. "Ready to grade" therefore cannot be computed from what
is stored. The student view marks untracked requirements as untracked; an
instructor view must be at least as careful, because here the number would drive
a real decision about a real person.

## Privacy

This shows one person's performance to another. Decide and record: what an
instructor may see, what they may not, whether a student is told, and what
happens to the data when a student leaves. Do not defer this to "later" — it is
cheaper to design in than to retrofit.

## Sequencing

**Unblocked.** The student dashboard landed in PR #12, so `rank` exists on the
user document and its rules validation is written once, in
`firestore.rules::isValidRank`.

The one thing worth doing first is `follow-ups.md` § "Test the Firestore rules".
This work needs the Firebase emulator anyway, and standing it up *before* the
access model changes means the riskiest edit in this project so far is made
against tests rather than after them.

## Definition of done notes

- **Test tooling now exists** — Vitest runs in `verify` and in CI, covering pure
  logic. What is still missing is exactly what this work needs: the rules
  themselves are executed by no test. Adding `@firebase/rules-unit-testing` and
  the Firebase emulator is part of this work. Access-control logic is the last
  thing that should ship unverified.
- Note the current rules shape you are changing: `users/{uid}` allows `get` only
  to its owner, denies `list` and `delete` outright, and validates the document
  to `hasOnly(['progress', 'rank'])`. Writes go through
  `setDoc(..., { merge: true })`, so `request.resource.data` is the merged
  post-write document — a rule that forgets this rejects writes it meant to
  allow. That mistake already cost one round in PR #12.
- When you mirror a rank list into rules again, remember rules cannot import
  JSON. `src/lib/rank.test.ts` parses `firestore.rules` and fails if its list
  drifts from `rank.ts`; extend that guard rather than adding a second
  unguarded copy.
- **ADR 0003 required** for the access model — it is still unclaimed, on purpose.
  CHANGELOG entry required. Any rules change needs
  `firebase deploy --only firestore:rules --dry-run` before publishing, and
  rules deploy **before** the app that depends on them.
