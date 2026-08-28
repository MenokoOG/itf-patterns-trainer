# ITF Patterns Trainer

Mobile-first Next.js app for students practicing the Chang-Hon (ITF) tuls —
all 27 patterns from Saju Jirugi to Tong-Il, with a movement stepper, quiz
mode, and a RAG study coach powered by Gemini.

**STATUS: PROTOTYPE (declared spike).** Runs locally; not hardened for
student handoff. See CHANGELOG for what exists.


The app runs with NO keys at all: sign-in hides itself, progress goes to
localStorage, and the coach returns a clear 503. Add `GEMINI_API_KEY` to turn
the coach on; add the Firebase vars to turn on Google sign-in + cloud progress.

### Firebase console (one-time)
- Authentication → enable Google provider.
- Firestore → create database. Prototype rule: allow read/write only when
  `request.auth.uid == userId` on `users/{userId}`.

## Architecture

- `src/data/patterns.json` — all pattern data, extracted + verified from the
  instructions PDF (movement counts cross-checked against the declared counts
  and spot-checked against page images).
- `src/lib/retrieval.ts` — RAG retrieval stage: local TF-IDF lexical search
  over per-movement chunks. Deterministic, no network. Swappable for
  embeddings later without changing callers.
- `src/app/api/coach/route.ts` — generation stage: Gemini
  (`GEMINI_MODEL`, default `gemini-2.5-flash`), grounded on retrieved
  chunks, 25s timeout, no retry, structured error JSON.
- `src/lib/firebase.ts` / `src/lib/progress.ts` — env-guarded Firebase;
  localStorage fallback.
- One responsibility per file; strict TypeScript everywhere.




## Known limits (prototype)

- No tests yet; no deploy; no service worker/offline.
- Coach answers only from pattern text — no diagrams, no video.
- Quiz distractors are drawn from the same pattern only.
