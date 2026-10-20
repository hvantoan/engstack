---
phase: 5
title: "User Progress Sync Service"
status: completed
priority: P1
effort: "4h"
dependencies: ["phase-04-google-auth-jwt"]
---

# Phase 5: User Progress Sync Service

## Goal
Implement learning progress synchronization where the server acts as the authoritative source of truth: supporting a robust one-time guest import (`POST /api/v1/progress/import-guest`) that filters stale IDs without foreign key violations, fetching full user progress (`GET /api/v1/progress`), and handling explicit item toggle state (`PUT /api/v1/progress/toggle`) that prevents resurrection of unlearned words across devices.

## Context & Architectural Invariants
- Progress Model: Binary status (`learned` = true).
- **FK-Safe Guest Import**:
  - `localStorage` can contain stale/renamed IDs from previous frontend builds. A direct insert with raw client IDs will fail the `vocab_items` foreign key constraint and abort the entire transaction.
  - The import query MUST use `INSERT ... SELECT`:
    ```sql
    INSERT INTO user_progress (user_id, item_id, topic_id, is_learned, updated_at)
    SELECT $1, v.id, v.topic_id, TRUE, NOW()
    FROM vocab_items v
    WHERE v.id = ANY($2::text[])
    ON CONFLICT (user_id, item_id) DO NOTHING;
    ```
  - This automatically drops non-existent IDs, prevents FK errors, and derives `topic_id` authoritatively from the server instead of trusting client input.
- **Eliminating Zombie Words (Unlearn Propagation)**:
  - After login, the server is the single source of truth.
  - `PUT /api/v1/progress/toggle` receives `{ "item_id": "...", "learned": true/false }`.
  - When `learned == true`: upsert into `user_progress`.
  - When `learned == false`: `DELETE FROM user_progress WHERE user_id = $1 AND item_id = $2;`.
  - Client devices simply fetch `GET /api/v1/progress` on startup to refresh local cache; no blind client-to-server union sync is performed after the initial guest import.
- Response format of `GET /api/v1/progress` MUST return a JSON map matching the frontend `LearnedMap` type: `{ [topicId: string]: string[] }`.

## Files to Create / Modify
- Create: `backend/internal/store/queries/progress.sql` (update with import and toggle queries)
- Create: `backend/internal/handler/progress.go`
- Create: `backend/internal/handler/progress_test.go`
- Create: `backend/internal/dto/progress_dto.go`
- Modify: `backend/internal/server/router.go` (mount progress routes under auth middleware)

## Tests Before (TDD Contract)
Write tests in `backend/internal/handler/progress_test.go` *before* implementing handlers:
1. `TestImportGuestProgress_ValidAndStaleIDs`:
   - Send `POST /api/v1/progress/import-guest` with payload containing:
     - 5 valid item IDs (e.g., `education:early-childhood-education`, etc.)
     - 2 non-existent/stale IDs (e.g., `legacy-topic:stale-item-1`, `education:invalid-id`)
   - Assert HTTP 200 OK with summary `{ "imported": 5 }`.
   - Assert no foreign key exception was thrown.
   - Assert exactly 5 records exist in `user_progress` for the test user.
2. `TestGetProgress_GroupedByTopic`:
   - Setup progress: User has 3 items in `education` and 2 items in `oxford-b1`.
   - Send `GET /api/v1/progress` with user's JWT.
   - Assert HTTP 200 OK.
   - Assert response body is JSON object:
     ```json
     {
       "education": ["education:item-1", "education:item-2", "education:item-3"],
       "oxford-b1": ["oxford-b1:item-a", "oxford-b1:item-b"]
     }
     ```
3. `TestToggleProgress_LearnAndUnlearn`:
   - Step 1: Call `PUT /api/v1/progress/toggle` with `{"item_id": "education:item-1", "learned": true}`. Assert HTTP 200 and record created.
   - Step 2: Call `PUT /api/v1/progress/toggle` with `{"item_id": "education:item-1", "learned": false}`. Assert HTTP 200 and record deleted.
   - Step 3: Call `GET /api/v1/progress`. Assert `education:item-1` is absent from the array.
4. `TestProgress_MultiDeviceUnlearnScenario`:
   - Setup: User has word $X$ learned in DB (`is_learned = true`).
   - Device A: calls `PUT /api/v1/progress/toggle` with `{"item_id": "word-X", "learned": false}`.
   - Verify record for `(user_id, "word-X")` is completely removed from `user_progress`.
   - Device B: calls `GET /api/v1/progress`, assert word $X$ is not present in the returned map.
   - Resurrect defense check: attempt subsequent `GET /api/v1/progress` across multiple simulated sessions, verifying word $X$ never reappears.

## Tasks & Implementation Steps
1. **Define Progress SQL Queries (`internal/store/queries/progress.sql`)**:
   ```sql
   -- name: ImportGuestProgress :execrows
   INSERT INTO user_progress (user_id, item_id, topic_id, is_learned, updated_at)
   SELECT $1, v.id, v.topic_id, TRUE, NOW()
   FROM vocab_items v
   WHERE v.id = ANY(@item_ids::text[])
   ON CONFLICT (user_id, item_id) DO NOTHING;

   -- name: ListUserProgress :many
   SELECT topic_id, item_id
   FROM user_progress
   WHERE user_id = $1 AND is_learned = TRUE
   ORDER BY topic_id, updated_at ASC;

   -- name: SetProgressLearned :exec
   INSERT INTO user_progress (user_id, item_id, topic_id, is_learned, updated_at)
   SELECT $1, v.id, v.topic_id, TRUE, NOW()
   FROM vocab_items v
   WHERE v.id = $2
   ON CONFLICT (user_id, item_id) 
   DO UPDATE SET is_learned = TRUE, updated_at = NOW();

   -- name: DeleteProgress :exec
   DELETE FROM user_progress
   WHERE user_id = $1 AND item_id = $2;
   ```
2. **Implement DTOs (`internal/dto/progress_dto.go`)**:
   - `ImportGuestProgressRequest`: `ItemIDs []string json:"itemIds"`.
   - `ImportGuestProgressResponse`: `Imported int64 json:"imported"`.
   - `ToggleProgressRequest`: `ItemID string json:"itemId"`, `Learned bool json:"learned"`.
   - `UserProgressMap`: `map[string][]string`.
3. **Implement Handlers (`internal/handler/progress.go`)**:
   - `HandleImportGuestProgress`: validates JWT context, executes `ImportGuestProgress`, returns count.
   - `HandleGetProgress`: queries `ListUserProgress`, groups into `map[string][]string`, returns JSON.
   - `HandleToggleProgress`: validates request; if `req.Learned` calls `SetProgressLearned`, else calls `DeleteProgress`.
4. **Mount Routes with Auth Middleware (`internal/server/router.go`)**:
   ```go
   r.Group(func(r chi.Router) {
       r.Use(authMiddleware.RequireAuth)
       r.Get("/api/v1/progress", progressHandler.HandleGetProgress)
       r.Put("/api/v1/progress/toggle", progressHandler.HandleToggleProgress)
       r.Post("/api/v1/progress/import-guest", progressHandler.HandleImportGuestProgress)
   })
   ```

## Refactor (Protected Changes)
- Optimize `HandleGetProgress` mapping: pre-allocate slices for topic groups to minimize memory allocations.
- Ensure all mutations (`import-guest` and `toggle`) execute in bounded context deadlines (3 seconds).

## Tests After (New Behavior)
- Benchmark `HandleGetProgress` with 1,000 learned items across 24 topics: assert response serialization completes in < 5ms.
- Test unauthorized access: verify calling progress endpoints without Bearer token returns 401 Unauthorized immediately.

## Verification & Regression Gate
```bash
# Run progress tests
cd backend && go test -v -race -run Progress ./internal/handler/...
```
Pass condition: All progress tests pass, invalid/stale IDs are ignored cleanly, toggle updates DB state accurately, 0 FK errors.

## Todo List
- [x] Add `ImportGuestProgress`, `ListUserProgress`, `SetProgressLearned`, `DeleteProgress` in `queries/progress.sql`
- [x] Run `sqlc generate` to regenerate store models and methods
- [x] Define progress DTOs in `internal/dto/progress_dto.go`
- [x] Implement `internal/handler/progress_test.go` with TDD test cases
- [x] Implement `internal/handler/progress.go`
- [x] Register routes under `RequireAuth` middleware in `internal/server/router.go`

## Risk Assessment & Security
- **Risk**: Client attempts to toggle or import items belonging to another user.
  - **Mitigation**: `user_id` is extracted strictly from the verified JWT context (`r.Context()`), never from client URL or body parameters.
- **Security**: Database indices on `(user_id, topic_id)` and composite PK `(user_id, item_id)` protect against duplicate progress records and slow table scans.
