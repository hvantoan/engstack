# Journal — Monorepo Project Organization & Self-host Isolation (implemented)

- Date: 2026-10-20
- Context: Tái cơ cấu tổ chức dự án để phân định rõ ràng Frontend (FE) và Backend (BE), dễ kiểm soát chất lượng và chia team, cô lập cấu hình selfhost vào `/infras`.
- Branch: `feat/backend-api`

## Việc đã làm

Tái cơ cấu toàn bộ cây thư mục repository từ mô hình Asymmetric Monorepo (FE nằm ở root, BE trong thư mục con) sang Balanced Monorepo với 4 không gian làm việc độc lập: `frontend/`, `backend/`, `infras/`, `data/`.

### 1. Hạ tầng & Selfhost (`infras/`)
- Tạo thư mục `infras/` và chuyển `docker-compose.yml` vào `infras/docker-compose.yml`.
- Cập nhật build context của service `web`: `./frontend`.
- Cập nhật volume mount của `api` và `seed`: `./data:/app/data:ro`.
- Cập nhật lệnh seed trong compose: `command: ["--data-dir", "/app/data", "-if-empty"]`.
- Toàn bộ lệnh Docker Compose ở root và backend Makefile được cấu hình với:
  `docker compose --project-directory . --env-file .env -f infras/docker-compose.yml`.

### 2. Không gian làm việc Frontend (`frontend/`)
- Di dời toàn bộ mã nguồn và cấu hình FE từ root vào `frontend/`:
  - `src/` (trừ `src/data`) → `frontend/src/`
  - `public/` → `frontend/public/`
  - `index.html`, `vite.config.ts`
  - `package.json`, `package-lock.json`
  - `tsconfig.json`, `tsconfig.app.json`, `tsconfig.node.json`
  - `components.json`, `eslint.config.js`, `.prettierrc`, `.prettierignore`
  - `Dockerfile`, `nginx.conf`, `.dockerignore` (để BuildKit không copy `node_modules`/`dist` thừa vào image).
- Cập nhật các script dữ liệu trong `frontend/package.json` trỏ về `../scripts/...`.

### 3. Dữ liệu từ vựng dùng chung (`data/`)
- Di dời `src/data/` thành `data/` ở root (gồm `data/topics/` và `data/oxford/`).
- Cập nhật các file backend liên quan:
  - `backend/Makefile`: `DATA_DIR ?= ../data`.
  - `backend/cmd/seed/main.go`: cờ mặc định `--data-dir` là `../data`.
  - `backend/internal/seeder/importer_test.go`, `parser_test.go`, `testutil/http.go`: cập nhật đường dẫn `testDataDir` thành `../../../data`.
- Cập nhật các script trong `scripts/`:
  - `scripts/load-oxford3000.ts`: dùng `import.meta.dirname` để xác định `data/oxford/`, loại bỏ rủi ro `process.cwd()`.
  - `scripts/data-check.ts`, `data-normalize.ts`, `data-translate.ts`: cập nhật `DATA_DIR` thành `data/` và import schema từ `../frontend/src/lib/vocab-schema.ts`.

### 4. Root Orchestrator (`Makefile`) & Tài liệu
- Root `Makefile`:
  - Đọc `NAME` và `VERSION` từ `./frontend/package.json`.
  - Giữ nguyên 100% các target nghiệp vụ: `help`, `install`, `dev`, `typecheck`, `lint`, `format`, `check`, `build`, `preview`, `release`, `load-oxford`, `selfhost`, `selfhost-down`, `selfhost-logs`, `seed`, `selfhost-reset`, `docker-build`, `deploy`, `docker-stop`, `clean`.
  - Bổ sung target `check-data` gọi trực tiếp `scripts/data-check.ts`.
  - Giữ trọn vẹn 2 vòng lặp retry health check của web (`/healthz`) và proxy API (`/api/v1/health`) với `$(WEB_PORT)`.
- Cập nhật tài liệu:
  - `README.md`: cập nhật sơ đồ cấu trúc mới và đường dẫn `data/`.
  - `docs/selfhost.md`: cập nhật đường dẫn `data/**` và lệnh `make seed`.
  - `docs/data-model.md`: chuẩn hóa đường dẫn `data/**`, `frontend/src/lib/`, và cú pháp lệnh seed.
  - `AGENTS.md`: cập nhật các lệnh xác minh (`make typecheck`, `make build`, `make lint`) và đường dẫn CSS.

## Kết quả nghiệm thu (Verification)

1. `make typecheck`: TypeScript check trong `frontend/` đạt 100% không lỗi.
2. `make lint`: ESLint trong `frontend/` đạt 100% không cảnh báo.
3. `make build`: Vite build thành công bundle production vào `frontend/dist/` trong 939ms (2.1MB).
4. `make check-data`: `7303 items · 24 modules · 0 duplicate id · 0 schema error · 0 warning`.
5. `cd backend && go vet ./...`: Go vet sạch 100%.
6. `cd backend && go test -race ./internal/... ./tests/e2e`: Toàn bộ các package backend (kể cả các package phụ thuộc `testutil.Server` và `../../../data` như `handler`, `server`, `store`, `auth`, `e2e`) đều Pass 100%.
7. `make release`: Chạy chuỗi `check` + `build` thành công.
8. `docker compose config`: Xác thực cú pháp `infras/docker-compose.yml` qua Docker Compose thành công, volume và build context resolve chính xác từ project root.
9. `frontend/vite.config.ts`: Bổ sung `envDir: resolve(import.meta.dirname, "..")` đảm bảo Vite dev server đọc đúng `.env` ở root. Smoke test `npm run dev` khởi động thành công trong 348ms.
10. `make docker-build`: Build thành công image `engstack-web:local` bằng Dockerfile trong `frontend/`, BuildKit nhận diện đúng `frontend/.dockerignore` (context chỉ 1.85MB, không lọt `node_modules`).
11. `make selfhost`: Dựng thành công toàn bộ stack (Postgres + API + Seed + Web). Cả 2 healthcheck web (`/healthz`) và proxy API (`/api/v1/health`) đều phản hồi 200 OK.
12. `make seed`: Nạp lại dữ liệu thành công từ volume `/app/data` (mount từ `./data`), parse và upsert trọn vẹn 24 topics, 7.303 vocab items trong 699ms.
13. `backend/scripts/test-e2e.sh`: Chạy trọn vẹn 9 phân hệ E2E (Health, Topics list, Topic detail, Auth Google, Guest import, Progress read, Toggle unlearn, Refresh token rotation, Revoke logout) với `AUTH_DEV_MODE=true` trên container API: **20 passed, 0 failed (100%)**.
14. `design-system/engstack/MASTER.md`: Cập nhật đường dẫn source of truth về `frontend/src/index.css` và `frontend/src/lib/vocab.ts`.
