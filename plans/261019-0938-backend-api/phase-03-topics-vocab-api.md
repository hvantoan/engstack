---
phase: 3
title: "Public Topics & Vocab REST API"
status: completed
priority: P1
effort: "4h"
dependencies: ["phase-02-data-seeder"]
---

# Phase 3: Public Topics & Vocab REST API

## Goal
Implement high-performance HTTP endpoints using `go-chi/v5` to serve topics and vocabulary items matching the TypeScript `ModuleItem` and `Topic` contract, complete with HTTP caching headers (`Cache-Control`, `ETag`), CORS support, and comprehensive unit/integration test coverage.

## Context & Architectural Invariants
- Router: `github.com/go-chi/chi/v5` with idiomatic middleware (`middleware.Logger`, `middleware.Recoverer`, `middleware.RealIP`, `middleware.Compress`).
- CORS configured for frontend development (`http://localhost:5173`, `http://localhost:3000`) and production origin.
- The response format of `GET /api/v1/topics/{id}` MUST return an envelope containing topic metadata and an `items` array where each item matches the frontend `ModuleItem` type (`VocabItem` + `topicId: string` + `track: string`).
- Without `track`, the frontend will incorrectly render Oxford items as IELTS (breaking `labelText(item)` in `src/lib/vocab.ts:134`).
- Caching headers (`Cache-Control: public, max-age=86400, stale-while-revalidate=3600`) and `ETag` (computed via hash or topic `updated_at`) prevent redundant DB queries for read-heavy static content.

## Files to Create / Modify
- Create: `backend/cmd/api/main.go`
- Create: `backend/internal/server/server.go`
- Create: `backend/internal/server/router.go`
- Create: `backend/internal/handler/health.go`
- Create: `backend/internal/handler/health_test.go`
- Create: `backend/internal/handler/topic.go`
- Create: `backend/internal/handler/topic_test.go`
- Create: `backend/internal/dto/topic_dto.go`

## Tests Before (TDD Contract)
Write tests in `backend/internal/handler/topic_test.go` using `net/http/httptest` *before* implementing handlers:
1. `TestHealthEndpoint`: `GET /api/v1/health` returns status `200 OK` and JSON `{"status":"ok","version":"1.0.0"}`.
2. `TestListTopicsEndpoint`:
   - `GET /api/v1/topics` returns HTTP 200 with JSON array of 24 topics.
   - Assert each topic contains `id`, `track`, `title`, `description`, `eyebrow`, `accent`, `level`, `orderIndex`, `itemCount`.
   - Assert HTTP response header `Cache-Control` contains `public, max-age=86400`.
3. `TestGetTopicByID_Found`:
   - `GET /api/v1/topics/education` returns HTTP 200 with topic envelope and 200 items.
   - Assert every item has `topicId: "education"`, `track: "ielts"`, `meaning`, `example`, `exampleVi`.
   - `GET /api/v1/topics/oxford-b1` returns topic envelope with Oxford items.
   - Assert every Oxford item has `topicId: "oxford-b1"`, `track: "oxford"`, and `pos` array.
4. `TestGetTopicByID_NotFound`:
   - `GET /api/v1/topics/non-existent-topic` returns HTTP 404 with JSON error `{"error":"topic not found"}`.
5. `TestETagSupport`:
   - Send `GET /api/v1/topics/education`, capture `ETag` header.
   - Send second request with `If-None-Match: <captured-etag>`, assert HTTP 304 Not Modified with empty body.

## Tasks & Implementation Steps
1. **Define DTOs (`internal/dto/topic_dto.go`)**:
   - `TopicSummaryDTO`: `id`, `track`, `title`, `description`, `eyebrow`, `accent`, `level`, `orderIndex`, `itemCount`, `related`.
   - `ModuleItemDTO`: `id`, `topicId`, `track`, `term`, `ipa`, `label`, `meaning`, `example`, `exampleVi`, `definition`, `level`, `pos`.
   - `TopicDetailDTO`: contains topic fields and `items: []ModuleItemDTO`.
2. **Implement Handlers (`internal/handler/topic.go`)**:
   - `HandleListTopics`: queries `sqlc` `ListTopicsWithCount`, formats DTOs, computes ETag, writes JSON.
   - `HandleGetTopicByID`: parses `{id}` from Chi URL param, queries `GetTopicByID` and `ListVocabByTopicID`, constructs `TopicDetailDTO`, handles ETag match / 304, writes JSON.
3. **Configure Chi Router & Server (`internal/server/router.go`)**:
   - Mount routes:
     - `GET /api/v1/health`
     - `GET /api/v1/topics`
     - `GET /api/v1/topics/{id}`
   - Setup CORS middleware allowing `GET, POST, PUT, DELETE, OPTIONS`, headers `Content-Type, Authorization, If-None-Match`.
4. **Build Server Bootstrap (`cmd/api/main.go`)**:
   - Parse configuration from environment (`PORT`, `DATABASE_URL`, `CORS_ALLOWED_ORIGINS`).
   - Initialize `pgxpool.Pool`.
   - Start HTTP server with graceful shutdown on `SIGINT` / `SIGTERM`.

## Refactor (Protected Changes)
- Extract standard JSON helper `writeJSON(w http.ResponseWriter, status int, data any, headers http.Header)`.
- Extract standard Error helper `writeError(w http.ResponseWriter, status int, message string)`.
- Ensure zero database allocation leaks on error pathways.

## Tests After (New Behavior)
- Benchmark handler latency using `go test -bench=. ./internal/handler`:
  - `BenchmarkGetTopicDetail`: ensure < 15ms per request with full 200 items serialization.
- Test gzip compression middleware: verify that `Accept-Encoding: gzip` compresses the ~120KB payload down to < 25KB.

## Verification & Regression Gate
```bash
# Run unit tests
cd backend && go test -v -race ./internal/handler/...

# Start API server and run live curl smoke checks
cd backend && go run cmd/api/main.go &
PID=$!
sleep 1

# Check health
curl -s http://localhost:8080/api/v1/health | grep '"status":"ok"'

# Check topics count
TOPIC_COUNT=$(curl -s http://localhost:8080/api/v1/topics | jq '. | length')
test "$TOPIC_COUNT" -eq 24

# Check Oxford item has track and topicId
curl -s http://localhost:8080/api/v1/topics/oxford-b1 | jq '.items[0] | {id, topicId, track}'

kill $PID
```
Pass condition: All tests pass, 24 topics returned, `oxford-b1` items contain both `topicId` and `track: "oxford"`, ETag returns 304.

## Todo List
- [x] Implement `internal/handler/health_test.go` and `internal/handler/health.go`
- [x] Implement DTOs in `internal/dto/topic_dto.go` matching `ModuleItem`
- [x] Write `internal/handler/topic_test.go` with TDD assertions
- [x] Implement `internal/handler/topic.go` with ETag and Cache-Control
- [x] Configure Chi router in `internal/server/router.go` with CORS
- [x] Implement `cmd/api/main.go` entrypoint with graceful shutdown

## Risk Assessment & Security
- **Risk**: Large payload size for topics with 800+ items (e.g. Oxford A1/A2).
  - **Mitigation**: Enable Chi compression middleware (`middleware.Compress(5)`).
- **Security**: Prevent path traversal or SQL injection via `{id}` URL parameter (handled natively by sqlc parameterized queries).
