// Command migrate applies the embedded schema migrations to DATABASE_URL and
// exits. Use it for one-shot provisioning (prod deploys, CI jobs) where the
// API's migrate-on-boot path is not appropriate.
package main

import (
	"log"

	"engstack/backend/internal/config"
	"engstack/backend/internal/store"
)

func main() {
	cfg := config.FromEnv()
	if err := store.Migrate(cfg.DatabaseURL); err != nil {
		log.Fatalf("migrate: %v", err)
	}
	log.Println("migrate: schema up to date")
}
