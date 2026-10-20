---
phase: 6
title: "Dockerization & End-to-End Verification"
status: completed
priority: P1
effort: "3h"
dependencies: ["phase-03-topics-vocab-api", "phase-04-google-auth-jwt", "phase-05-progress-sync"]
---

# Phase 6: Dockerization & End-to-End Verification

## Goal
Containerize the backend with a minimal multi-stage `Dockerfile`, orchestrate local runtime via `docker-compose.yml`, automate database migrations on startup, and implement an end-to-end smoke verification script covering the entire user journey (Health $\rightarrow$ Public Topics $\rightarrow$ Auth $\rightarrow$ Guest Import $\rightarrow$ Toggle Progress $\rightarrow$ Token Rotation $\rightarrow$ Logout).

## Context & Architectural Invariants
- Dockerfile: Multi-stage build (Builder: `golang:1.22-alpine`, Final: `alpine:3.20` or `gcr.io/distroless/base-debian12`).
  - Final image size: < 30MB.
  - Run as non-root user (`appuser:10001`).
- `docker-compose.yml`:
  - `postgres`: PostgreSQL 16 Alpine with healthcheck.
  - `backend`: Depends on `postgres` healthy condition, runs migrations on boot before listening on port 8080.
- End-to-End Smoke Test (`scripts/test-e2e.sh` or `tests/e2e/e2e_test.go`):
  - Exercises all public and authenticated routes sequentially.
  - Verifies exact contract shapes, HTTP status codes, and database state mutations.

## Files to Create / Modify
- Create: `backend/Dockerfile`
- Create: `backend/.dockerignore`
- Modify: `docker-compose.yml` (add backend service and environment variables)
- Create: `backend/scripts/test-e2e.sh`
- Create: `backend/tests/e2e/e2e_test.go`
- Create: `backend/Makefile` (convenience targets: `make up`, `make down`, `make seed`, `make test`, `make lint`)

## Tests Before (TDD Contract)
Write `backend/tests/e2e/e2e_test.go` *before* finalizing Docker configuration:
1. `TestE2E_FullUserFlow`:
   - Step 1: `GET /api/v1/health` $\rightarrow$ 200 OK.
   - Step 2: `GET /api/v1/topics` $\rightarrow$ 200 OK, array of 24 topics.
   - Step 3: `GET /api/v1/topics/education` $\rightarrow$ 200 OK, 200 items with `topicId` and `track`.
   - Step 4: `POST /api/v1/auth/google` $\rightarrow$ 200 OK, returns `access_token` and `refresh_token`.
   - Step 5: `POST /api/v1/progress/import-guest` with Bearer token and 10 IDs $\rightarrow$ 200 OK, imported count.
   - Step 6: `GET /api/v1/progress` $\rightarrow$ 200 OK, returns mapped progress.
   - Step 7: `PUT /api/v1/progress/toggle` (unlearn 1 item) $\rightarrow$ 200 OK; verify item removed.
   - Step 8: `POST /api/v1/auth/refresh` $\rightarrow$ 200 OK, returns new token pair. Old refresh token rejected on retry.
   - Step 9: `POST /api/v1/auth/logout` $\rightarrow$ 204 No Content. Verify refresh token cannot be reused.

## Tasks & Implementation Steps
1. **Author Multi-stage `backend/Dockerfile`**:
   ```dockerfile
   # Stage 1: Build
   FROM golang:1.22-alpine AS builder
   WORKDIR /app
   RUN apk add --no-cache git ca-certificates
   COPY go.mod go.sum ./
   RUN go mod download
   COPY . .
   RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -ldflags="-w -s" -o /app/bin/api ./cmd/api
   RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -ldflags="-w -s" -o /app/bin/seed ./cmd/seed

   # Stage 2: Minimal runtime
   FROM alpine:3.20
   RUN apk add --no-cache ca-certificates tzdata
   RUN addgroup -S appgroup && adduser -S appuser -G appgroup
   WORKDIR /app
   COPY --from=builder /app/bin/api /app/bin/api
   COPY --from=builder /app/bin/seed /app/bin/seed
   COPY --from=builder /app/migrations /app/migrations
   USER appuser
   EXPOSE 8080
   CMD ["/app/bin/api"]
   ```
2. **Update `docker-compose.yml`**:
   ```yaml
   services:
     postgres:
       image: postgres:16-alpine
       container_name: engstack-db
       environment:
         POSTGRES_USER: postgres
         POSTGRES_PASSWORD: postgrespassword
         POSTGRES_DB: engstack
       ports:
         - "5432:5432"
       volumes:
         - pgdata:/var/lib/postgresql/data
       healthcheck:
         test: ["CMD-SHELL", "pg_isready -U postgres"]
         interval: 5s
         timeout: 5s
         retries: 5

     backend:
       build:
         context: ./backend
         dockerfile: Dockerfile
       container_name: engstack-api
       environment:
         PORT: 8080
         DATABASE_URL: "postgres://postgres:postgrespassword@postgres:5432/engstack?sslmode=disable"
         JWT_SECRET: "dev-insecure-secret-key-change-in-prod"
         GOOGLE_CLIENT_ID: "mock-google-client-id"
         CORS_ALLOWED_ORIGINS: "http://localhost:5173,http://localhost:3000"
      ports:
        - "8080:8080"
      volumes:
        - ./src/data:/app/src/data:ro
      depends_on:
        postgres:
          condition: service_healthy

   volumes:
     pgdata:
   ```
3. **Automate Startup Migrations in `cmd/api/main.go`**:
   - Use `golang-migrate/migrate/v4` with database driver `pgx5` to run `m.Up()` before starting the HTTP listener.
4. **Implement Makefile (`backend/Makefile`)**:
   - Targets: `test`, `lint`, `seed`, `docker-build`, `docker-up`, `docker-down`, `e2e`.
5. **Implement E2E Smoke Script (`backend/scripts/test-e2e.sh`)**:
   - Bash script with color-coded pass/fail output checking HTTP codes, JSON shapes, and database state.

## Refactor (Protected Changes)
- Harden container security: drop all capabilities, ensure filesystem is read-only where possible, run strictly as non-root user.
- Ensure graceful container shutdown handles `SIGTERM` within 10 seconds.

## Tests After (New Behavior)
- Image scan with Trivy / Docker scout: verify 0 HIGH or CRITICAL security vulnerabilities in the final image.
- Image size check: verify final image size is strictly under 35MB.

## Verification & Regression Gate
```bash
# Build and run with docker compose
docker compose up --build -d

# Run seeder inside container (via mounted read-only volume) or directly from host:
docker compose exec backend /app/bin/seed --data-dir /app/src/data
# Alternatively from host: (cd backend && go run ./cmd/seed --data-dir ../src/data)
# Run E2E smoke tests
bash backend/scripts/test-e2e.sh

# Run entire backend Go test suite with race detector
cd backend && go test -v -race ./...
```
Pass condition: Containers build and run without error; E2E smoke test script completes with all 9 steps passing; `go test -v -race ./...` passes 100%.

## Todo List
- [x] Create `backend/Dockerfile` and `backend/.dockerignore`
- [x] Update root `docker-compose.yml` to define `postgres` and `backend` services
- [x] Integrate programmatic migration runner on boot in `cmd/api/main.go`
- [x] Write `backend/tests/e2e/e2e_test.go`
- [x] Write `backend/scripts/test-e2e.sh`
- [x] Create `backend/Makefile` with convenience developer commands
- [x] Run full E2E verification gate

## Risk Assessment & Security
- **Risk**: Database connection timing issue during container boot.
  - **Mitigation**: `depends_on` with `condition: service_healthy` on PostgreSQL ensures Postgres is actively accepting connections before the backend launches.
- **Security**: Production deployments must supply secure random strings for `JWT_SECRET` and actual Google Client credentials via secrets management.
