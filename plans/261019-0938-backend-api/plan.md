---
title: "Golang Backend REST API for engstack"
description: "Build an idiomatic Go REST API with Chi, PostgreSQL 16, sqlc, and pgx/v5 for Google OAuth 2.0, topic & vocab serving (7,303 items), and user learning progress sync."
status: completed
priority: P1
effort: 24h
branch: main
tags: [backend, golang, postgresql, auth, api, tdd]
blockedBy: []
blocks: []
created: 2026-10-19
---

# Golang Backend REST API for engstack

## Overview

engstack is currently a static Vite + React 19 SPA. All ~7,303 vocabulary items (4,000 IELTS items across 20 topics and 3,303 Oxford 3000 items across 4 levels A1–B2) are bundled as static JSON chunks, and user learning progress is stored locally in `localStorage` (`engstack.learned.v2`).

This plan establishes a high-performance, idiomatic Golang backend service located in `backend/` (Monorepo), backed by PostgreSQL 16, `go-chi/v5`, `sqlc`, and `pgx/v5`. It delivers:
1. Complete PostgreSQL schema with migrations (`users`, `refresh_tokens`, `topics`, `vocab_items`, `user_progress`).
2. High-speed idempotent Seeder CLI importing all 24 topics and 7,303 vocabulary items with 0 duplicate errors.
3. Public REST API serving topics and vocabulary items formatted as `ModuleItem` with HTTP caching headers.
4. Google OAuth 2.0 verification and JWT token lifecycle with revocable Refresh Token rotation.
5. User progress synchronization where the server acts as the authoritative source of truth, with one-time guest import and single-word toggle semantics that eliminate resurrection of unlearned words.
6. Full test-driven development (TDD) coverage across all phases, Docker Compose local runtime, and automated end-to-end smoke verification.

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | Reliable cross-device progress synchronization with zero unlearned word resurrection | P1 |
| 2 | Secure Google OAuth 2.0 login with rotating refresh tokens and token revocation | P1 |
| 3 | 100% faithful data import of 24 modules and 7,303 items matching TypeScript `ModuleItem` contract | P1 |
| 4 | Low-latency API (<15ms p95) with Chi, pgx pool, sqlc compile-time type safety, and HTTP caching | P1 |
| 5 | Rigorous TDD test matrix (unit, integration, and end-to-end smoke tests) passing CI | P1 |

## Phases

| Phase | Name | Status |
|---|---|---|
| 1 | [Database Infrastructure & Scaffolding](./phase-01-database-infrastructure.md) | Completed |
| 2 | [Data Seeder Pipeline (7,303 Vocab Items)](./phase-02-data-seeder.md) | Completed |
| 3 | [Public Topics & Vocab REST API](./phase-03-topics-vocab-api.md) | Completed |
| 4 | [Google OAuth 2.0 & Refresh Token Rotation](./phase-04-google-auth-jwt.md) | Completed |
| 5 | [User Progress Sync Service](./phase-05-progress-sync.md) | Completed |
| 6 | [Dockerization & End-to-End Verification](./phase-06-docker-e2e-verification.md) | Completed |

## Success Criteria

- [x] `backend/` compiles with zero errors (`go build ./...`) and passes `golangci-lint`.
- [x] `docker compose up -d` boots PostgreSQL 16 and backend service; `GET /api/v1/health` returns `200 OK`.
- [x] Seeder CLI imports 24 topics and exactly 7,303 vocab items (`SELECT count(*) FROM vocab_items` = 7303).
- [x] `GET /api/v1/topics` and `GET /api/v1/topics/{id}` return complete payloads with `topicId` and `track` matching `ModuleItem`.
- [x] Google OAuth login generates valid JWT access tokens and hashed refresh tokens in `refresh_tokens`.
- [x] `POST /api/v1/auth/refresh` rotates tokens; `POST /api/v1/auth/logout` revokes tokens.
- [x] `POST /api/v1/progress/import-guest` safely imports client IDs without foreign key violations on stale IDs.
- [x] `PUT /api/v1/progress/toggle` correctly sets and unsets learned items without zombie resurrection across sessions.
- [x] 100% of TDD regression test suites pass (`go test -v -race ./...`).

## Implementation Notes

- Postgres is published on host port **5433** (5432 is already used by other local stacks); `DATABASE_URL` defaults match.
- Go toolchain: modules require **Go 1.26** (`golang:1.26-alpine` in the Dockerfile), because `google.golang.org/api` requires it.
- Migrations are **embedded** (`backend/migrations/embed.go`), so the binary migrates itself; no loose SQL files in the image.
- The runtime image is `scratch` + static binaries + CA certs: **29.1MB**, runs as UID 10001.
- Integration tests serialize across packages with a Postgres advisory lock (`backend/internal/testutil/db.go`) because `go test ./...` runs package binaries concurrently against one database.
- Auth dev mode (`AUTH_DEV_MODE=true`) accepts `dev:<email>` tokens so Docker/E2E runs need no Google credentials.

## Dependencies

- **Go Toolchain**: Go >= 1.22
- **Database**: PostgreSQL 16
- **Code Generator**: `sqlc` v1.26+
- **Migrations**: `golang-migrate/migrate/v4`
- **Docker**: Docker Engine & Docker Compose v2

<!-- slug: backend-api -->
