-- name: ImportGuestProgress :execrows
INSERT INTO user_progress (user_id, item_id, topic_id, is_learned, updated_at)
SELECT DISTINCT sqlc.arg(user_id)::uuid, v.id, v.topic_id, TRUE, NOW()
FROM vocab_items v
LEFT JOIN vocab_item_aliases a ON a.item_id = v.id
WHERE v.id = ANY(@item_ids::text[])
   OR a.alias = ANY(@item_ids::text[])
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
WHERE v.id = sqlc.arg(item_id)::text
ON CONFLICT (user_id, item_id)
DO UPDATE SET is_learned = TRUE, updated_at = NOW();

-- name: DeleteProgress :exec
DELETE FROM user_progress
WHERE user_id = $1 AND item_id = $2;
