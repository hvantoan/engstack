# Journal — FE ↔ Go API integration (implemented)

- Date: 2026-10-20
- Plan: `plans/261019-1636-fe-api-integration/plan.md` (6 phases, all Done)
- Branch: `feat/backend-api`

## Việc đã làm

Nối frontend vào REST API Go đã có: auth Google (dev fallback), tiến độ theo tài khoản, nội dung
đọc từ API, deploy same-origin.

**File mới**

- `src/lib/api.ts` — `request<T>`, `ApiError`, token provider + 401 handler cắm từ auth store.
- `src/lib/auth.ts` — auth store: access token trong memory, refresh token ở `engstack.auth.v1`,
  refresh single-flight qua `navigator.locks("engstack:refresh")`, compare-and-delete, storage
  listener cho adopt/logout chéo tab, timer refresh 80% TTL.
- `src/lib/content.ts` — `useTopicSummaries()` / `useTopic(id)`, normalize DTO (`orderIndex`,
  `itemCount`, `pos` string[] → `PartOfSpeech[]`), error/404/retry state.
- `src/components/google-login-button.tsx` — GIS `renderButton`, nút "Đăng nhập (dev)" khi không có
  client ID ở dev.

**File sửa**

- `src/lib/progress.ts` — hai nguồn (guest localStorage / server), `sessionRestore()` tuần tự
  (v1 → import-guest → `GET /progress`), `useProgressReady()`, rollback optimistic, retry
  `online`/`visibilitychange`.
- `src/lib/vocab.ts` — bỏ loader `import.meta.glob`, chỉ còn nhãn/màu UI + type re-export.
- `src/pages/home.tsx`, `src/pages/topic.tsx` — dùng hook content, skeleton/error/404, `itemCount`,
  số đã thuộc chỉ hiện khi ready (`—` thay vì 0 giả).
- `src/components/site-header.tsx` — 3 trạng thái auth, avatar/tên/Đăng xuất.
- `src/components/modes/learn-mode.tsx` — bỏ snapshot `useState(getLearned(...))`, dùng `useLearned`.
- `src/main.tsx` — `bootstrapAuth()` một lần ở module scope (StrictMode an toàn).
- `index.html` — script GIS defer.
- `vite.config.ts`, `nginx.conf`, `Dockerfile`, `Makefile`, `.env.example` — proxy `/api`,
  build args Vite, network của container web, health check `/api/v1/health`, fail-fast client ID.
- `README.md`, `docs/data-model.md` — API là runtime, `src/data` chỉ còn là seed.

## Quyết định đáng nhớ

- **Single đường refresh**: mọi 401 và timer đi qua một promise + Web Lock; trong lock luôn đọc lại
  storage để adopt token tab khác vừa rotate (refresh token của backend là single-use).
- **Adopt cross-tab cần một lần refresh** vì access token chỉ nằm trong memory. Đây là chỗ plan nói
  "không gọi API"; thực tế phải refresh một lần (trong lock) để hydrate. Đã ghi vào plan.
- **Guest cũng migrate v1** (plan chỉ đặt migration trong `sessionRestore` của login) — nếu không,
  kịch bản "đặt tay key v1 rồi reload" không bao giờ migrate.
- **`useProgressReady()`**: guest ready ngay; chỉ session login mới chờ hydrate xong.
- **Bundle 399.69 kB** — dưới ngưỡng 400 kB nhưng gần như không còn dư địa.

## Kiểm chứng

- `npm run typecheck`, `npm run build`, `npm run lint` pass; `backend/scripts/test-e2e.sh` 20/20.
- Smoke matrix 17 dòng chạy thật bằng CDP headless Chrome (script harness ở `/tmp`, không commit):
  guest/reload, union khi login, reload đúng 1 refresh, block `/progress` → `—` rồi tự phục hồi,
  logout chéo tab, 404, API down + retry, ETag revalidation sau khi sửa DB, v1 migration,
  hai tab reload đồng thời không đăng xuất, `make deploy` fail-fast, prod image same-origin.
- Kết quả chi tiết: `plans/261019-1636-fe-api-integration/plan.md` → Validation Log Session 4.

## Bài học hạ tầng test

- `chrome-headless-shell` **detach CDP session** khi mở tab thứ hai → matrix một tab dùng headless
  shell, matrix hai tab dùng Chrome for Testing.
- Chạy `npm run dev` trong `.pi/tasks/*.output` gây **vòng lặp full-reload** của Vite: mỗi dòng log
  là một file change trong project → reload → log mới. Phải redirect log ra ngoài project.
- Chrome request `/favicon.ico` (không có trong `public/`) → 404 noise trong log, vô hại.

## Còn lại

1. Follow-up #1 của plan: denylist access token (Redis) phía Go — plan riêng, cần `sid` chung cho
   cặp access+refresh.
2. Google login thật chưa verify end-to-end (chỉ có `AUTH_DEV_MODE`); cần client ID thật.
3. Nếu cần dư địa bundle: lazy-load `MatchMode`/`QuizMode`.
4. `.pi/` (log task của harness) đang untracked — cân nhắc thêm vào `.gitignore`.
