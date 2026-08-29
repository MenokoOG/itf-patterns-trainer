# Work prompt — follow-ups

Smaller, independently shippable work, each surfaced by a change that has
already landed. Written 2026-08-29 against `main` at `1bfa06b`. Ordered by what
would hurt most if left alone.

Hand any one of these to `/plan` on its own. None of them are large enough to
need the whole ceremony, but the first is the only thing standing between this
project and an untested security boundary.

---

## 1. Test the Firestore rules — do this before the instructor dashboard

**Classify as production.**

`firestore.rules` is the entire access boundary of the app, and **no test
executes it.** It is checked today by `firebase deploy --only firestore:rules
--dry-run` and by hand. `--dry-run` validates syntax; it does not tell you
whether an unauthorised read is denied.

That was an acceptable gap while the rules said "the owner, and nobody else".
It stops being acceptable the moment the instructor dashboard widens them to let
one person read another person's document.

Add `@firebase/rules-unit-testing` and the Firebase emulator, and cover at
minimum:

- an owner can `get` their own document; a signed-in non-owner cannot
- `list` and `delete` are denied to everyone, including the owner
- a write of `rank` outside the 16 known strings is rejected
- a write introducing any field other than `progress` and `rank` is rejected
- a `progress`-only document — the shape written before `rank` existed — is
  still valid, since `hasOnly` permits a subset
- a merge write is validated against the **merged** document, not the patch

Wire the emulator into `npm test` if it can run unattended, or into a separate
`test:rules` script plus a CI job if it needs a Java runtime the other tests do
not. Do not let it silently not-run in CI — a rules test that never executes is
worse than none, because it reads as coverage.

The instructor dashboard needs this anyway. Doing it first means the riskiest
edit in this project is made against tests instead of after them.

---

## 2. Remove the read-modify-write in `saveProgress`

**Classify as production.** Small, well understood, no open questions.

`saveProgress` in `src/lib/progress.ts` reads the whole user document and writes
the whole `progress` map back. Two writes racing — or a write racing the
sign-in merge in `mergeLocalIntoAccount` — can lose one of them: last writer
wins with a map it read before the other landed.

Replace it with a dot-path `updateDoc` on `progress.<slug>` so a write touches
one pattern and never carries a stale copy of the others.

Two things to get right:

- `updateDoc` fails on a document that does not exist yet, where `setDoc(...,
  { merge: true })` creates one. A first-time student has no document. Handle
  the create.
- The rules validate `request.resource.data.progress` as a map with
  `size() <= 200`. Confirm a dot-path update still satisfies that, and cover it
  in the rules tests from item 1 rather than assuming.

Existing behaviour to preserve: `quizBest` takes the max, `practiced`
increments, and every failure degrades to `localStorage` rather than throwing
into the UI.

---

## 3. Decide what "practised" should mean

**Classify as product, not engineering.** Needs a human answer before code.

`practiced` now honestly counts run-throughs, but a run-through only means the
student reached the final movement in the stepper. Tapping Next thirty times
without reading counts the same as practising.

This was left open deliberately when the student dashboard shipped. It matters
more once an instructor sees the number, because then it stops being a private
nudge and starts looking like evidence.

Options, cheapest first:

- Leave it, and label it honestly in the UI as "times stepped through".
- Require every movement to have been visited before counting a run, not just
  the last one. Needs the stepper to track visited movements.
- Add dwell time, so instant tapping does not count. More faithful, more
  fiddly, and easy to make annoying.

Do not pick one in code. It is a question about what the app is claiming.

---

## 4. Protect `main`

**Not a code change — a repo setting, for whoever owns the GitHub org.**

CI was red on `main` from PR #4 until PR #10, and nobody noticed until a Netlify
deploy failed. PR #4 was merged while its own checks were failing.

Require the `typecheck / lint / test / build` job to pass before merge. That one
setting would have contained the whole incident at its source.

While there: Dependabot currently ignores TypeScript majors
(`.github/dependabot.yml`) because `typescript-eslint` declares
`typescript: ">=4.8.4 <6.1.0"` and no release accepts TypeScript 7. **Drop that
ignore when typescript-eslint ships TS 7 support**, or the project silently sits
on an old compiler forever.

---

## 5. Operational, not code

- **Firebase authorised domains.** Sign-in fails on the deployed site with
  `auth/unauthorized-domain` until `itfpatternstrainer.netlify.app` is added
  under Authentication → Settings → Authorized domains. Firebase takes exact
  hostnames, not wildcards, so Netlify deploy previews cannot have working
  sign-in without adding each preview URL by hand. Previews run signed-out;
  that is fine, but know it before debugging it twice.
- **Deploy rules before the app,** always. The rules are backwards compatible in
  the widening direction; an app that writes a field the deployed rules do not
  know about has every write rejected.
