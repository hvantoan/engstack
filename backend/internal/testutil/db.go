// Package testutil provides shared integration-test helpers.
package testutil

import (
	"context"
	"os"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"engstack/backend/internal/store"
)

// dbLockKey serializes integration tests across packages. `go test ./...` runs
// package binaries concurrently against this one database; without the lock
// they truncate each other's fixtures mid-test.
const dbLockKey int64 = 731003

// DB connects to TEST_DATABASE_URL (default: local docker-compose Postgres),
// applies migrations, and truncates user data. Tests skip when no database is
// reachable so `go test ./...` still works without Docker.
func DB(t testing.TB) *pgxpool.Pool {
	t.Helper()

	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		dsn = "postgres://postgres:postgrespassword@localhost:5433/engstack?sslmode=disable"
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := store.Migrate(dsn); err != nil {
		t.Skipf("test database unavailable: %v", err)
	}

	pool, err := store.Open(ctx, dsn)
	if err != nil {
		t.Skipf("test database unavailable: %v", err)
	}
	t.Cleanup(pool.Close)

	// Hold a dedicated connection so the session-level lock spans the test.
	conn, err := pool.Acquire(ctx)
	if err != nil {
		t.Skipf("test database unavailable: %v", err)
	}
	if _, err := conn.Exec(ctx, "SELECT pg_advisory_lock($1)", dbLockKey); err != nil {
		conn.Release()
		t.Skipf("test database lock unavailable: %v", err)
	}
	t.Cleanup(func() {
		unlockCtx, unlockCancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer unlockCancel()
		_, _ = conn.Exec(unlockCtx, "SELECT pg_advisory_unlock($1)", dbLockKey)
		conn.Release()
	})

	if _, err := pool.Exec(ctx, "TRUNCATE user_progress, refresh_tokens, vocab_items, topics, users CASCADE"); err != nil {
		t.Fatalf("truncate: %v", err)
	}
	return pool
}
