// Command seed imports the frontend JSON datasets into PostgreSQL.
package main

import (
	"context"
	"flag"
	"log"
	"time"

	"engstack/backend/internal/config"
	"engstack/backend/internal/seeder"
	"engstack/backend/internal/store"
)

func main() {
	dataDir := flag.String("data-dir", "../data", "path to the data directory")
	dryRun := flag.Bool("dry-run", false, "parse and validate only")
	ifEmpty := flag.Bool("if-empty", false, "skip import when the topics table already has rows")
	flag.Parse()

	start := time.Now()
	topics, err := seeder.ParseDir(*dataDir)
	if err != nil {
		log.Fatalf("seed: %v", err)
	}
	total := 0
	for _, t := range topics {
		total += len(t.Items)
		log.Printf("parsed %-14s %-10s %4d items", t.ID, t.Track, len(t.Items))
	}
	log.Printf("parsed %d modules, %d items in %s", len(topics), total, time.Since(start).Round(time.Millisecond))
	if *dryRun {
		return
	}

	cfg := config.FromEnv()
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()

	pool, err := store.Open(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("seed: %v", err)
	}
	defer pool.Close()

	if *ifEmpty {
		var existing int
		if err := pool.QueryRow(ctx, "SELECT COUNT(*) FROM topics").Scan(&existing); err != nil {
			log.Fatalf("seed: %v", err)
		}
		if existing > 0 {
			log.Printf("seed: %d topics already present, skipping", existing)
			return
		}
	}

	if err := seeder.Import(ctx, pool, topics); err != nil {
		log.Fatalf("seed: %v", err)
	}

	var topicCount, itemCount int
	if err := pool.QueryRow(ctx, "SELECT COUNT(*) FROM topics").Scan(&topicCount); err != nil {
		log.Fatalf("seed: %v", err)
	}
	if err := pool.QueryRow(ctx, "SELECT COUNT(*) FROM vocab_items").Scan(&itemCount); err != nil {
		log.Fatalf("seed: %v", err)
	}
	log.Printf("done: %d topics, %d vocab items in %s", topicCount, itemCount, time.Since(start).Round(time.Millisecond))
}
