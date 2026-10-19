---
title: engstack Go backend REST API implemented
date: 2026-10-19
summary: "Delivered the full 6-phase Go/Chi/PostgreSQL backend: schema+sqlc, 7,303-item seeder, topics API with ETag/gzip, Google OAuth with rotating refresh tokens, progress sync, and a 29MB Docker image verified end to end."
---

# engstack Go backend REST API implemented

# What Happened

Implemented all six phases of `plans/261019-0938-backend-api` in `backend/` (Go 1.26, Chi v5, pgx/v5, sqlc, golang-migrate). The frontend was not modified.

- **Schema & queries**: five tables with FKs/cascades, SHA-256 refresh-token hashes, composite progress key; sqlc generates the store layer.
- **Seeder**: parses all 24 JSON modules, validates item ids/labels, upserts 24 topics + 7,303 items in one transaction via `pgx.Batch`. Idempotent re-runs.
- **Public API**: `GET /topics` and `GET /topics/{id}` return `ModuleItem` with `topicId`/`track`, plus `Cache-Control`, content-derived `ETag` (304 verified) and gzip (81KB to about 20KB).
- **Auth**: Google ID-token verification behind a `TokenVerifier` interface (mock + dev modes), 15-minute HS256 JWTs, 30-day refresh tokens rotated single-use; replay revokes the whole token family.
- **Progress**: FK-safe guest import via `INSERT ... SELECT`, GET grouped as `{topicId: [itemId]}`, toggle with hard delete so unlearned words cannot resurrect across devices.
- **Ops**: embedded migrations, multi-stage `scratch` image (29.1MB, UID 10001), compose stack (Postgres on host 5433), Makefile, and a curl smoke script.

# Verification

- `go test -race ./...` green across all packages.
- `go build ./...`, `go vet ./...`, `gofmt -l .` clean.
- Live: seeder reports 24 topics / 7,303 items; `scripts/test-e2e.sh` passes 20/20 assertions against both `go run` and the Docker container.

# Gotchas Worth Remembering

- `go test ./...` runs package binaries in parallel against one database; fixtures were truncating each other. Fixed with a Postgres advisory lock held for each test in `internal/testutil/db.go`.
- `google.golang.org/api v0.304` requires Go 1.26, so the Docker builder image is `golang:1.26-alpine`, not 1.22 as the plan assumed.
- Host port 5432 is occupied by other local stacks; the compose file publishes Postgres on 5433.

# Follow-ups

- Wire the frontend to the API (progress is still `localStorage`-only) and replace the dev token path with a real Google client id.
- Add CI (lint + test + image build) and a Trivy scan; Trivy is not installed locally, so the "0 HIGH/CRITICAL" check was not run.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
