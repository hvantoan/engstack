# Self-host full stack tại local — plan

## Mục tiêu
Một lệnh `make selfhost` dựng toàn bộ app tại máy local: Postgres 16 + Go API + web (nginx),
tự migrate, tự seed dữ liệu từ vựng khi DB rỗng, healthcheck đầy đủ, đăng nhập Google OAuth thật.

## Quyết định
- Một `docker-compose.yml` duy nhất (local). Không TLS, không domain, không compose.prod.
- Seed tự động, idempotent: chỉ nạp khi bảng `topics` rỗng.
- Auth thật: `AUTH_DEV_MODE=false`, `GOOGLE_CLIENT_ID` bắt buộc (fail-fast khi thiếu).
- Không hardcode secret trong compose; cấu hình qua `.env` (compose tự đọc).

## Phases

### Phase 1 — compose full stack
- `docker-compose.yml`: thêm service `seed` (one-shot, `depends_on api healthy`) và `web`
  (build root Dockerfile, port `${WEB_PORT:-5199}`, proxy `/api` → `api:8080`), healthcheck
  cho `api` (dùng chính binary) và `web` (`wget /healthz`), `restart: unless-stopped`.
- Biến từ `.env`: `POSTGRES_PASSWORD`, `JWT_SECRET`, `VITE_GOOGLE_CLIENT_ID`, `AUTH_DEV_MODE`, `WEB_PORT`.

### Phase 2 — binary hỗ trợ probe/seed
- `backend/cmd/api`: flag `-healthcheck` (probe `/api/v1/health`, exit 0/1) vì image `scratch`
  không có curl/wget.
- `backend/cmd/seed`: flag `-if-empty` (bỏ qua khi `topics` đã có dữ liệu).

### Phase 3 — một lệnh
- `Makefile`: `selfhost`, `down`, `logs`, `seed`, `reset`; `deploy`/`docker-build`/`docker-stop`
  chuyển sang compose để không tranh port 5199 với container `docker run` cũ.
- `.env.example`: bổ sung `WEB_PORT`, `POSTGRES_PASSWORD`, `JWT_SECRET`, `AUTH_DEV_MODE`.

### Phase 4 — tài liệu & verify
- `docs/selfhost.md`: runbook (Google OAuth origin, lệnh, reset, backup, troubleshooting) + link README.
- Verify: `gofmt`/`go vet`/`go build`, `docker compose config`, chạy thật stack, kiểm tra
  `/healthz`, `/api/v1/health`, `/api/v1/topics` có dữ liệu sau seed.
