package store_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"

	"engstack/backend/internal/store"
	"engstack/backend/internal/testutil"
)

func TestMigrationsApplyAndRollback(t *testing.T) {
	pool := testutil.DB(t) // applies migrations
	ctx := context.Background()

	for _, table := range []string{"users", "refresh_tokens", "topics", "vocab_items", "user_progress"} {
		var exists bool
		err := pool.QueryRow(ctx, `SELECT to_regclass($1) IS NOT NULL`, "public."+table).Scan(&exists)
		if err != nil {
			t.Fatal(err)
		}
		if !exists {
			t.Fatalf("table %s missing", table)
		}
	}

	var indexExists bool
	err := pool.QueryRow(ctx, `SELECT to_regclass('public.user_progress_user_topic_idx') IS NOT NULL`).Scan(&indexExists)
	if err != nil {
		t.Fatal(err)
	}
	if !indexExists {
		t.Fatal("user_progress_user_topic_idx missing")
	}
}

func TestUserAndRefreshTokenConstraints(t *testing.T) {
	pool := testutil.DB(t)
	ctx := context.Background()
	q := store.New(pool)

	user, err := q.UpsertUserByGoogleID(ctx, store.UpsertUserByGoogleIDParams{
		GoogleID: "g-1", Email: "a@example.com", Name: "A",
	})
	if err != nil {
		t.Fatalf("upsert user: %v", err)
	}

	// Upsert is idempotent on google_id.
	if _, err := q.UpsertUserByGoogleID(ctx, store.UpsertUserByGoogleIDParams{
		GoogleID: "g-1", Email: "b@example.com", Name: "B",
	}); err != nil {
		t.Fatalf("second upsert: %v", err)
	}
	var email string
	if err := pool.QueryRow(ctx, `SELECT email FROM users WHERE id = $1`, user.ID).Scan(&email); err != nil {
		t.Fatal(err)
	}
	if email != "b@example.com" {
		t.Fatalf("email = %q, want b@example.com", email)
	}

	hash := "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
	expiry := pgtype.Timestamptz{Time: time.Now().Add(time.Hour), Valid: true}
	err = q.CreateRefreshToken(ctx, store.CreateRefreshTokenParams{
		UserID: user.ID, TokenHash: hash, ExpiresAt: expiry,
	})
	if err != nil {
		t.Fatalf("create refresh token: %v", err)
	}

	err = q.CreateRefreshToken(ctx, store.CreateRefreshTokenParams{
		UserID: user.ID, TokenHash: hash, ExpiresAt: expiry,
	})
	var pgErr *pgconn.PgError
	if err == nil || !errors.As(err, &pgErr) || pgErr.Code != "23505" {
		t.Fatalf("expected unique violation, got %v", err)
	}

	// Cascade delete.
	if _, err := pool.Exec(ctx, `DELETE FROM users WHERE id = $1`, user.ID); err != nil {
		t.Fatal(err)
	}
	var remaining int
	if err := pool.QueryRow(ctx, `SELECT COUNT(*) FROM refresh_tokens`).Scan(&remaining); err != nil {
		t.Fatal(err)
	}
	if remaining != 0 {
		t.Fatalf("refresh_tokens remaining = %d, want 0", remaining)
	}
}

func TestVocabReferentialIntegrity(t *testing.T) {
	pool := testutil.DB(t)
	ctx := context.Background()
	q := store.New(pool)

	if err := q.UpsertTopic(ctx, store.UpsertTopicParams{
		ID: "education", Track: "ielts", Title: "Education", Description: "d",
		Eyebrow: "e", Accent: "mint", OrderIndex: 1, Related: []string{},
	}); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `INSERT INTO vocab_items (id, topic_id, track, term, label, meaning, example, example_vi)
		VALUES ('education:x', 'education', 'ielts', 'x', 'word', 'm', 'e', 'v')`); err != nil {
		t.Fatalf("valid insert: %v", err)
	}

	_, err := pool.Exec(ctx, `INSERT INTO vocab_items (id, topic_id, track, term, label, meaning, example, example_vi)
		VALUES ('ghost:x', 'ghost', 'ielts', 'x', 'word', 'm', 'e', 'v')`)
	var pgErr *pgconn.PgError
	if err == nil || !errors.As(err, &pgErr) || pgErr.Code != "23503" {
		t.Fatalf("expected FK violation, got %v", err)
	}
}

func TestSqlcGeneratedQueries(t *testing.T) {
	pool := testutil.DB(t)
	ctx := context.Background()
	q := store.New(pool)

	if err := q.UpsertTopic(ctx, store.UpsertTopicParams{
		ID: "education", Track: "ielts", Title: "Education", Description: "d",
		Eyebrow: "e", Accent: "mint", OrderIndex: 1, Related: []string{"work"},
	}); err != nil {
		t.Fatal(err)
	}
	if err := q.UpsertVocabItem(ctx, store.UpsertVocabItemParams{
		ID: "education:x", TopicID: "education", Track: "ielts", Term: "x",
		Label: "word", Meaning: "m", Example: "e", ExampleVi: "v", Pos: []string{},
	}); err != nil {
		t.Fatal(err)
	}

	topics, err := q.ListTopicsWithCount(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if len(topics) != 1 || topics[0].ItemCount != 1 {
		t.Fatalf("topics = %+v", topics)
	}

	topic, err := q.GetTopicByID(ctx, "education")
	if err != nil {
		t.Fatal(err)
	}
	if topic.Title != "Education" {
		t.Fatalf("title = %q", topic.Title)
	}

	if _, err := q.ListVocabByTopicID(ctx, "education"); err != nil {
		t.Fatal(err)
	}

	var count int
	if err := pool.QueryRow(ctx, `SELECT COUNT(*) FROM vocab_items`).Scan(&count); err != nil {
		t.Fatal(err)
	}
	if count != 1 {
		t.Fatalf("upsert duplicated rows: %d", count)
	}

	// Upsert again must update in place.
	if err := q.UpsertVocabItem(ctx, store.UpsertVocabItemParams{
		ID: "education:x", TopicID: "education", Track: "ielts", Term: "x",
		Label: "word", Meaning: "updated", Example: "e", ExampleVi: "v", Pos: []string{},
	}); err != nil {
		t.Fatal(err)
	}
	items, err := q.ListVocabByTopicID(ctx, "education")
	if err != nil {
		t.Fatal(err)
	}
	if len(items) != 1 || items[0].Meaning != "updated" {
		t.Fatalf("items = %+v", items)
	}

	if _, err := q.GetTopicByID(ctx, "missing"); err != pgx.ErrNoRows {
		t.Fatalf("expected ErrNoRows, got %v", err)
	}
}
