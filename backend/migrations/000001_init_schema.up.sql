CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    google_id VARCHAR(255) UNIQUE NOT NULL,
    email VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    avatar_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE refresh_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(64) UNIQUE NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX refresh_tokens_user_id_idx ON refresh_tokens (user_id);

CREATE TABLE topics (
    id TEXT PRIMARY KEY,
    track VARCHAR(32) NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    eyebrow TEXT NOT NULL,
    accent VARCHAR(32) NOT NULL,
    level VARCHAR(16),
    order_index INT NOT NULL DEFAULT 0,
    related TEXT[] NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE vocab_items (
    id TEXT PRIMARY KEY,
    topic_id TEXT NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
    track VARCHAR(32) NOT NULL,
    term TEXT NOT NULL,
    ipa TEXT NOT NULL DEFAULT '',
    label VARCHAR(32) NOT NULL,
    meaning TEXT NOT NULL,
    example TEXT NOT NULL,
    example_vi TEXT NOT NULL,
    definition TEXT NOT NULL DEFAULT '',
    level VARCHAR(16),
    pos TEXT[] NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX vocab_items_topic_id_idx ON vocab_items (topic_id);

CREATE TABLE user_progress (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    item_id TEXT NOT NULL REFERENCES vocab_items(id) ON DELETE CASCADE,
    topic_id TEXT NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
    is_learned BOOLEAN NOT NULL DEFAULT TRUE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, item_id)
);

CREATE INDEX user_progress_user_topic_idx ON user_progress (user_id, topic_id);
