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
make release       # kiểm tra toàn diện và build production ra dist/
make preview       # xem trước bản build production
make deploy        # release + image + recreate container: cập nhật site đang chạy
make docker-build  # đóng gói Docker image Nginx
```

Hoặc bằng `npm`:

```bash
npm install
npm run dev        # dev server
npm run build      # production build -> dist/
npm run preview    # xem bản build
npm run typecheck  # tsc --noEmit
npm run lint       # eslint
```

## Backend API (Go + PostgreSQL)

Thư mục `backend/` chứa REST API Go (Chi, pgx/v5, sqlc) phục vụ dữ liệu chủ đề/từ vựng,
Google OAuth và đồng bộ tiến độ học.

```bash
docker compose up -d --build                 # Postgres 16 (host port 5433) + API (8080)
docker compose exec backend /app/bin/seed --data-dir /app/src/data
bash backend/scripts/test-e2e.sh             # smoke test 9 bước
cd backend && go test -race ./...            # unit + integration
```

Dev mode: đặt `AUTH_DEV_MODE=true` để đăng nhập bằng token `dev:<email>` thay vì Google thật
(xem `backend/.env.example`). Chi tiết endpoint nằm trong `plans/261019-0938-backend-api/plan.md`.

## Cấu trúc

- `src/data/topics.json` — dữ liệu 20 chủ đề, mỗi chủ đề 200 mục từ.
- `src/lib/vocab.ts` — kiểu dữ liệu, truy cập topic, nhãn, accent color.
- `src/lib/progress.ts` — tiến độ "đã thuộc" trong `localStorage`
  (`engstack.learned.v1`).
- `src/pages/` — trang chủ và trang chủ đề.
- `src/components/modes/` — 4 chế độ luyện tập (Học thẻ, Trắc nghiệm,
  Viết lại, Nối từ) + danh sách từ có tìm kiếm.
- `design-system/` — hệ thiết kế (MASTER.md là source of truth).
- `backend/` — API Go/Chi/PostgreSQL (xem `backend/Makefile`).
- `plans/` — plan, research và journal; `plans/reports/` cho báo cáo của agent.

## Mục tiêu đơn giản trước

Bản hiện tại giữ nguyên: brand, ngôn ngữ tiếng Việt, 20 chủ đề, 4 chế độ
luyện tập, tiến độ học cục bộ. Backend Go đã có (dữ liệu, OAuth, đồng bộ tiến
độ); việc nối frontend với API và spaced repetition vẫn còn ở phía trước.
