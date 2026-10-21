-- name: ListVocabByTopicID :many
SELECT id, topic_id, track, term, ipa, label, meaning, example, example_vi, definition, level, pos, order_index
FROM vocab_items
WHERE topic_id = $1
ORDER BY order_index ASC, id ASC;

-- name: UpsertVocabItem :exec
INSERT INTO vocab_items (id, topic_id, track, term, ipa, label, meaning, example, example_vi, definition, level, pos, order_index)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
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
    pos = EXCLUDED.pos,
    order_index = EXCLUDED.order_index;

-- name: CountVocabItems :one
SELECT COUNT(*)::bigint FROM vocab_items;
