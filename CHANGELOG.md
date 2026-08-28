# Changelog

All notable changes to this project will be documented in this file.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Semver.

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
