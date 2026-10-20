-- name: UpsertUserByGoogleID :one
INSERT INTO users (google_id, email, name, avatar_url)
VALUES ($1, $2, $3, $4)
ON CONFLICT (google_id) DO UPDATE SET
    email = EXCLUDED.email,
    name = EXCLUDED.name,
    avatar_url = EXCLUDED.avatar_url,
    updated_at = NOW()
RETURNING id, google_id, email, name, avatar_url, created_at, updated_at;

-- name: GetUserByID :one
SELECT id, google_id, email, name, avatar_url, created_at, updated_at
FROM users
WHERE id = $1;
