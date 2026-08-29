# Changelog

All notable changes to this project will be documented in this file.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Semver.

## [Unreleased]

### Security
- Firestore rules now allow a `rank` field on `users/{uid}`, validated against
  the same 16 rank strings the app uses. Writes go through
  `setDoc(..., { merge: true })`, so `request.resource.data` is the merged
  post-write document: the moment any `rank` existed, the old
  `hasOnly(['progress'])` check would have rejected *every* progress write, not
  just rank writes. Rules and data model therefore changed together. `hasOnly`
  permits a subset, so documents written before rank existed stay valid, and
  both fields are individually optional while nothing else may appear.
  Known limit: the rules themselves are still not executed by any test. Doing
  that needs `@firebase/rules-unit-testing` and the Firebase emulator, which
  the instructor dashboard will need anyway; for now they are checked with
  `firebase deploy --only firestore:rules --dry-run` and by hand.
- `/api/coach` now requires a signed-in user. The endpoint spends money on
  every call and had no auth and no rate limiting, so anyone who found it
  could drain the Gemini quota. Requests must carry a Firebase ID token,
  verified server-side against Google's public keys, and are capped at 20 per
  5 minutes per uid. Verification uses `jose` rather than `firebase-admin`
  specifically to avoid provisioning a service-account private key. The rest
  of the app stays sign-in free.
  Known limit: the rate limiter is in-memory, so it resets on cold start and
  is not shared across instances.
- Firestore security rules scoped to the app's data model. The project was
  running on the console's default open rules: any client, signed in or not,
  could read and write every document, with a hard expiry on 2026-09-26 that
  would then deny all requests. Reads and writes now require
  `request.auth.uid == uid` on `users/{uid}`; `list` and `delete` are denied;
  writes are shape-validated to a `progress` map of at most 200 entries; a
  catch-all match denies everything else.

### Changed
- `practiced` counts run-throughs again. `saveProgress` assigned
  `update.practiced ?? prev.practiced` and the stepper always passed `1`, so
  the value was pinned at 1 forever — a boolean wearing a counter's name. It
  now adds, and the stepper scores once per run rather than once per arrival at
  the last movement, so stepping Back then Next no longer inflates the count.
  Reaching the first movement again starts a new run. This still only means
  "reached the final movement"; it does not verify every movement was seen.
- `retrieval.ts` now scores a corpus it does not build, and normalises scores by
  chunk length. Syllabus sections are far longer than single movements and were
  winning on token count alone: a question about one rank pulled in unrelated
  ranks whose sections happened to be long. On "what do I need for 7th gup?"
  on-rank hits went from 5 of 8 to 7 of 8, the eighth being the adjacent rank.
- The coach's system prompt names both sources and asks for Korean terms
  alongside English where the excerpts carry them.

### Fixed
- Signing in no longer throws away signed-out progress. `loadProgress` returned
  the Firestore document and never looked at the local map, so a student who
  practised for a week and then signed in watched the history vanish.
  `mergeLocalIntoAccount` now folds the local map into the account once per
  sign-in, from `AuthContext`, so it happens no matter which page the student
  lands on; readers wait on an `AuthContext.ready` flag rather than reading a
  half-merged account.
  The merge takes the per-pattern `max` of `practiced`, `quizBest`, and
  `updatedAt` rather than summing, because it must be idempotent — it runs on
  every sign-in and a failed-then-retried write must not double-count. The cost
  is that practising the same pattern both signed-out and signed-in collapses
  the two runs instead of adding them; an undercount is the safe direction.
  Local state is cleared only after the write resolves, so a failure leaves the
  local copy intact for the next attempt.
  Known limit: `saveProgress` still reads the whole document and writes the
  whole map back, so a save racing the merge can clobber. Moving to `updateDoc`
  with a `progress.<slug>` dot path would remove the read-modify-write; that is
  a separate change.
- Broken install on a fresh clone: no lockfile was committed, so every clone
  re-resolved floating `^` ranges and got a different dependency tree.
  `package-lock.json` is now committed and direct dependencies are pinned to
  exact versions.
- `npm run lint` hung on an interactive setup prompt. `next lint` is
  deprecated and the project had no ESLint config, so it prompted on every
  run and blocked CI. Replaced with an ESLint flat config
  (`eslint.config.mjs`) invoked as `eslint .`.
- Documented the intentional `round` dependency in the `Quiz` `useMemo`
  (it forces a reshuffle on "Try again"); lint is now clean.

### Added
- Student progress dashboard at `/progress`: the patterns for your rank with
  practice counts and best quiz scores, what is untouched, the requirement
  sections your next grading covers, and a collapsed view of earlier ranks
  (grading tests retention, not only new material). Works signed-out from
  `localStorage`, like the rest of the app.
  The syllabus requirements are shown as reference and marked untracked on
  purpose. The app has data on patterns only — it knows nothing about a
  student's stances, sparring, self-defense, or theory — so a completion bar
  over them would be a lie.
- A student's rank on `users/{uid}`, self-selected from the 16 syllabus ranks.
  Rank cannot be inferred from progress: practising Do-San does not make
  someone 7th gup, an examiner does. Stored as the canonical syllabus string so
  it joins `syllabus.json` with no transformation.
- `src/lib/rank.ts`: the rank vocabulary plus the join between the two data
  files that spell ranks differently — `syllabus.json` says "9th gup",
  `patterns.json` says "Yellow Tip / 9th Gup". All 16 rank labels and all 27
  patterns map. Individual syllabus requirements are deliberately *not* linked
  to patterns: those items are free text mixing ITF and WT forms, so the join
  is at rank level only.
- Test tooling. The project had none at all: no runner, no test files, and CI
  ran `npm ci` + `npm run verify`. Vitest now runs as part of `verify` and in
  CI, covering the progress merge (including its idempotence), the rank join
  across every pattern in the data, and the rank vocabulary. `firestore.rules`
  cannot import JSON, so its rank list is duplicated from `rank.ts`; a test
  parses the rules file and fails if the two drift.
- The coach can now answer rank questions ("what do I need for 7th gup?"), not
  only pattern questions. `src/lib/corpus.ts` builds the retrievable corpus from
  both pattern movements and the rank syllabus: one chunk per movement, one per
  syllabus section, since a section only means anything as a group. 1186 chunks.
- `src/lib/syllabus.ts` and syllabus domain types.
- `src/data/syllabus.json`: the rank syllabus for all 16 ranks (10 gup, 6 dan),
  extracted from the TITF Color Belt and Black Belt handbooks. Each rank record
  carries its belt, the rank it promotes to, and numbered requirement sections;
  every entry keeps the English name and the Korean romanisation in separate
  fields. 425 entries.
- `tools/parse_syllabus.py`, the parser that produces it, plus the source PDFs
  in `ITIF-Handbooks/` so the data can be regenerated and checked against its
  source. Requires poppler's `pdftotext`.
- `docs/adr/`, starting with the record-decisions ADR and one covering handbook
  provenance and the extraction pipeline.
- `firestore.rules`, `firebase.json`, and `.firebaserc`, so the rules can be
  validated and deployed from the repo rather than pasted into the console.
- `.github/instructions/`: CodeGuard engineering standards this project is
  reviewed against.
- README: prerequisites, install, commands, env var reference, Gemini and
  Firebase setup, setup verification, troubleshooting, and known limits.
- `engines` (Node >=20.9.0, npm >=10) plus `.nvmrc` and `.npmrc` with
  `engine-strict` and `save-exact`, so an unsupported toolchain fails fast.
- `npm run verify` (typecheck + lint + build) as the pre-push gate.
- GitHub Actions CI running `npm ci` + verify, plus a dependency audit job.
- Dependabot for weekly npm and GitHub Actions updates.
- Explicit `allowScripts` denials for the `@firebase/util`, `@google/genai`,
  and `protobufjs` install scripts. All three were reviewed and are no-ops
  for this project.

### Security
- Accepted risk: high-severity `postcss` advisory via the copy bundled inside
  `next@15.5.24`. Only fixable by upgrading to Next 16 (breaking). Not
  reachable here — the app processes only first-party CSS. CI fails on
  `critical` only. Revisit at the Next 16 upgrade.

## [0.1.0] - 2026-08-27

### Added
- PROTOTYPE (declared spike, not for student handoff yet).
- All 27 Chang-Hon patterns (Saju Jirugi through Tong-Il) extracted from
  "ITF Patterns Instructions" PDF into `src/data/patterns.json`, decoded
  from a broken font encoding and validated against declared movement
  counts and page images.
- Mobile-first pattern browser grouped by rank; movement stepper and full
  list per pattern.
- Quiz mode: next-movement, movement-count, and ready-posture questions
  with best-score tracking.
- RAG study coach: local lexical retrieval over pattern data + Gemini
  generation (`/api/coach`), 25s timeout, no retry, structured errors.
- Optional Firebase: Google sign-in + Firestore progress; app degrades to
  localStorage when env vars are absent.
