-- B09: cross-module search over term + meaning; caller escapes \ % _ in $1.

-- name: SearchVocabItems :many
SELECT v.id, v.topic_id, v.track, v.term, v.ipa, v.label, v.meaning,
       v.example, v.example_vi, v.definition, v.level, v.pos,
       t.title AS topic_title
FROM vocab_items v
JOIN topics t ON t.id = v.topic_id
WHERE ($1::text = '' OR v.term ILIKE '%' || $1 || '%' OR v.meaning ILIKE '%' || $1 || '%' ESCAPE '\')
  AND ($2::text = '' OR v.track = $2)
  AND ($3::text = '' OR v.level = $3)
ORDER BY v.term ASC, v.id ASC
LIMIT $4 OFFSET $5;

-- name: CountSearchVocabItems :one
SELECT COUNT(*)::bigint
FROM vocab_items v
WHERE ($1::text = '' OR v.term ILIKE '%' || $1 || '%' OR v.meaning ILIKE '%' || $1 || '%' ESCAPE '\')
  AND ($2::text = '' OR v.track = $2)
  AND ($3::text = '' OR v.level = $3);
