SHELL := /bin/bash
.DEFAULT_GOAL := help
DATABASE_URL ?= postgres://postgres:postgrespassword@localhost:5433/engstack?sslmode=disable
DATA_DIR ?= ../data
BASE_URL ?= http://localhost:8080

.PHONY: help
help: ## Show targets
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  %-14s %s\n", $$1, $$2}'

.PHONY: build
build: ## Compile all packages
	go build ./...

.PHONY: test
test: ## Run the full test suite with the race detector
	go test -race ./...

.PHONY: lint
lint: ## gofmt check + go vet
	test -z "$$(gofmt -l .)"
	go vet ./...

.PHONY: migrate
migrate: ## Apply migrations via the API boot path
	DATABASE_URL=$(DATABASE_URL) go run ./cmd/api &
	@sleep 1; kill %1 2>/dev/null || true

.PHONY: seed
seed: ## Import the frontend dataset
	DATABASE_URL=$(DATABASE_URL) go run ./cmd/seed --data-dir $(DATA_DIR)

.PHONY: run
run: ## Run the API locally
	DATABASE_URL=$(DATABASE_URL) go run ./cmd/api

.PHONY: up
up: ## Start Postgres + API in Docker
	docker compose --project-directory .. --env-file ../.env -f ../infras/docker-compose.yml up -d --build

.PHONY: down
down: ## Stop the Docker stack
	docker compose --project-directory .. --env-file ../.env -f ../infras/docker-compose.yml down

.PHONY: e2e
e2e: ## Run the HTTP smoke test against a running API
	bash scripts/test-e2e.sh

.PHONY: docker-build
docker-build: ## Build the API image
	docker build -t engstack-api .
