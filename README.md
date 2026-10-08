# ITF Patterns Trainer

Mobile-first Next.js app for students practicing the Chang-Hon (ITF) tuls,
all 27 patterns from Saju Jirugi to Tong-Il, with a movement stepper, quiz
mode, and a RAG study coach powered by OpenAI.

> **STATUS: PROTOTYPE (declared spike).** Runs locally; not hardened for
> student handoff. See [CHANGELOG.md](CHANGELOG.md) for what exists and
> [Known limits](#known-limits) for what does not.

---

## Quick start

```bash
git clone https://github.com/MenokoOG/itf-patterns-trainer.git
cd itf-patterns-trainer
npm ci
npm run dev
```

Open <http://localhost:3000>.

**The app runs with no API keys at all.** Sign-in hides itself, progress goes
to `localStorage`, and the coach returns a clear 503. To enable the optional
features, see [Configuration](#configuration).

---

## Prerequisites

| Requirement | Version | Notes |
| --- | --- | --- |
| Node.js | `>=20.9.0` | Developed and verified on **24.19.0** (see `.nvmrc`) |
| npm | `>=10.0.0` | npm 11.x recommended |

`engine-strict=true` is set in `.npmrc`, so an unsupported Node version fails
the install immediately with a clear message instead of a confusing build error.

Using [nvm](https://github.com/nvm-sh/nvm) / [nvm-windows](https://github.com/coreybutler/nvm-windows):

```bash
nvm install 24.19.0
```

---

## Install

Use `npm ci`, it installs the exact tree recorded in `package-lock.json` and
is the only supported install path:

```bash
npm ci
```

Use `npm install` **only** when you intend to change dependencies; it may
update the lockfile, which must then be committed.

Direct dependencies are pinned to exact versions (no `^`) and the lockfile is
committed, so every clone resolves to a byte-identical tree.

---

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server with hot reload on <http://localhost:3000> |
| `npm run build` | Production build |
| `npm start` | Serve the production build (run `build` first) |
| `npm run typecheck` | `tsc --noEmit`, strict mode |
| `npm run lint` | ESLint flat config, non-interactive |
| `npm run lint:fix` | ESLint with `--fix` |
| `npm test` | Vitest, unit tests for the pure logic |
| `npm run test:watch` | Vitest in watch mode |
| `npm run test:rules` | Executes `firestore.rules` against the Firestore emulator (needs Java + Firebase CLI; not in CI) |
| `npm run verify` | `typecheck` + `lint` + `test` + `build`, run before pushing |

To use a different port:

```bash
npm run dev -- -p 3001
```

---

## Configuration

All configuration is via environment variables. Copy the template and fill in
what you need:

```bash
cp .env.example .env.local
```

`.env.local` is gitignored, **never commit it**. Restart the dev server after
editing it.

### Variables

| Variable | Required | Enables | Notes |
| --- | --- | --- | --- |
| `OPENAI_API_KEY` | No | The `/api/coach` RAG coach | Server-side only, never sent to the browser. Without it the coach returns HTTP 503. `OPEN_AI_KEY` is accepted as an alias, that is the name the Netlify environment uses. |
| `OPENAI_MODEL` | No |, | Defaults to `gpt-5-mini`. |
| `NEXT_PUBLIC_FIREBASE_API_KEY` | No | Google sign-in + cloud progress | Client-side. `NEXT_PUBLIC_*` values are embedded in the browser bundle, expected for Firebase web config. |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | No | Google sign-in + cloud progress | |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | No | Google sign-in + cloud progress | |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | No | Google sign-in + cloud progress | |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | No | Google sign-in + cloud progress | |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | No | Google sign-in + cloud progress | |

Firebase activates only when `API_KEY`, `PROJECT_ID`, and `APP_ID` are all
present; otherwise every Firebase export is `null` and progress falls back to
`localStorage`.

### Getting an OpenAI key

1. Open the [OpenAI API keys page](https://platform.openai.com/api-keys).
2. Create a secret key for the project you want billed.
3. Put it in `.env.local` as `OPENAI_API_KEY=...`.

The coach is metered per question, so the project needs a positive credit
balance. If it runs dry the endpoint returns 503 with a message telling the
student to contact their instructor, see `isQuotaExhausted` in
`src/lib/coachErrors.ts`.

### Firebase setup (one-time, optional)

1. Create a project at the [Firebase console](https://console.firebase.google.com/).
2. **Authentication** → enable the **Google** provider.
3. **Firestore** → create a database.
4. **Project settings → Your apps → Web app** → copy the config values into
   the `NEXT_PUBLIC_FIREBASE_*` vars above.
5. Firestore rules live in [`firestore.rules`](firestore.rules), do not write
   them by hand in the console, or the next deploy will overwrite your edit.
   They scope `users/{uid}` to its owner, deny `list` and `delete`, validate the
   document down to a `progress` map and a `rank` from the 16 known ranks, and
   deny everything else. Deploy them with:

   ```bash
   firebase deploy --only firestore:rules --dry-run   # check first
   firebase deploy --only firestore:rules
   ```

   The rank list is duplicated in the rules because rules cannot import JSON;
   `npm test` fails if it drifts from `src/lib/rank.ts`.

---

## Verifying your setup

```bash
npm run verify
```

Then, with the dev server running:

```bash
curl -i -X POST http://localhost:3000/api/coach -H "Content-Type: application/json" -d "{\"question\":\"How many movements are in Chon-Ji?\"}"
```

- **503** with `"Coach is not configured"` → no `OPENAI_API_KEY` (expected default).
- **401** with `"Sign in to ask the coach."` → the key is set, but the coach requires a verified Firebase ID token. Send one as `-H "Authorization: Bearer <ID token>"`.
- **429** → more than 20 questions in 5 minutes from one account.
- **200** with an `answer` and `sources` → the coach is live.

---

## Architecture

```
src/
  app/
    page.tsx                  home, patterns grouped by rank
    patterns/[slug]/page.tsx  movement stepper + full movement list
    quiz/[slug]/page.tsx      quiz mode
    progress/page.tsx         student progress dashboard
    coach/page.tsx            coach chat UI
    api/coach/route.ts        RAG generation endpoint (server-only)
  components/                 AuthButton, CoachChat, MovementStepper,
                              ProgressDashboard, Quiz
  context/AuthContext.tsx     Firebase auth state + sign-in progress merge
  data/patterns.json          all 27 patterns, extracted + verified from the PDF
  data/syllabus.json          the 16 rank syllabi, from the TITF handbooks
  lib/
    patterns.ts               pattern lookup + slugging
    syllabus.ts               rank syllabus lookup
    rank.ts                   rank vocabulary + the patterns/syllabus join
    mergeProgress.ts          pure merge of local into account progress
    corpus.ts                 what the coach may answer from: one chunk per movement, one per syllabus section
    retrieval.ts              RAG retrieval, local TF-IDF ranking over those chunks
    verifyIdToken.ts          Firebase ID token check against Google's public keys (jose); fails closed
    rateLimit.ts              per-account fixed-window limiter, in memory
    retry.ts                  bounded retry against a wall-clock deadline
    coachErrors.ts            maps upstream failures to student-facing messages
    firebase.ts               env-guarded Firebase init
    progress.ts               Firestore when signed in, localStorage otherwise
    types.ts                  domain types
tools/parse_itf.py            one-off PDF extraction script (not part of the build)
tools/parse_syllabus.py       rebuilds data/syllabus.json from the handbook PDFs
```

**Source PDFs are not in this repo.** The handbooks are third-party material, so
`data/patterns.json` and `data/syllabus.json` ship as extracted data only. To
regenerate them, put your own copies in `ITIF-Handbooks/` (git-ignored) and run
`python tools/parse_syllabus.py`. The app does not need the PDFs to build or run.

**Conventions:** one responsibility per file; strict TypeScript everywhere
(`strict` plus `noUncheckedIndexedAccess`); every external call has an explicit
timeout, and the coach's one paid call retries transient failures only inside its
25s budget; failures degrade to local state rather than throwing
into the UI.

**RAG design:** retrieval is deterministic and offline (lexical TF-IDF over
per-movement chunks), so it can be swapped for embeddings later without
changing callers. Generation is OpenAI, grounded strictly on retrieved chunks,
within a 25s total budget (up to 3 attempts), with structured error JSON. The coach needs a signed-in account and allows 20 questions per 5 minutes per account.

---

## Troubleshooting

**`npm install` pulls different versions than a teammate, or a fresh clone
breaks.**
Use `npm ci`, not `npm install`. If the lockfile is missing or stale, run
`rm -rf node_modules package-lock.json && npm install`, then commit the
regenerated `package-lock.json`.

**`Unsupported engine` on install.**
Your Node is below 20.9.0. Install the version in `.nvmrc` (24.19.0).

**`npm run lint` opens an interactive prompt and hangs.**
Fixed, the project now uses an ESLint flat config (`eslint.config.mjs`) and
runs `eslint .` directly. The old `next lint` prompted for setup and hung CI.
If you still see this, you are on a stale checkout.

**Coach always returns 503.**
`OPENAI_API_KEY` (or `OPEN_AI_KEY`) is unset, or `.env.local` was added after
the server started. Restart the dev server. A 503 that mentions a usage
allowance is a different problem: the OpenAI project is out of credit.

**Sign-in button does not appear.**
Expected when the Firebase vars are absent. Add all of `API_KEY`,
`PROJECT_ID`, and `APP_ID` to turn it on.

**Port 3000 is already in use.**
`npm run dev -- -p 3001`.

**Stale build artifacts.**
`rm -rf .next && npm run dev`.

---

## Known limits

- **Prototype, not production.** No service worker / offline support.
- **Partial test coverage.** Vitest covers the pure logic, progress merging,
  the rank join, the rank vocabulary shared with `firestore.rules`, and
  `npm run test:rules` executes the rules themselves against the Firestore
  emulator. There are still no component or end-to-end tests. The rules suite
  needs Java and the Firebase CLI, so it is deliberately outside `npm test`
  and does not run in CI; run it by hand when you touch `firestore.rules`.
- **TypeScript majors are pinned.** `typescript` is held at 6.x and Dependabot
  is told to skip its majors, because `typescript-eslint` declares
  `typescript: ">=4.8.4 <6.1.0"` and no release yet accepts TypeScript 7. A
  grouped bump to 7.0.2 produced a lockfile `npm ci` refused to install, which
  broke CI and the Netlify deploy. Lift the pin when typescript-eslint
  supports it.
- **Install scripts are denied by default.** The `allowScripts` field in
  `package.json` explicitly denies the install scripts of `@firebase/util`,
  `@google/genai`, and `protobufjs`. All three were reviewed and are no-ops
  for this project: `@firebase/util` only acts on the `FIREBASE_WEBAPP_CONFIG`
  env var (unset here), `protobufjs` only emits a version-scheme warning, and
  `@google/genai` is a literal `echo`.
- Coach answers only from pattern text and the rank syllabus, no diagrams, no video.
- **The rate limiter lives in process memory.** It resets on cold start and is not shared across serverless instances, so it slows one account and is not a hard cap.
- Quiz distractors are drawn from the same pattern only.
- **Rank is self-declared.** A student picks their own rank; nothing verifies
  it against an instructor. `practiced` counts reaching the last movement in
  the stepper, which is not the same as having practised well, and the
  dashboard tracks patterns only, stances, sparring, self-defense and theory
  are shown as reference and are not measured.
- `saveProgress` reads the whole user document and writes the whole map back,
  so a save racing the sign-in merge can clobber. Dot-path `updateDoc` would
  remove the read-modify-write.

---

## Contributing

1. Branch from `main`.
2. `npm run verify` must pass before you push. CI runs the same steps on
   every PR via `npm ci`.
3. If you change dependencies, commit the updated `package-lock.json` in the
   same commit.
4. Update [CHANGELOG.md](CHANGELOG.md), the project follows
   [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and semver.
