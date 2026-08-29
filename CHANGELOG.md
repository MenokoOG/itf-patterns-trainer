# Changelog

All notable changes to this project will be documented in this file.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Semver.

## [Unreleased]

### Security
- Firestore security rules scoped to the app's data model. The project was
  running on the console's default open rules: any client, signed in or not,
  could read and write every document, with a hard expiry on 2026-09-26 that
  would then deny all requests. Reads and writes now require
  `request.auth.uid == uid` on `users/{uid}`; `list` and `delete` are denied;
  writes are shape-validated to a `progress` map of at most 200 entries; a
  catch-all match denies everything else.

### Fixed
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
