package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"

	"github.com/golang-migrate/migrate/v4"
	"github.com/golang-migrate/migrate/v4/database/pgx/v5"
	"github.com/golang-migrate/migrate/v4/source/iofs"
	"github.com/jackc/pgx/v5/pgxpool"
	_ "github.com/jackc/pgx/v5/stdlib"

	"engstack/backend/migrations"
)

// Open creates a bounded connection pool.
//
// ponytail: pool limits are fixed constants; expose env knobs when a deployment
// actually needs to tune them.
func Open(ctx context.Context, dsn string) (*pgxpool.Pool, error) {
	cfg, err := pgxpool.ParseConfig(dsn)
	if err != nil {
		return nil, fmt.Errorf("parse database url: %w", err)
	}
	cfg.MaxConns = 10
	cfg.MinConns = 1
	cfg.MaxConnIdleTime = 5 * time.Minute
	cfg.MaxConnLifetime = time.Hour

	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		return nil, fmt.Errorf("connect database: %w", err)
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("ping database: %w", err)
	}
	return pool, nil
}

// Migrate applies all embedded migrations, ignoring "no change".
func Migrate(dsn string) error {
	src, err := iofs.New(migrations.FS, ".")
	if err != nil {
		return fmt.Errorf("load migrations: %w", err)
	}
	db, err := sql.Open("pgx", dsn)
	if err != nil {
		return fmt.Errorf("open migration connection: %w", err)
	}
	defer db.Close()

	drv, err := pgx.WithInstance(db, &pgx.Config{})
	if err != nil {
		return fmt.Errorf("init migration driver: %w", err)
	}
	m, err := migrate.NewWithInstance("iofs", src, "pgx5", drv)
	if err != nil {
		return fmt.Errorf("init migrator: %w", err)
	}
	if err := m.Up(); err != nil && !errors.Is(err, migrate.ErrNoChange) {
		return fmt.Errorf("apply migrations: %w", err)
	}
	return checkSchema(db)
}

// checkSchema verifies that every table the server queries actually exists.
// schema_migrations only records which migration files ran — a table dropped
// manually afterwards would otherwise surface later as an unexplained 500 per
// request. Failing fast at boot is safer: the API refuses to serve a
// known-broken DB.
func checkSchema(db *sql.DB) error {
	required := []string{
		"users",
		"refresh_tokens",
		"topics",
		"vocab_items",
		"vocab_item_aliases",
		"user_progress",
		"review_items",
		"review_events",
		"user_positions",
		"learning_events",
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	for _, table := range required {
		var exists bool
		err := db.QueryRowContext(ctx,
			`SELECT EXISTS (SELECT 1 FROM information_schema.tables
			               WHERE table_schema = 'public' AND table_name = $1)`,
			table,
		).Scan(&exists)
		if err != nil {
			return fmt.Errorf("check schema for %s: %w", table, err)
		}
		if !exists {
			return fmt.Errorf("schema drift: required table %q missing after migrations", table)
		}
	}
	return nil
}
