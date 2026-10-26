-- Review queue: schedule state lives in review_items; every rating is also
-- appended to review_events (immutable log, idempotent via client_event_id).

-- name: ListDueReviewItems :many
SELECT r.item_id, r.topic_id, r.due_at, r.review_count,
       v.term, v.ipa, v.label, v.meaning, v.example, v.example_vi,
       v.definition, v.level, v.pos, v.track
FROM review_items r
JOIN vocab_items v ON v.id = r.item_id
WHERE r.user_id = $1 AND r.due_at <= $2
ORDER BY r.due_at ASC, r.item_id ASC
LIMIT $3;

-- name: CountDueReviewItems :one
SELECT COUNT(*) FROM review_items
WHERE user_id = $1 AND due_at <= $2;

-- name: CountPendingReviewItems :one
SELECT COUNT(*) FROM review_items WHERE user_id = $1;

-- name: NextReviewDueAt :one
SELECT due_at FROM review_items
WHERE user_id = $1
ORDER BY due_at ASC
LIMIT 1;

-- name: GetReviewItemForUpdate :one
SELECT item_id, topic_id, due_at, interval_days, ease, review_count,
       last_rating, last_reviewed_at
FROM review_items
WHERE user_id = $1 AND item_id = $2
FOR UPDATE;

-- name: UpsertReviewItem :exec
INSERT INTO review_items (user_id, item_id, topic_id, due_at, interval_days,
    ease, review_count, last_rating, last_reviewed_at, updated_at)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
ON CONFLICT (user_id, item_id) DO UPDATE SET
    topic_id = EXCLUDED.topic_id,
    due_at = EXCLUDED.due_at,
    interval_days = EXCLUDED.interval_days,
    ease = EXCLUDED.ease,
    review_count = EXCLUDED.review_count,
    last_rating = EXCLUDED.last_rating,
    last_reviewed_at = EXCLUDED.last_reviewed_at,
    updated_at = NOW();

-- name: GetReviewEventByClientID :one
SELECT item_id, rating, interval_days, review_count, due_at, reviewed_at
FROM review_events
WHERE user_id = $1 AND client_event_id = $2;

-- name: InsertReviewEvent :exec
INSERT INTO review_events (user_id, item_id, topic_id, rating, interval_days,
    review_count, due_at, reviewed_at, client_event_id)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9);

-- name: CheckProgressLearned :one
SELECT EXISTS (
    SELECT 1 FROM user_progress
    WHERE user_id = $1 AND item_id = $2 AND is_learned = TRUE
);

-- name: EnqueueReviewItem :exec
-- The is_learned join is part of the same statement so a concurrent unlearn
-- cannot slip between a separate check and this insert.
INSERT INTO review_items (user_id, item_id, topic_id, due_at, updated_at)
SELECT $1, v.id, v.topic_id, $2, NOW()
FROM vocab_items v
JOIN user_progress p
  ON p.user_id = $1 AND p.item_id = v.id AND p.is_learned = TRUE
WHERE v.id = $3
ON CONFLICT (user_id, item_id) DO NOTHING;

-- name: DequeueReviewItem :exec
DELETE FROM review_items WHERE user_id = $1 AND item_id = $2;

-- Import paths may carry alias ids; resolve through vocab_item_aliases like
-- ImportGuestProgress so imported flags land on canonical ids.
-- name: EnqueueReviewItemsForImport :execrows
INSERT INTO review_items (user_id, item_id, topic_id, due_at, updated_at)
SELECT DISTINCT sqlc.arg(user_id)::uuid, v.id, v.topic_id, sqlc.arg(due_at)::timestamptz, NOW()
FROM vocab_items v
LEFT JOIN vocab_item_aliases a ON a.item_id = v.id
WHERE v.id = ANY(@item_ids::text[])
   OR a.alias = ANY(@item_ids::text[])
ON CONFLICT (user_id, item_id) DO NOTHING;

-- Content edits rename item ids via vocab_item_aliases (see importer.go):
-- migrate schedule rows to the canonical id, merge-guarded like progress,
-- then move the immutable log so history follows the item.
-- name: MigrateReviewAliases :execrows
UPDATE review_items r
SET item_id = a.item_id, topic_id = v.topic_id, updated_at = NOW()
FROM vocab_item_aliases a
JOIN vocab_items v ON v.id = a.item_id
WHERE r.item_id = a.alias
  AND NOT EXISTS (
    SELECT 1 FROM review_items existing
    WHERE existing.user_id = r.user_id AND existing.item_id = a.item_id
  );

-- name: DeleteAliasReviewRows :exec
DELETE FROM review_items r
USING vocab_item_aliases a
WHERE r.item_id = a.alias;

-- name: MigrateReviewEventAliases :exec
UPDATE review_events e
SET item_id = a.item_id, topic_id = v.topic_id
FROM vocab_item_aliases a
JOIN vocab_items v ON v.id = a.item_id
WHERE e.item_id = a.alias;
