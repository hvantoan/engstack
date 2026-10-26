-- B10: resume position + merged activity history.

-- name: GetUserPosition :one
SELECT topic_id, mode, item_id, updated_at
FROM user_positions
WHERE user_id = $1;

-- name: UpsertUserPosition :exec
INSERT INTO user_positions (user_id, topic_id, mode, item_id, updated_at)
VALUES ($1, $2, $3, $4, NOW())
ON CONFLICT (user_id) DO UPDATE SET
    topic_id = EXCLUDED.topic_id,
    mode = EXCLUDED.mode,
    item_id = EXCLUDED.item_id,
    updated_at = NOW();

-- name: InsertLearningEvent :exec
INSERT INTO learning_events (user_id, type, topic_id, item_id, mode, client_event_id)
VALUES ($1, $2, $3, $4, $5, $6)
ON CONFLICT (user_id, client_event_id) WHERE client_event_id IS NOT NULL DO NOTHING;

-- name: ListLearningHistory :many
-- Unified timeline: review outcomes merged with learn/session events.
SELECT kind, item_id, term, topic_id, mode, rating, happened_at
FROM (
    SELECT 'review' AS kind, e.item_id, v.term, e.topic_id,
           NULL::text AS mode, e.rating::int AS rating, e.reviewed_at AS happened_at
    FROM review_events e
    LEFT JOIN vocab_items v ON v.id = e.item_id
    WHERE e.user_id = $1
    UNION ALL
    SELECT l.type, COALESCE(l.item_id, ''), v.term, l.topic_id, l.mode, 0, l.created_at
    FROM learning_events l
    LEFT JOIN vocab_items v ON v.id = l.item_id
    WHERE l.user_id = $1
) timeline
ORDER BY happened_at DESC
LIMIT $2;
