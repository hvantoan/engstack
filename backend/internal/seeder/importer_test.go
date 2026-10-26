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

func testTopic(id string, items ...seeder.Item) seeder.Topic {
	return seeder.Topic{
		ID:          id,
		Track:       "ielts",
		Title:       id,
		Description: "test topic",
		Eyebrow:     "test",
		Accent:      "mint",
		Related:     []string{},
		Items:       items,
	}
}

func testItem(id string, aliases ...string) seeder.Item {
	return seeder.Item{
		ID:        id,
		Term:      "term " + id,
		Label:     "word",
		Meaning:   "meaning",
		Example:   "example",
		ExampleVi: "ví dụ",
		Pos:       []string{},
		Aliases:   aliases,
	}
}

func TestImportMigratesProgressAliases(t *testing.T) {
	pool := testutil.DB(t)
	ctx := t.Context()
	oldID := "unit:old-term"
	itemID := "unit:new-term"

	if err := seeder.Import(ctx, pool, []seeder.Topic{
		testTopic("unit", testItem(oldID), testItem(itemID)),
	}); err != nil {
		t.Fatalf("first Import: %v", err)
	}

	var userID string
	if err := pool.QueryRow(ctx,
		"INSERT INTO users (google_id, email, name) VALUES ('google-progress', 'progress@example.com', 'Progress') RETURNING id").
		Scan(&userID); err != nil {
		t.Fatalf("insert user: %v", err)
	}
	if _, err := pool.Exec(ctx,
		"INSERT INTO user_progress (user_id, item_id, topic_id) VALUES ($1, $2, 'unit'), ($1, $3, 'unit')",
		userID, oldID, itemID); err != nil {
		t.Fatalf("insert progress: %v", err)
	}

	if err := seeder.Import(ctx, pool, []seeder.Topic{
		testTopic("unit", testItem(itemID, oldID)),
	}); err != nil {
		t.Fatalf("second Import: %v", err)
	}

	var progress []string
	rows, err := pool.Query(ctx, "SELECT item_id FROM user_progress WHERE user_id = $1 ORDER BY item_id", userID)
	if err != nil {
		t.Fatalf("query progress: %v", err)
	}
	defer rows.Close()
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			t.Fatal(err)
		}
		progress = append(progress, id)
	}
	if len(progress) != 1 || progress[0] != itemID {
		t.Fatalf("progress = %v, want [%s]", progress, itemID)
	}

	var aliasTarget string
	if err := pool.QueryRow(ctx, "SELECT item_id FROM vocab_item_aliases WHERE alias = $1", oldID).
		Scan(&aliasTarget); err != nil {
		t.Fatalf("query alias: %v", err)
	}
	if aliasTarget != itemID {
		t.Fatalf("alias target = %q, want %q", aliasTarget, itemID)
	}
}

func TestImportDeletesObsoleteContent(t *testing.T) {
	pool := testutil.DB(t)
	ctx := t.Context()

	if err := seeder.Import(ctx, pool, []seeder.Topic{
		testTopic("unit", testItem("unit:old"), testItem("unit:keep")),
		testTopic("stale", testItem("stale:item")),
	}); err != nil {
		t.Fatalf("first Import: %v", err)
	}
	if err := seeder.Import(ctx, pool, []seeder.Topic{
		testTopic("unit", testItem("unit:keep")),
	}); err != nil {
		t.Fatalf("second Import: %v", err)
	}

	var topicCount, itemCount int
	if err := pool.QueryRow(ctx, "SELECT COUNT(*) FROM topics").Scan(&topicCount); err != nil {
		t.Fatal(err)
	}
	if err := pool.QueryRow(ctx, "SELECT COUNT(*) FROM vocab_items").Scan(&itemCount); err != nil {
		t.Fatal(err)
	}
	if topicCount != 1 || itemCount != 1 {
		t.Fatalf("content counts = %d topics/%d items, want 1/1", topicCount, itemCount)
	}
}
