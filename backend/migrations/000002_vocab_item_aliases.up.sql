CREATE TABLE vocab_item_aliases (
    alias TEXT PRIMARY KEY,
    item_id TEXT NOT NULL REFERENCES vocab_items(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX vocab_item_aliases_item_id_idx ON vocab_item_aliases (item_id);
