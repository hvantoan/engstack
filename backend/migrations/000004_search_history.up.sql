-- B10: resume position + full activity history (learn toggles, mode sessions).
-- review activity already lives in review_events; this logs the rest.
CREATE TABLE user_positions (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    topic_id TEXT NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
    mode TEXT NOT NULL,
    item_id TEXT REFERENCES vocab_items(id) ON DELETE SET NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE learning_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('learn', 'unlearn', 'session_start', 'session_end')),
    topic_id TEXT REFERENCES topics(id) ON DELETE SET NULL,
    item_id TEXT REFERENCES vocab_items(id) ON DELETE SET NULL,
    mode TEXT,
    client_event_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX learning_events_client_event_idx
    ON learning_events (user_id, client_event_id)
    WHERE client_event_id IS NOT NULL;
CREATE INDEX learning_events_user_time_idx ON learning_events (user_id, created_at DESC);
