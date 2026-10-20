// Command api runs the engstack REST API.
package main

import (
	"context"
	"errors"
	"flag"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"engstack/backend/internal/config"
	"engstack/backend/internal/server"
	"engstack/backend/internal/store"
)

func main() {
	// Image is `scratch` (no curl/wget), so Docker healthchecks reuse this binary.
	healthcheck := flag.Bool("healthcheck", false, "probe the local /api/v1/health endpoint and exit")
	flag.Parse()
	if *healthcheck {
		os.Exit(probe())
	}

	cfg := config.FromEnv()

	if cfg.MigrateOnBoot {
		if err := store.Migrate(cfg.DatabaseURL); err != nil {
			log.Fatalf("migrate: %v", err)
		}
	}

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	pool, err := store.Open(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("database: %v", err)
	}
	defer pool.Close()

	srv := server.NewHTTPServer(":"+cfg.Port, server.New(cfg, pool, server.Verifier(cfg)))

	errCh := make(chan error, 1)
	go func() {
		log.Printf("api listening on :%s", cfg.Port)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			errCh <- err
		}
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)

	select {
	case err := <-errCh:
		log.Fatalf("serve: %v", err)
	case sig := <-stop:
		log.Printf("received %s, shutting down", sig)
	}

	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer shutdownCancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		log.Printf("graceful shutdown failed: %v", err)
	}
}

func probe() int {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	client := http.Client{Timeout: 3 * time.Second}
	resp, err := client.Get("http://127.0.0.1:" + port + "/api/v1/health")
	if err != nil {
		log.Printf("healthcheck: %v", err)
		return 1
	}
	defer resp.Body.Close() //nolint:errcheck // read-only probe
	if resp.StatusCode != http.StatusOK {
		log.Printf("healthcheck: status %d", resp.StatusCode)
		return 1
	}
	return 0
}
