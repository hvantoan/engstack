# engstack — IELTS Vocabulary

Website học từ vựng IELTS theo chủ đề: 20 chủ đề × 200 mục từ (4.000 mục từ)
kèm phiên âm IPA, nghĩa tiếng Việt và ví dụ thật. Trình độ mục tiêu B2–C1.

## Stack

- **Vite 8** + React 19 + TypeScript
- **Tailwind CSS v4** + **shadcn/ui** (preset `base-nova`, Base UI primitives)
- React Router DOM, localStorage cho tiến độ học
- Font brand: Alexandria + CalSans (self-host tại `public/fonts/`)

## Chạy dự án & Release

Sử dụng `make` (khuyến nghị):

```bash
make help          # xem danh sách lệnh
make dev           # khởi động Vite dev server
make check         # kiểm tra TypeScript + ESLint
make release       # kiểm tra toàn diện và build production ra frontend/dist/
make preview       # xem trước bản build production
make selfhost      # dựng full stack local (Postgres + API + web + seed)
make selfhost-logs # xem log toàn bộ stack
```

Hoặc bằng `npm` (từ thư mục `frontend/`):

```bash
cd frontend
npm install
npm run dev        # dev server
npm run build      # production build -> dist/
npm run preview    # xem bản build
npm run typecheck  # tsc --noEmit
npm run lint       # eslint
```

## Backend API (Go + PostgreSQL)

Thư mục `backend/` chứa REST API Go (Chi, pgx/v5, sqlc) phục vụ dữ liệu chủ đề/từ vựng,
Google OAuth và đồng bộ tiến độ học. Frontend gọi API **same-origin** qua `/api/v1`:
Vite dev proxy `/api` → `localhost:5198`, nginx proxy `/api/` → `api:5198`. Không cần cấu hình
CORS trên trình duyệt.

```bash
make selfhost                                # Postgres (5433) + API (5198) + web (5199), tự migrate + seed
make selfhost-logs                             # xem log toàn bộ stack
make seed                                    # nạp lại dữ liệu từ data (upsert)
bash backend/scripts/test-e2e.sh             # smoke test 9 bước khi API đang chạy
cd backend && go test -race ./...            # unit + integration
```

Image API là `scratch` nên healthcheck dùng chính binary: `/app/bin/api -healthcheck`.
Đăng nhập mặc định là Google OAuth thật (`AUTH_DEV_MODE=false`, client ID trong `.env`);
đặt `AUTH_DEV_MODE=true` để dùng token giả `dev:<email>` khi thử API. Chi tiết endpoint nằm
trong `plans/261019-0938-backend-api/plan.md`.

### Self-host tại local

`make selfhost` là lệnh duy nhất để dựng/cập nhật toàn bộ app. Cấu hình qua `.env`
(`WEB_PORT`, `POSTGRES_PASSWORD`, `JWT_SECRET`, `AUTH_DEV_MODE`, `VITE_GOOGLE_CLIENT_ID`).
Runbook đầy đủ — Google OAuth authorized origins, backup/restore, troubleshooting —
ở [`docs/selfhost.md`](docs/selfhost.md).

Cấu hình này dành cho local: trước khi mở ra mạng thật, đổi `JWT_SECRET`, giữ
`AUTH_DEV_MODE=false`, và đặt reverse proxy TLS phía trước.

## Cấu trúc

- `data/**/*.json` — seed dữ liệu 20 chủ đề và Oxford 3000; runtime KHÔNG đọc trực tiếp, backend seed từ đây.
- `frontend/src/lib/api.ts` — lớp HTTP duy nhất (`request<T>`, `ApiError`).
- `frontend/src/lib/auth.ts` — auth store: access token trong memory, refresh token trong
  `localStorage` (`engstack.auth.v1`), refresh single-flight qua Web Locks.
- `frontend/src/lib/content.ts` — hook `useTopicSummaries` / `useTopic` đọc API.
- `frontend/src/lib/progress.ts` — tiến độ "đã thuộc": guest trong `localStorage`
  (`engstack.learned.v2`), đã login thì đồng bộ server.
- `frontend/src/pages/` — trang chủ và trang chủ đề.
- `frontend/src/components/modes/` — 4 chế độ luyện tập (Học thẻ, Trắc nghiệm,
  Viết lại, Nối từ) + danh sách từ có tìm kiếm.
- `infras/` — cấu hình self-host Docker Compose toàn bộ hệ thống.
- `backend/` — API Go/Chi/PostgreSQL (xem `backend/Makefile`).
- `design-system/` — hệ thiết kế (MASTER.md là source of truth).
- `plans/` — plan, research và journal; `plans/reports/` cho báo cáo của agent.

## Mục tiêu đơn giản trước

Bản hiện tại giữ nguyên: brand, ngôn ngữ tiếng Việt, 20 chủ đề, 4 chế độ
luyện tập. Frontend đọc nội dung từ API Go, guest học ngay không cần đăng nhập,
tiến độ theo tài khoản khi đã login. Spaced repetition vẫn còn ở phía trước.
