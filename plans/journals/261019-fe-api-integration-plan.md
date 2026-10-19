---
title: engstack frontend ↔ Go API integration plan
date: 2026-10-19
summary: "Planned wiring the React frontend to the existing Go API: guest-first auth, single-flight refresh under Web Locks, a dual-source progress store, API-backed content with related-topic summaries, and same-origin nginx proxying."
---

# engstack frontend ↔ Go API integration plan

# What Happened

Produced `plans/261019-1636-fe-api-integration` after an advise interview that locked the decisions:
full content migration to the API (accepted cost to avoid migrating twice), guest-first UX, body tokens
(access in memory, refresh in `localStorage`), union merge with the server as source of truth, and PWA
deferred. Six phases, 49 checkboxes.

- **Phase 1** — `src/lib/api.ts` + `src/lib/auth.ts`: single-flight refresh inside
  `navigator.locks("engstack:refresh")`, re-read the stored token inside the lock, adopt cross-tab
  rotations via `storage`, proactive refresh at 80% of `expires_in`.
- **Phase 2** — swap the internals of `src/lib/progress.ts` while keeping `useLearned`,
  `useTotalLearned`, `getLearned`, `toggleLearned` signatures; `sessionRestore()` serializes
  v1 migration → guest import → `GET /progress` → clear local; new `useProgressReady()`.
- **Phase 3** — `src/lib/content.ts` with `useTopicSummaries()` and `useTopic(id)`; delete the
  `import.meta.glob` loader; topic page keeps the related-topics block by consuming summaries.
- **Phase 4** — DEV-gated Google button (`dev:<email>` until a real client ID exists), header states
  loading/guest/authenticated.
- **Phase 5** — Vite `/api` proxy, nginx `location /api/`, docs, production auth flags.
- **Phase 6** — static gates, backend e2e, 12-row smoke matrix.

# Decisions Worth Remembering

- Preserving export signatures is not enough: `learn-mode.tsx:25` snapshots `getLearned` into
  `useState`, so hydration and rollback never reached the UI. It must subscribe via `useLearned`.
- `POST /progress/import-guest` is additive (`ON CONFLICT DO NOTHING`), `PUT /progress/toggle
  {learned:false}` hard-deletes; keeping guest state in the same key as a server mirror would let a
  stale device resurrect unlearned items.
- Refresh tokens are single-use and a replay revokes every session (`token_service.go`), so two tabs
  refreshing concurrently log the user out everywhere.
- `topic.tsx` renders related topics from the full module list, so the topic page needs summaries too.

# Verification

- `ak plan validate` → `[OK]`, `ak plan status` → 6 phases / 49 tasks.
- Red-team ran with 4 lenses against the repo: 15 findings, 14 accepted and applied, 1 rejected
  (localStorage refresh token — explicit user decision). Subagent delegation was unavailable
  (`No model selected`), so the review was executed directly with grep evidence.
- Facts confirmed at source: `docker-compose.yml:29,31` ships `AUTH_DEV_MODE=true` and a static JWT
  secret; `respond.go:39` caches content for 86400s; `vite preview` ignores `server.proxy`; compose
  has no `web` service.

# Follow-ups

- Real `GOOGLE_CLIENT_ID` + authorized origins, production domain, and a production env that sets
  `AUTH_DEV_MODE=false`.
- Decide whether `main` should stop mounting `src/data` as the seeder source at runtime
  (authoring CRUD remains a separate project).
- No test framework exists in the frontend; regression coverage is the smoke matrix plus backend e2e.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
