# Plan: Preserve authored item order across API and all study modes

## Context (confirmed by user)

`data/topics/*.json` arrays are authored in intentional groups (collocations →
words → phrases…). After the frontend switched to the API read-path, that order
is lost: `vocab_items` has no order column and `ListVocabByTopicID` uses
`ORDER BY term ASC`. User confirmed: restore authored JSON order as the default
on **all** display surfaces (Word List, Learn, Quiz, Match), keep Learn-mode
Shuffle as opt-in, add no new UI.

## Root cause

- `backend/migrations/000001_init_schema.up.sql` — `vocab_items` lacks `order_index`.
- `backend/internal/seeder/importer.go` — upsert drops array position.
- `backend/internal/store/queries/vocab.sql` — `ORDER BY term ASC, id ASC`.
- `frontend/src/components/modes/match-mode.tsx` — picks round items via
  `shuffled(topic.items).slice(0, PAIRS)`.
- `frontend/src/components/modes/quiz-mode.tsx` — picks questions randomly.

## Changes

### Backend

1. **Migration `000002_vocab_items_order_index`**
   - up: `ALTER TABLE vocab_items ADD COLUMN order_index INT NOT NULL DEFAULT 0;`
     backfill `order_index` from row_number per topic ordered by existing data
     is not meaningful — instead rely on reseed (seed upserts will set it).
     Add `CREATE INDEX vocab_items_topic_order_idx ON vocab_items (topic_id, order_index);`
   - down: drop index + column.
2. **`queries/vocab.sql`**
   - `ListVocabByTopicID`: `ORDER BY order_index ASC, id ASC`.
   - `UpsertVocabItem`: add `order_index` column/param incl. `ON CONFLICT` update.
   - Regenerate sqlc (`sqlc generate`).
3. **`internal/seeder/importer.go`**
   - `upsertItemSQL`: add `order_index` column + `order_index = EXCLUDED.order_index`.
   - In `Import`, pass `int32(i)` (array index) per item.
4. **Tests**
   - `store` test / seeder test: insert two items out of alphabetical order,
     assert `ListVocabByTopicID` returns authored order.

### Frontend

5. **`match-mode.tsx`** — replace `shuffled(topic.items).slice(0, PAIRS)` with a
   sequential window: `topic.items` rotated by `round * PAIRS` (mod len), take
   `PAIRS`; on meaning-collision retry rotate offset by 1. Keep `shuffled(flat)`
   tile layout (required for gameplay).
6. **`quiz-mode.tsx`** — `makeQuestion` picks the first unseen item in array
   order instead of a random one; when all seen, restart at `items[0]`.
   Distractor selection/options shuffle unchanged.
7. Learn mode: no code change — it already iterates `items` in order and has a
   Shuffle button. Word list: no change — renders `items` as given.

### Ops

8. Reseed after deploy: `make seed` (upsert sets order_index). Migrations run
   automatically on API boot (`MigrateOnBoot`).

## Acceptance criteria

- `GET /topics/{id}` returns items in authored JSON order (first `tourism` item
  is `sustainable tourism`, not `backpacking trips`).
- Word list, Learn, Quiz, Match all present items in authored order by default.
- Learn Shuffle still randomizes; quiz distractors still random; match tile
  layout still shuffled.
- `make typecheck`, `make build`, `make lint` pass; `go test ./...` green;
  `gofmt` clean.

## Non-goals

- No grouping/section UI, no reorder UI, no new endpoints.
- No change to topic-level ordering (`topics.order_index` already works).

## Risks

- Existing DBs get `order_index = 0` for all rows until reseed — ordering is
  stable-but-wrong briefly; mitigate by noting reseed step in PR/issue.
- `UpsertVocabItem` signature change affects sqlc-generated callers — compile
  catches all sites.
