# ITF Patterns Trainer

Mobile-first Next.js app for students practicing the Chang-Hon (ITF) tuls —
all 27 patterns from Saju Jirugi to Tong-Il, with a movement stepper, quiz
mode, and a RAG study coach powered by Gemini.

> **STATUS: PROTOTYPE (declared spike).** Runs locally; not hardened for
> student handoff. See [CHANGELOG.md](CHANGELOG.md) for what exists and
> [Known limits](#known-limits) for what does not.

---

## Quick start

```bash
git clone https://github.com/<your-org>/itf-patterns-trainer.git
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

Use `npm ci` — it installs the exact tree recorded in `package-lock.json` and
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
| `npm run verify` | `typecheck` + `lint` + `build` — run before pushing |

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

`.env.local` is gitignored — **never commit it**. Restart the dev server after
editing it.

### Variables

| Variable | Required | Enables | Notes |
| --- | --- | --- | --- |
| `GEMINI_API_KEY` | No | The `/api/coach` RAG coach | Server-side only, never sent to the browser. Without it the coach returns HTTP 503. |
| `GEMINI_MODEL` | No | — | Defaults to `gemini-2.5-flash`. |
| `NEXT_PUBLIC_FIREBASE_API_KEY` | No | Google sign-in + cloud progress | Client-side. `NEXT_PUBLIC_*` values are embedded in the browser bundle — expected for Firebase web config. |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | No | Google sign-in + cloud progress | |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | No | Google sign-in + cloud progress | |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | No | Google sign-in + cloud progress | |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | No | Google sign-in + cloud progress | |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | No | Google sign-in + cloud progress | |

Firebase activates only when `API_KEY`, `PROJECT_ID`, and `APP_ID` are all
present; otherwise every Firebase export is `null` and progress falls back to
`localStorage`.

### Getting a Gemini key

1. Open [Google AI Studio](https://aistudio.google.com/app/apikey).
2. Create an API key.
3. Put it in `.env.local` as `GEMINI_API_KEY=...`.

### Firebase setup (one-time, optional)

1. Create a project at the [Firebase console](https://console.firebase.google.com/).
2. **Authentication** → enable the **Google** provider.
3. **Firestore** → create a database.
4. **Project settings → Your apps → Web app** → copy the config values into
   the `NEXT_PUBLIC_FIREBASE_*` vars above.
5. Firestore rules (prototype — scope every document to its signed-in owner):

   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /users/{userId} {
         allow read, write: if request.auth != null && request.auth.uid == userId;
       }
     }
   }
   ```

---

## Verifying your setup

```bash
npm run verify
```

Then, with the dev server running:

```bash
curl -i -X POST http://localhost:3000/api/coach -H "Content-Type: application/json" -d "{\"question\":\"How many movements are in Chon-Ji?\"}"
```

- **503** with `"Coach is not configured"` → no `GEMINI_API_KEY` (expected default).
- **200** with an `answer` and `sources` → the coach is live.

---

## Architecture

```
src/
  app/
    page.tsx                  home — patterns grouped by rank
    patterns/[slug]/page.tsx  movement stepper + full movement list
    quiz/[slug]/page.tsx      quiz mode
    coach/page.tsx            coach chat UI
    api/coach/route.ts        RAG generation endpoint (server-only)
  components/                 AuthButton, CoachChat, MovementStepper, Quiz
  context/AuthContext.tsx     Firebase auth state (null-safe when disabled)
  data/patterns.json          all 27 patterns, extracted + verified from the PDF
  lib/
    patterns.ts               pattern lookup + slugging
    retrieval.ts              RAG retrieval — local TF-IDF over per-movement chunks
    firebase.ts               env-guarded Firebase init
    progress.ts               Firestore when signed in, localStorage otherwise
    types.ts                  domain types
tools/parse_itf.py            one-off PDF extraction script (not part of the build)
```

**Conventions:** one responsibility per file; strict TypeScript everywhere
(`strict` plus `noUncheckedIndexedAccess`); every external call has an explicit
timeout and no retry; failures degrade to local state rather than throwing
into the UI.

**RAG design:** retrieval is deterministic and offline (lexical TF-IDF over
per-movement chunks), so it can be swapped for embeddings later without
changing callers. Generation is Gemini, grounded strictly on retrieved chunks,
with a 25s timeout and structured error JSON.

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
Fixed — the project now uses an ESLint flat config (`eslint.config.mjs`) and
runs `eslint .` directly. The old `next lint` prompted for setup and hung CI.
If you still see this, you are on a stale checkout.

**Coach always returns 503.**
`GEMINI_API_KEY` is unset, or `.env.local` was added after the server started.
Restart the dev server.

**Sign-in button does not appear.**
Expected when the Firebase vars are absent. Add all of `API_KEY`,
`PROJECT_ID`, and `APP_ID` to turn it on.

**Port 3000 is already in use.**
`npm run dev -- -p 3001`.

**Stale build artifacts.**
`rm -rf .next && npm run dev`.

---

## Known limits

- **Prototype, not production.** No tests, no deploy pipeline, no service
  worker / offline support.
- **Accepted vulnerability:** `npm audit` reports a high-severity `postcss`
  advisory reachable only through the copy of postcss bundled inside
  `next@15.5.24`. The only upstream fix is Next.js 16, a breaking upgrade.
  The advisory concerns processing untrusted CSS; this app processes only its
  own first-party stylesheets, so it is not reachable here. CI therefore fails
  on `critical` only. **Revisit when upgrading to Next 16.**
- **Install scripts are denied by default.** The `allowScripts` field in
  `package.json` explicitly denies the install scripts of `@firebase/util`,
  `@google/genai`, and `protobufjs`. All three were reviewed and are no-ops
  for this project: `@firebase/util` only acts on the `FIREBASE_WEBAPP_CONFIG`
  env var (unset here), `protobufjs` only emits a version-scheme warning, and
  `@google/genai` is a literal `echo`.
- Coach answers only from pattern text — no diagrams, no video.
- Quiz distractors are drawn from the same pattern only.
- The Firestore rules above are prototype-grade; review before any real handoff.

---

## Contributing

1. Branch from `main`.
2. `npm run verify` must pass before you push. CI runs the same steps on
   every PR via `npm ci`.
3. If you change dependencies, commit the updated `package-lock.json` in the
   same commit.
4. Update [CHANGELOG.md](CHANGELOG.md) — the project follows
   [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and semver.
