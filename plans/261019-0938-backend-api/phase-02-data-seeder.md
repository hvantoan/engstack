---
phase: 2
title: "Data Seeder Pipeline (7,303 Vocab Items)"
status: completed
priority: P1
effort: "4h"
dependencies: ["phase-01-database-infrastructure"]
---

# Phase 2: Data Seeder Pipeline (7,303 Vocab Items)

## Goal
Implement a high-speed, idempotent CLI seeder (`cmd/seed/main.go`) that parses all 24 JSON modules from `../src/data/topics/*.json` and `../src/data/oxford/*.json`, validates data structures, and imports exactly 7,303 vocabulary items into PostgreSQL with zero errors and zero duplicates.

## Context & Architectural Invariants
- Source of truth for initial seed data: `src/data/topics/*.json` (20 files, 200 items each = 4,000 items) and `src/data/oxford/*.json` (4 files: A1 900, A2 867, B1 808, B2 728 = 3,303 items). Total: exactly 7,303 items.
- Item `id` is deterministic: `<topicId>:<slug(term)>[:<slug(pos)>]`.
- Seeder must be idempotent: running multiple times produces identical DB state without duplicate key errors or crashes.
- All items in `vocab_items` must carry their parent `topic_id` and `track` to allow proper `ModuleItem` projection.
- Missing optional fields (`ipa`, `definition`, `pos`) must be stored gracefully (empty string or empty array `{}`, never `NULL` where non-null is expected).

## Files to Create / Modify
- Create: `backend/cmd/seed/main.go`
- Create: `backend/internal/seeder/parser.go`
- Create: `backend/internal/seeder/parser_test.go`
- Create: `backend/internal/seeder/importer.go`
- Create: `backend/internal/seeder/importer_test.go`

## Tests Before (TDD Contract)
Write tests in `backend/internal/seeder/parser_test.go` *before* implementing seeder logic:
1. `TestParseTopicsFiles`: Parse all 20 IELTS files and 4 Oxford files from `../../../src/data/`. Assert:
   - Exactly 24 modules parsed.
   - Total items count equals exactly 7,303.
   - Each item has non-empty `id`, `term`, `meaning`, `example`, `exampleVi`, and valid `label` (`word | collocation | idiom`).
   - Every `item.id` matches regex `^[a-z0-9-]+:[a-z0-9-]+(:[a-z0-9-]+)?$`.
2. `TestCheckDuplicateIDs`: Scan all 7,303 items in-memory and assert 0 duplicate IDs exist across the entire dataset.

## Tasks & Implementation Steps
1. **Define Seeder Data Structures**:
   - `TopicJSON`: envelope matching `src/lib/vocab-schema.ts:TopicSource` (`id`, `track`, `title`, `description`, `eyebrow`, `accent`, `level`, `order`, `related`, `items`).
   - `ItemJSON`: matching `VocabItem` (`id`, `term`, `ipa`, `label`, `meaning`, `example`, `exampleVi`, `definition`, `level`, `pos`).
2. **Implement File Scanner & JSON Parser (`parser.go`)**:
   - Read directory `../../../src/data/topics/` and `../../../src/data/oxford/` (or from configurable `dataDir` path).
   - Unmarshal JSON into typed structs. Log parsing stats (module id, item count).
3. **Implement Batch Importer (`importer.go`)**:
   - Open a database transaction with `pgxpool.Pool`.
   - Step A: Upsert 24 topics into `topics` table (`ON CONFLICT (id) DO UPDATE`).
   - Step B: Bulk upsert 7,303 items into `vocab_items` table using `pgx.Batch` (e.g. batches of 500 items) with `ON CONFLICT (id) DO UPDATE SET meaning=EXCLUDED.meaning, example=EXCLUDED.example, example_vi=EXCLUDED.example_vi`. (Do NOT use raw `CopyFrom` as PostgreSQL `COPY` does not support `ON CONFLICT` and breaks idempotency).
4. **Build CLI Entrypoint (`cmd/seed/main.go`)**:
   - Support CLI flags: `--data-dir` (default: `../src/data`), `--dry-run` (validate parse only without DB write).
   - Print clear progress bar or summary table upon completion.

## Refactor (Protected Changes)
- Optimize import speed: use `pgx.Batch` or temporary staging table with `COPY` if raw INSERT exceeds 3 seconds. Target execution time: < 1.0s.
- Enforce strict error handling: fail and rollback entire transaction if any single file cannot be read or parsed.

## Tests After (New Behavior)
- `TestImportDatabaseIntegration`:
  - Run `importer.ImportAll(ctx, pool, dataDir)` against clean test database.
  - Assert `SELECT COUNT(*) FROM topics;` returns 24.
  - Assert `SELECT COUNT(*) FROM vocab_items;` returns 7,303.
  - Run `importer.ImportAll` a second time (idempotency check): assert exit without error and count remains exactly 7,303.
  - Sample check Oxford item (`oxford-b1:about:preposition`): verify `definition`, `ipa`, `pos` array `{"preposition"}`, `track = "oxford"`.
  - Sample check IELTS item (`education:early-childhood-education`): verify `track = "ielts"`, `pos` array `{}`.

## Verification & Regression Gate
```bash
# Run seeder unit & integration tests
cd backend && go test -v -race ./internal/seeder/...

# Execute actual seeder against local Postgres
cd backend && go run cmd/seed/main.go --data-dir ../src/data

# Verify exact item counts via psql
docker compose exec postgres psql -U postgres -d engstack -c "SELECT count(*) FROM topics;"
# Expected: 24
docker compose exec postgres psql -U postgres -d engstack -c "SELECT count(*) FROM vocab_items;"
# Expected: 7303
```
Pass condition: 24 topics and 7,303 items in database; unit tests and integration tests pass with 0 errors.

## Todo List
- [x] Implement `internal/seeder/parser_test.go` with exact count (7,303) and duplicate assertions
- [x] Implement `internal/seeder/parser.go` to parse all 24 JSON files
- [x] Implement `internal/seeder/importer.go` with batch upsert logic
- [x] Implement `internal/seeder/importer_test.go` for DB integration and idempotency
- [x] Implement `cmd/seed/main.go` CLI with flags
- [x] Run seed on local database and verify 7,303 count

## Risk Assessment & Security
- **Risk**: Memory spike when loading all 7,303 items into memory.
  - **Mitigation**: 7,303 JSON records occupy ~8MB RAM, well within limits. Parse file-by-file if memory is constrained.
- **Security**: Seeder should only be runnable in trusted development or deployment pipeline environments.
