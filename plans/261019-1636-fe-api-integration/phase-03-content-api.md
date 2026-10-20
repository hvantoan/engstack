---
title: "Phase 3: Content API"
status: done
priority: P1
effort: 4h
dependencies: [1]
---

# Phase 3: Content API

## Overview

Thay loader tĩnh bằng hai hook đọc API: danh sách summary cho home, detail cho topic page.
Đây là nơi duy nhất API shape khác FE type hiện tại: `orderIndex`/`itemCount` thay cho
`order`/`items.length`.

## Requirements

- [ ] `useTopicSummaries()` dùng `GET /topics`, trả `TopicSummary[]` đã sort theo `orderIndex`.
- [ ] `useTopic(id)` dùng `GET /topics/{id}`, có `AbortController`, trả `TopicDetail | null`.
- [ ] Topic page dùng **cả hai** hook: `useTopic(id)` cho nội dung, `useTopicSummaries()` để render
      khối "Chủ đề liên quan" (`src/pages/topic.tsx:111,273-279` lọc `topic.related` trên danh sách
      đầy đủ — bỏ summaries là khối này biến mất).
- [ ] Không cast summary thành `Topic`; type riêng cho summary và detail.
- [ ] Home dùng `itemCount`; topic page không còn `useTopics().find(...)`.
- [ ] Normalize `pos`: DTO trả `string[]`, FE type là `PartOfSpeech[]` — lọc theo `PARTS_OF_SPEECH`
      khi map, không `as` mù.
- [ ] `src/lib/vocab.ts` vẫn re-export `type Topic` (consumer: `learn-mode.tsx:17`,
      `word-list.tsx:7`, `home.tsx:20`) và giữ `labelText` (`learn-mode.tsx:218`, `word-list.tsx:47`).
- [ ] Request detail dùng `cache: "no-cache"` để revalidate qua `ETag`; server đang set
      `max-age=86400` (`backend/internal/handler/respond.go:28,41`) nên nếu không, nội dung seed lại
      có thể cũ tới 24 giờ.
- [ ] `useTopicSummaries()` gọi `/topics?v=${CONTENT_VERSION}` với
      `CONTENT_VERSION = import.meta.env.VITE_CONTENT_VERSION ?? "dev"`; bump biến này mỗi lần seed
      đổi dữ liệu (URL đổi → browser lấy bản mới, không chờ `max-age`). Prod cần rebuild/deploy —
      Vite inline biến lúc build.
- [ ] Skeleton khi đang tải; error + nút "Thử lại" khi lỗi; topic không tồn tại → 404 state.
- [ ] Home (`TopicProgress`, `home.tsx:25`) và topic (`topic.tsx:63`) chỉ hiển thị số đã thuộc khi
      `useProgressReady()`; trong lúc hydrate render `—`/`aria-busy` thay vì `0`.
- [ ] Xoá `import.meta.glob`, `moduleLoaders`, `moduleIds`, `toTopic`, `loadTopics`, `useTopics`
      khỏi runtime; `vocab-schema.ts` giữ lại cho `scripts/`.

## Files to Create / Modify

- Create: `src/lib/content.ts` (types + hooks)
- Modify: `src/lib/vocab.ts` (chỉ còn nhãn/màu UI: `labelText`, `TRACK_*`, `ACCENT_*`)
- Modify: `src/pages/home.tsx` (`useTopicSummaries`, `topic.itemCount`, skeleton/error)
- Modify: `src/pages/topic.tsx` (`useTopic(topicId)`, skeleton/error/404, `topic.items` vẫn hợp lệ)
- Không đổi: `src/lib/vocab-schema.ts` (vẫn được `scripts/data-check.ts:16` dùng)

## Implementation Steps

1. `src/lib/content.ts`:
   - `type TopicSummary = { id, track, title, description, eyebrow, accent, level?, orderIndex, related, itemCount }`.
   - `type TopicDetail = TopicSummary & { items: ModuleItem[] }` với `ModuleItem` import từ `vocab-schema`.
   - `useTopicSummaries()`: `useEffect` + `AbortController`;
     `request<TopicSummary[]>(`/topics?v=${encodeURIComponent(CONTENT_VERSION)}`)`;
     sort `(a.orderIndex - b.orderIndex) || a.id.localeCompare(b.id)`.
   - `useTopic(id)`: reset state khi `id` đổi; `request<TopicDetail>(`/topics/${encodeURIComponent(id)}`)`;
     `ApiError.status === 404` → `notFound`.
   - Trả `{ data, error, loading, retry }` cho cả hai để page render thống nhất.
2. `home.tsx`: đổi `topic.items.length` → `topic.itemCount` (dòng 59, 77); `topics` có thể `[]`
   khi lỗi; render error card + nút retry trước grid.
3. `topic.tsx`: bỏ `const topics = useTopics()` + `.find`; dùng `const { data: topic, ... } = useTopic(topicId)`;
   thêm `const summaries = useTopicSummaries()` cho `relatedTopics` (dòng 111); giữ `useLearned(topicId ?? "")`;
   thêm nhánh 404.
4. `vocab.ts`: xoá toàn bộ phần loader; giữ `ACCENT_CLASS`, `ACCENT_BG`, `TRACK_LABEL`,
   `TRACK_DESCRIPTION`, `labelText`; **giữ re-export** `type Topic` và các type khác đang được
   `learn-mode.tsx`, `word-list.tsx`, `home.tsx` import.
5. Error message tiếng Việt, không lộ chi tiết kỹ thuật: "Không tải được nội dung. Kiểm tra kết nối
   và thử lại." với icon `lucide-react` (`RefreshCwIcon`).

## Verification

- `npm run typecheck && npm run build` pass.
- `grep -rnE "(from|import\\()\\s*[\"'][^\"']*data/" src/` → 0 kết quả (grep thô `src/data` sẽ
  khớp comment ở `src/lib/vocab-schema.ts:64`, nên phải nhắm import thật).
- `grep -rn "import.meta.glob" src/` → 0 kết quả.
- `grep -rn "useTopics" src/` → 0 kết quả.
- Manual: mở `/topic/oxford-b2` trực tiếp → Network có đúng 2 request (`/topics`, `/topics/oxford-b2`),
  không tải 19 module detail còn lại; khối "Chủ đề liên quan" vẫn render.
- Manual: sửa một `meaning` trong DB (hoặc seed lại) → reload topic thấy nội dung mới ngay
  (nhờ `cache: "no-cache"` + `ETag`), không phải chờ hết `max-age`.
- Manual: reseed + đổi `VITE_CONTENT_VERSION` → request `/topics?v=` đổi, `itemCount`/`related`
  mới hiện ngay trên home.
- Manual: `docker compose stop backend` → home và topic hiện error + "Thử lại"; bật lại → retry thành công.
- Manual: `/topic/khong-ton-tai` → trạng thái 404, không crash.

## Success Criteria

- Không còn dữ liệu từ vựng trong bundle build.
- Hai trang không còn phụ thuộc `useTopics`.
- Mọi trạng thái (loading/error/empty/404) có UI thật, không phải text tạm.
