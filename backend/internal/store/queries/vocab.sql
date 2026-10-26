-- name: ListVocabByTopicID :many
SELECT id, topic_id, track, term, ipa, label, meaning, example, example_vi, definition, level, pos
FROM vocab_items
WHERE topic_id = $1
ORDER BY term ASC, id ASC;

-- name: UpsertVocabItem :exec
INSERT INTO vocab_items (id, topic_id, track, term, ipa, label, meaning, example, example_vi, definition, level, pos)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
ON CONFLICT (id) DO UPDATE SET
    topic_id = EXCLUDED.topic_id,
    track = EXCLUDED.track,
    term = EXCLUDED.term,
    ipa = EXCLUDED.ipa,
    label = EXCLUDED.label,
    meaning = EXCLUDED.meaning,
    example = EXCLUDED.example,
    example_vi = EXCLUDED.example_vi,
    definition = EXCLUDED.definition,
    level = EXCLUDED.level,
    pos = EXCLUDED.pos;

-- name: CountVocabItems :one
SELECT COUNT(*)::bigint FROM vocab_items;

-- name: ResolveVocabItemID :one
SELECT item_id, topic_id FROM (
    SELECT vocab_items.id AS item_id, vocab_items.topic_id, 0 AS priority
    FROM vocab_items
    WHERE vocab_items.id = $1
    UNION ALL
    SELECT a.item_id, v.topic_id, 1 AS priority
    FROM vocab_item_aliases a
    JOIN vocab_items v ON v.id = a.item_id
    WHERE a.alias = $1
) resolved
ORDER BY priority
LIMIT 1;

-- name: UpsertVocabItemAlias :exec
INSERT INTO vocab_item_aliases (alias, item_id)
VALUES ($1, $2)
ON CONFLICT (alias) DO UPDATE SET
    item_id = EXCLUDED.item_id;

-- name: MigrateProgressAliases :exec
UPDATE user_progress up
SET item_id = a.item_id,
    topic_id = v.topic_id,
    updated_at = NOW()
FROM vocab_item_aliases a
JOIN vocab_items v ON v.id = a.item_id
WHERE up.item_id = a.alias
  AND NOT EXISTS (
      SELECT 1
      FROM user_progress existing
      WHERE existing.user_id = up.user_id
        AND existing.item_id = a.item_id
  );

-- name: DeleteAliasProgressRows :exec
DELETE FROM user_progress up
USING vocab_item_aliases a
WHERE up.item_id = a.alias;

-- name: DeleteMissingVocabItemAliases :exec
DELETE FROM vocab_item_aliases
WHERE NOT (alias = ANY($1::text[]));

-- name: DeleteMissingVocabItems :exec
DELETE FROM vocab_items
WHERE NOT (id = ANY($1::text[]));
