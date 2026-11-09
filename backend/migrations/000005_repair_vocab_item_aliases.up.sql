-- Repair drift: vocab_item_aliases was missing on DBs whose
-- schema_migrations already recorded version 2+ (e.g. dev volumes where the
-- table was dropped manually). Migration 2 cannot be replayed because its
-- version is already marked applied, so this file re-creates the objects
-- idempotently. CREATE TABLE/INDEX IF NOT EXISTS makes it a no-op on healthy
-- databases; it never touches existing rows.
CREATE TABLE IF NOT EXISTS vocab_item_aliases (
    alias TEXT PRIMARY KEY,
    item_id TEXT NOT NULL REFERENCES vocab_items(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS vocab_item_aliases_item_id_idx ON vocab_item_aliases (item_id);
