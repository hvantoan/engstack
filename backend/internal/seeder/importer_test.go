package seeder_test

import (
	"context"
	"testing"

	"engstack/backend/internal/seeder"
	"engstack/backend/internal/testutil"
)

const testDataDir = "../../../data"

func TestImportDatabaseIntegration(t *testing.T) {
	pool := testutil.DB(t)
	ctx := context.Background()

	topics, err := seeder.ParseDir(testDataDir)
	if err != nil {
		t.Fatalf("ParseDir: %v", err)
	}
	if err := seeder.Import(ctx, pool, topics); err != nil {
		t.Fatalf("Import: %v", err)
	}

	var topicCount int
	if err := pool.QueryRow(ctx, "SELECT COUNT(*) FROM topics").Scan(&topicCount); err != nil {
		t.Fatal(err)
	}
	if topicCount != 24 {
		t.Fatalf("topics = %d, want 24", topicCount)
	}

	var itemCount int
	if err := pool.QueryRow(ctx, "SELECT COUNT(*) FROM vocab_items").Scan(&itemCount); err != nil {
		t.Fatal(err)
	}
	if itemCount != 7303 {
		t.Fatalf("vocab_items = %d, want 7303", itemCount)
	}

	// Idempotency: a second run must not error or duplicate.
	if err := seeder.Import(ctx, pool, topics); err != nil {
		t.Fatalf("second Import: %v", err)
	}
	if err := pool.QueryRow(ctx, "SELECT COUNT(*) FROM vocab_items").Scan(&itemCount); err != nil {
		t.Fatal(err)
	}
	if itemCount != 7303 {
		t.Fatalf("vocab_items after re-import = %d, want 7303", itemCount)
	}

	var (
		track      string
		definition string
		pos        []string
	)
	err = pool.QueryRow(ctx, `SELECT track, definition, pos FROM vocab_items WHERE id = 'oxford-b1:about:preposition'`).
		Scan(&track, &definition, &pos)
	if err != nil {
		t.Fatal(err)
	}
	if track != "oxford" || definition == "" || len(pos) != 1 || pos[0] != "preposition" {
		t.Fatalf("oxford sample = %q %q %v", track, definition, pos)
	}

	var ieltsPos []string
	err = pool.QueryRow(ctx, `SELECT track, pos FROM vocab_items WHERE id = 'education:early-childhood-education'`).
		Scan(&track, &ieltsPos)
	if err != nil {
		t.Fatal(err)
	}
	if track != "ielts" || len(ieltsPos) != 0 {
		t.Fatalf("ielts sample = %q %v", track, ieltsPos)
	}
}
