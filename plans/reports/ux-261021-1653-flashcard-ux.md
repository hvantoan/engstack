# UX Enhance — Flashcard học trên `/topic/*`

Date: 2026-10-21 · Branch: beta · Scope: `frontend/src/components/modes/learn-mode.tsx`, `frontend/src/pages/topic.tsx`, `frontend/src/index.css`

## Outcome

Đã implement 3 cải tiến UX được yêu cầu cho chế độ "Học thẻ" (flashcard) trên trang chủ đề. `make typecheck`, `make lint`, `make build` đều pass.

## Thay đổi

### 1. Resume session học theo chủ đề (Must)
- **Trước:** quay lại một topic luôn bắt đầu từ thẻ 1, mất thứ tự đã xáo và bộ lọc đang dùng.
- **Sau:** `LearnMode` lưu `{index, orderIds, unlearnedOnly}` vào `localStorage` theo khoá `engstack.learn-session.v1:<topicId>` mỗi khi đổi thẻ/xáo/lọc, và khôi phục khi mount.
- Order lưu theo **item id** (không phải index), nên vẫn đúng khi danh sách `learned` hydrate chậm (guest→auth) hoặc khi bật filter "chưa thuộc" — order tự lọc id không còn trong `items`, index được clamp, không reset về 0.
- Evidence: `learn-mode.tsx` state init + `useEffect` persist (khoảng dòng 59–136).

### 2. Focus mode fullpage (Must)
- **Trước:** toggle "Chế độ tập trung" chỉ thu gọn header của trang topic; site header/footer vẫn chiếm viewport.
- **Sau:** khi `focusMode === true` và tab `learn` đang active, `TopicPage` gắn class `focus-fullpage` lên `<body>`; CSS trong `index.css` ẩn `<header>` + `<footer>` của site → flashcard chiếm gần trọn viewport. Rời tab hoặc tắt focus mode thì chrome hiện lại (cleanup trong `useEffect`).

### 3. Cấu hình tự động phát âm (Should)
- Nhóm toggle "Tự động đọc" trên thanh filter của flashcard: **Từ mới** (`StepForwardIcon`) phát âm khi chuyển sang thẻ mới; **Lật thẻ** (`RefreshCwIcon`) phát âm khi đổi mặt thẻ.
- Cấu hình persist tại `engstack.autoplay.v1` (áp dụng chung mọi topic), mặc định tắt — tôn trọng autoplay-policy (chỉ kích hoạt sau tương tác người dùng).
- Nút có `aria-pressed`, `title` tooltip, `cursor-pointer`; dùng semantic tokens, không hardcode màu.

### Phụ
- Thanh filter top-bar đổi sang `flex-wrap gap-2` để nhóm toggle mới không tràn trên mobile.

## Files touched

- `frontend/src/components/modes/learn-mode.tsx` — session persistence, autoplay config + UI, order theo item id.
- `frontend/src/pages/topic.tsx` — effect gắn/gỡ `body.focus-fullpage`.
- `frontend/src/index.css` — rule ẩn header/footer khi `focus-fullpage`.

## Acceptance checks

- [x] `make typecheck` / `make lint` / `make build` pass.
- [ ] Tay: học đến thẻ N → rời topic → quay lại → đứng ở thẻ N với cùng order/filter.
- [ ] Tay: bật "Chế độ tập trung" ở tab Học thẻ → site header/footer biến mất; đổi tab hoặc tắt focus → hiện lại.
- [ ] Tay: bật "Từ mới" → chuyển thẻ phát âm tự động; bật "Lật thẻ" → lật thẻ phát âm; reload trang vẫn giữ cấu hình.

## Unresolved questions

- `engstack.focus_mode` mặc định `true` → lần đầu vào tab Học thẻ site header/footer đã bị ẩn luôn (fullpage mặc định). Nếu muốn giữ chrome cho người mới, đổi default ở `topic.tsx` sang `false`.
- Autoplay "Lật thẻ" hiện đọc `term` ở cả hai chiều lật; nếu muốn mặt sau đọc example/câu ví dụ thay vì term thì cần confirm.
