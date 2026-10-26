-- Spaced-repetition review queue (accounts only). Keep 'learned' flags,
-- review schedules and recall results as three separate concepts:
-- user_progress stays a boolean marker; review_items holds the schedule;
-- review_events is the immutable log used for cohort/retention metrics.
CREATE TABLE review_items (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    item_id TEXT NOT NULL REFERENCES vocab_items(id) ON DELETE CASCADE,
    topic_id TEXT NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
    due_at TIMESTAMPTZ NOT NULL,
    interval_days INT NOT NULL DEFAULT 0,
    ease REAL NOT NULL DEFAULT 2.5,
    review_count INT NOT NULL DEFAULT 0,
    last_rating SMALLINT,
    last_reviewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, item_id)
);

CREATE INDEX review_items_user_due_idx ON review_items (user_id, due_at);

CREATE TABLE review_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    item_id TEXT NOT NULL REFERENCES vocab_items(id) ON DELETE CASCADE,
    topic_id TEXT NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
    rating SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 4),
    interval_days INT NOT NULL,
    due_at TIMESTAMPTZ NOT NULL,
    reviewed_at TIMESTAMPTZ NOT NULL,
    client_event_id UUID,
    received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Idempotency: a client retrying a submit replays its client_event_id and
-- must not create a second event or move the schedule.
CREATE UNIQUE INDEX review_events_client_event_idx
    ON review_events (user_id, client_event_id)
    WHERE client_event_id IS NOT NULL;

CREATE INDEX review_events_user_item_idx ON review_events (user_id, item_id);
