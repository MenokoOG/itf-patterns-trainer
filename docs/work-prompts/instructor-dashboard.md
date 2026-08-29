# Work prompt — instructor dashboard

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
- Per-student `progress` at `users/{uid}` (see the student dashboard prompt;
  a `rank` field is being added there and this depends on it).
- `ITIF-Handbooks/TITF Gup Examination Sheet.pdf` and the Dan sheet are **blank
  scoring forms**, not data. Their value is the grading schema they name:
  Fundamental Movement, Pattern/Exercise, Sparring/Self Defense,
  Power/Destruction, Theory. That is the natural shape for a readiness view, and
  it maps closely onto the numbered syllabus sections. Parsing the PDFs
  themselves yields nothing; do not spend time on it.

## Privacy

This shows one person's performance to another. Decide and record: what an
instructor may see, what they may not, whether a student is told, and what
happens to the data when a student leaves. Do not defer this to "later" — it is
cheaper to design in than to retrofit.

## Sequencing

Depends on the student dashboard landing first, because both need `rank` on the
user document and that field's rules validation should be written once.

## Definition of done notes

- No test tooling exists in this repo yet. Access-control logic is exactly the
  kind of thing that must be tested; the Firebase emulator can test rules
  directly, and adding it is part of this work.
- ADR required for the access model. CHANGELOG entry required. Any rules change
  needs `firebase deploy --only firestore:rules --dry-run` before publishing.
