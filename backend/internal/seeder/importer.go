package seeder

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"engstack/backend/internal/store"
)

const batchSize = 500

// Import upserts topics then items in a single transaction so a partial seed
// can never be observed.
func Import(ctx context.Context, pool *pgxpool.Pool, topics []Topic) error {
	tx, err := pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin transaction: %w", err)
	}
	defer tx.Rollback(ctx) //nolint:errcheck // rollback after commit is a no-op

	q := store.New(tx)
	for _, t := range topics {
		if err := q.UpsertTopic(ctx, store.UpsertTopicParams{
			ID:          t.ID,
			Track:       t.Track,
			Title:       t.Title,
			Description: t.Description,
			Eyebrow:     t.Eyebrow,
			Accent:      t.Accent,
			Level:       optional(t.Level),
			OrderIndex:  int32(t.Order),
			Related:     t.Related,
		}); err != nil {
			return fmt.Errorf("upsert topic %s: %w", t.ID, err)
		}

		batch := &pgx.Batch{}
		for _, it := range t.Items {
			batch.Queue(upsertItemSQL,
				it.ID, t.ID, t.Track, it.Term, it.IPA, it.Label, it.Meaning,
				it.Example, it.ExampleVi, it.Definition, optional(it.Level), it.Pos,
			)
		}
		if err := tx.SendBatch(ctx, batch).Close(); err != nil {
			return fmt.Errorf("upsert items for %s: %w", t.ID, err)
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit seed: %w", err)
	}
	return nil
}

// sqlc cannot batch, so this mirrors queries/vocab.sql:UpsertVocabItem. Keep the
// two in sync.
const upsertItemSQL = `
INSERT INTO vocab_items (id, topic_id, track, term, ipa, label, meaning, example, example_vi, definition, level, pos)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
ON CONFLICT (id) DO UPDATE SET
    topic_id = EXCLUDED.topic_id, track = EXCLUDED.track, term = EXCLUDED.term,
    ipa = EXCLUDED.ipa, label = EXCLUDED.label, meaning = EXCLUDED.meaning,
    example = EXCLUDED.example, example_vi = EXCLUDED.example_vi,
    definition = EXCLUDED.definition, level = EXCLUDED.level, pos = EXCLUDED.pos`

func optional(v string) *string {
	if v == "" {
		return nil
	}
	return &v
}
