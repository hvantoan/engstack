---
title: "Phase 5: Deploy Proxy & Docs"
status: todo
priority: P2
effort: 2h
dependencies: [1, 2, 3, 4]
---

# Phase 5: Deploy Proxy & Docs

## Overview

Đưa API về cùng origin để không phụ thuộc CORS trong production, đồng thời cập nhật tài liệu
đang mô tả kiến trúc cũ (README dòng 66-70, `docs/data-model.md`).

## Requirements

- [ ] Vite dev proxy `/api` → `http://localhost:8080`.
- [ ] nginx `location /api/` proxy tới `backend:8080`, đặt **trước** `location /`.
- [ ] `Makefile` deploy path phải đưa web container vào cùng network với backend, nếu không
      `proxy_pass http://backend:8080` trả 502: `docker run ... --network $(COMPOSE_NETWORK)`
      ở cả `deploy` và `docker-run` (`Makefile:113,125`), `COMPOSE_NETWORK ?= engstack_default`.
- [ ] `make deploy` health check thêm `curl -fsS http://localhost:$(PORT)/api/v1/health` — healthz
      tĩnh hiện tại vẫn pass khi proxy hỏng, nên deploy mù.
- [ ] `Dockerfile` nhận build args `VITE_GOOGLE_CLIENT_ID`, `VITE_API_BASE_URL`, `VITE_CONTENT_VERSION`
      (`ARG` + `ENV` trước `npm run build`); `make docker-build` truyền `--build-arg` — Vite inline
      env lúc build, không có ARG thì image production không có client ID/không invalidate cache list.
- [ ] `make deploy` fail-fast khi `VITE_GOOGLE_CLIENT_ID` rỗng (image prod sẽ không có nút login vì
      nút dev bị gate bởi `import.meta.env.DEV`).
- [ ] Production phải chạy backend trên cùng host/network (`docker compose up -d postgres backend`)
      trước khi deploy web; nếu backend ở host khác thì route `/api` tại reverse proxy của host thay vì
      trong container — chọn một, ghi rõ trong README.
- [ ] `VITE_API_BASE_URL` không bắt buộc (mặc định `/api/v1`).
- [ ] `docker-compose.yml` không đổi trừ khi cần thêm network/host; ghi rõ endpoint same-origin.
- [ ] Docs: `README.md` mục Backend API + cấu trúc; `docs/data-model.md` ghi `src/data` = seed only.
- [ ] Ghi rõ `docker-compose.yml` là runtime local: `AUTH_DEV_MODE: "true"` (dòng 31) và
      `JWT_SECRET: "dev-insecure-secret-key-change-in-prod"` (dòng 29) **không được** dùng khi deploy;
      production phải `AUTH_DEV_MODE=false` + `JWT_SECRET` ngẫu nhiên. Không tạo file compose prod mới
      trong plan này — chỉ tài liệu hoá và thêm cổng kiểm.
- [ ] Cập nhật `.env.example` (FE) với `VITE_API_BASE_URL`, `VITE_GOOGLE_CLIENT_ID`,
      `VITE_CONTENT_VERSION`.

## Files to Create / Modify

- Modify: `vite.config.ts`
- Modify: `nginx.conf`
- Modify: `Makefile` (`deploy`, `docker-run`, `docker-build`: network + build args + API health)
- Modify: `Dockerfile` (ARG/ENV cho `VITE_GOOGLE_CLIENT_ID`, `VITE_API_BASE_URL`)
- Modify: `.env.example`
- Modify: `README.md`
- Modify: `docs/data-model.md`

## Implementation Steps

1. `vite.config.ts`:
   ```ts
   server: { proxy: { "/api": { target: "http://localhost:8080", changeOrigin: true } } }
   ```
2. `nginx.conf`: **thêm** block `location /api/` (hiện chưa có), chèn trước `location /`:
   ```nginx
   location /api/ {
       proxy_pass http://backend:8080;
       proxy_set_header Host $host;
       proxy_set_header X-Real-IP $remote_addr;
       proxy_set_header X-Forwarded-Proto $scheme;
   }
   ```
   Lưu ý: `proxy_pass` **không** có dấu `/` cuối để giữ nguyên path `/api/v1/...`.
3. `.env.example`: thêm
   ```
   VITE_API_BASE_URL=/api/v1
   VITE_GOOGLE_CLIENT_ID=
   VITE_CONTENT_VERSION=dev
   ```
4. `README.md`: mô tả FE gọi API qua same-origin, cách chạy `docker compose up -d --build`
   + seed, và dev mode login.
5. `docs/data-model.md`: thay phần "Loader: src/lib/vocab.ts" bằng "JSON là seed cho backend;
   runtime đọc API"; giữ nguyên luật `id` vì progress trỏ vào `VocabItem.id`.
6. `Dockerfile`: trước `npm run build`
   ```dockerfile
   ARG VITE_GOOGLE_CLIENT_ID=""
   ARG VITE_API_BASE_URL="/api/v1"
   ARG VITE_CONTENT_VERSION="dev"
   ENV VITE_GOOGLE_CLIENT_ID=$VITE_GOOGLE_CLIENT_ID \
       VITE_API_BASE_URL=$VITE_API_BASE_URL \
       VITE_CONTENT_VERSION=$VITE_CONTENT_VERSION
   ```
7. `Makefile`:
   - `COMPOSE_NETWORK ?= engstack_default`.
   - `docker-build`: guard đầu recipe `test -n "$(VITE_GOOGLE_CLIENT_ID)"` — chạy cả khi `deploy`
     gọi nó như prerequisite, nên fail trước `docker build`; message nêu cách set biến.
   - `docker-build`: thêm `--build-arg VITE_GOOGLE_CLIENT_ID=$(VITE_GOOGLE_CLIENT_ID)`,
     `--build-arg VITE_API_BASE_URL=$(VITE_API_BASE_URL)`,
     `--build-arg VITE_CONTENT_VERSION=$(VITE_CONTENT_VERSION)`.
   - `deploy` và `docker-run`: thêm `--network $(COMPOSE_NETWORK)` vào `docker run`.
   - `deploy` health loop: kiểm cả `/healthz` **và** `/api/v1/health`, fail deploy nếu API 502.
8. Nếu `Dockerfile` FE chỉ build static: không đổi; nginx.conf được copy sẵn trong image.

## Verification

- `npm run dev` (không phải `preview` — `server.proxy` không áp dụng cho `vite preview`) rồi
  `curl -s http://localhost:5173/api/v1/health` → 200 JSON. Nếu muốn `preview` cũng proxy thì thêm
  `preview: { proxy: { "/api": ... } }`.
- `npm run build` pass; kiểm tra bundle không còn dữ liệu vocab (xem phase 6).
- `docker compose up -d --build && docker compose exec backend /app/bin/seed --data-dir /app/src/data`
  → `curl -s http://localhost:8080/api/v1/topics | head` có dữ liệu.
- nginx: `docker-compose.yml` **không có service `web`** (chỉ `postgres` và `backend`, dòng 4 và 21).
  Kiểm chứng bằng lệnh tường minh:
  ```bash
  docker build -t engstack-web . && \
  docker run --rm -d --name engstack-web --network engstack_default -p 8081:80 engstack-web && \
  curl -s http://localhost:8081/api/v1/health && curl -s http://localhost:8081/healthz
  ```
  (network name lấy từ `docker network ls | grep engstack`; nếu thêm service `web` vào compose thì
  đó là scope mới và phải nêu rõ.)
- `make deploy` thật (không chỉ docker run tay): `PORT=5199 make deploy` → cả
  `curl -s http://localhost:5199/healthz` và `curl -s http://localhost:5199/api/v1/health` trả 200;
  `docker inspect -f '{{range $k,$v := .NetworkSettings.Networks}}{{$k}} {{end}}' engstack-web`
  chứa `engstack_default`.
- Build args có hiệu lực: `docker run --rm engstack-web sh -c 'grep -c "accounts.google.com" /usr/share/nginx/html/index.html'`
  > 0 (GIS script vẫn có), và bundle chứa client id khi truyền `VITE_GOOGLE_CLIENT_ID`:</br>
  `docker run --rm engstack-web sh -c 'grep -rl "client_id" /usr/share/nginx/html/assets | head -1'`.
- `grep -n "location /api/" nginx.conf` đứng trước `location /`.
- Fail-fast: `VITE_GOOGLE_CLIENT_ID= make deploy` → exit != 0 trước bước `docker build`, message
  nêu biến thiếu. Positive case không đụng deployment đang chạy:
  `VITE_GOOGLE_CLIENT_ID=x make docker-build` → exit 0.
- Bundle mang đúng version: build với `VITE_CONTENT_VERSION=2.0.1` rồi
  `docker run --rm engstack-web grep -rl "2.0.1" /usr/share/nginx/html/assets` → có kết quả
  (không phải `"dev"`).
- Version query: Network của trang prod thấy `/api/v1/topics?v=` khớp `VITE_CONTENT_VERSION`
  truyền lúc build.
- Cổng kiểm production: trên môi trường deploy thật
  `curl -s -X POST .../api/v1/auth/google -d '{"id_token":"dev:attacker@example.com"}'` phải trả
  401 (`AUTH_DEV_MODE=false`), và `grep AUTH_DEV_MODE` trong manifest deploy không phải `true`.

## Success Criteria

- Không cần CORS khi chạy production same-origin.
- Dev không cần cấu hình gì ngoài `docker compose up`.
- Tài liệu không còn mô tả loader tĩnh như đường chạy chính.
