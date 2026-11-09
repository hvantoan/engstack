-- No-op down: dropping vocab_item_aliases here could destroy aliases written
-- after the repair ran. Drift repair is intentionally irreversible.
SELECT 1;
