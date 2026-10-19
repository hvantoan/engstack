-- name: ListTopicsWithCount :many
SELECT t.id, t.track, t.title, t.description, t.eyebrow, t.accent, t.level,
       t.order_index, t.related, COUNT(v.id)::int AS item_count
FROM topics t
LEFT JOIN vocab_items v ON v.topic_id = t.id
GROUP BY t.id
ORDER BY t.track DESC, t.order_index ASC, t.id ASC;

-- name: GetTopicByID :one
SELECT id, track, title, description, eyebrow, accent, level, order_index, related
FROM topics
WHERE id = $1;

-- name: UpsertTopic :exec
INSERT INTO topics (id, track, title, description, eyebrow, accent, level, order_index, related)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
ON CONFLICT (id) DO UPDATE SET
    track = EXCLUDED.track,
    title = EXCLUDED.title,
    description = EXCLUDED.description,
    eyebrow = EXCLUDED.eyebrow,
    accent = EXCLUDED.accent,
    level = EXCLUDED.level,
    order_index = EXCLUDED.order_index,
    related = EXCLUDED.related;
