ALTER TABLE vocab_items
    ADD COLUMN order_index INT NOT NULL DEFAULT 0;

CREATE INDEX vocab_items_topic_order_idx ON vocab_items (topic_id, order_index);
