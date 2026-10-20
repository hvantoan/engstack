---
title: "Phase 2: Progress Store"
status: todo
priority: P1
effort: 5h
dependencies: [1]
---

# Phase 2: Progress Store

## Overview

Thay ruột `src/lib/progress.ts` để tiến độ có hai nguồn nhưng một API công khai: guest đọc/ghi
`localStorage`, đã login đọc/ghi server. Giữ nguyên chữ ký export để `home.tsx`, `topic.tsx`,
`site-header.tsx` không phải sửa. Riêng `learn-mode.tsx` phải bỏ snapshot `useState`.

## Requirements

- [ ] Giữ nguyên chữ ký `useLearned`, `useTotalLearned`, `getLearned`, `toggleLearned`.
- [ ] Guest state chỉ ghi vào `engstack.learned.v2`; **không bao giờ** ghi server progress vào localStorage.
- [ ] Login: `POST /progress/import-guest` (union) → `GET /progress` → xoá key local.
- [ ] Thứ tự bắt buộc: migrate v1 → guest v2 → import-guest.
- [ ] v1 migration chỉ chạy khi `engstack.learned.v1` tồn tại, và khi đó mới fetch toàn bộ detail.
- [ ] Toggle optimistic + rollback khi API lỗi; UI nhận cả hai chiều.
- [ ] `auth.status === "loading"` → store trả state rỗng **nhưng** export `useProgressReady(): boolean`
      để page không hiển thị `0`; `useLearned` giữ nguyên chữ ký (trả Set rỗng khi chưa ready).
- [ ] `sessionRestore()` là điểm vào duy nhất, thứ tự tuần tự: import-guest → `GET /progress` →
      xoá local → `ready = true`. Không được để `hydrateFromServer` chạy song song với import.
- [ ] `bootstrapAuth()`/adopt tab khác đều kết thúc bằng `sessionRestore()` trước khi UI thấy số thật.
- [ ] Progress store đăng ký `onSessionEstablished()` và gọi `sessionRestore()`; auth store không tự
      gọi import/hydrate (tránh import vòng `auth ↔ progress`).
- [ ] Đăng ký `onSessionLost()`: xoá map server ngay (logout tab khác / refresh fail) và render theo
      tiến độ guest; không để số của tài khoản cũ hiện trên UI guest.
- [ ] `sessionRestore()` reset promise khi reject (không poison lần thử sau); gắn listener
      `online`/`visibilitychange` gọi lại khi `!ready` — mất mạng lúc boot thì số tự phục hồi,
      không đứng `—` vĩnh viễn.

## Files to Create / Modify

- Modify: `src/lib/progress.ts`
- Modify: `src/components/modes/learn-mode.tsx` (bỏ `useState(getLearned(...))`, dùng `useLearned`)
- Modify: `src/components/site-header.tsx` (chỉ để đọc `ready` nếu cần skeleton — logic chính ở phase 4)

## Implementation Steps

1. Tách state nội bộ: `guest: Map<string, Set<string>>` (từ storage) và `server: Map<string, Set<string>>`
   (từ API). `active()` chọn theo `auth.status`; `loading` → rỗng + `ready=false`.
   `clearServerProgress()` xoá map server + phát event, dùng cho `onSessionLost()` và logout.
2. `toggleLearned(topicId, itemId): boolean` giữ đồng bộ:
   - guest → sửa map + `write()` như hiện tại, trả `learned` mới.
   - authenticated → sửa map server ngay (optimistic), phát event, rồi `PUT /progress/toggle`;
     lỗi → hoàn tác đúng item đó, phát event, log một dòng.
3. `hydrateFromServer()`: `GET /progress` trả `Record<topicId, itemId[]>` (`handler/progress.go:44-55`);
   thay toàn bộ map server. Chỉ được gọi từ `sessionRestore()`, không gọi trực tiếp khi
   `status` đổi — tránh race import-vs-hydrate.
4. `sessionRestore()` (idempotent, một promise dùng chung):
   a. `runV1Migration()` nếu có key legacy;
   b. gom toàn bộ itemId guest;
   c. `POST /progress/import-guest` với `{ itemIds }` (chỉ field này — DTO `ImportGuestProgressRequest`);
   d. **sau khi 200** mới `localStorage.removeItem("engstack.learned.v2")` và reset map guest;
   e. `GET /progress` → thay map server;
   f. `ready = true`, phát `engstack:progress`.
   g. reject → reset shared promise + `ready = false`; listener `online`/`visibilitychange` gọi lại
      `sessionRestore()` khi `!ready`.
5. `runV1Migration()`: nếu `engstack.learned.v1` tồn tại → `GET /topics` một lần, chỉ `GET
   /topics/{id}` cho các topicId **có trong legacy map** (thường 1-3, không phải cả 20) →
   `migrateLearnedToItemIds(details)` → chỉ xoá key v1 khi mọi topicId legacy đều resolve được
   (giữ nguyên guard `progress.ts:39-45`; 404/lỗi mạng thì bỏ qua lần này, không mất progress).
   Đổi tham số `migrateLearnedToItemIds` từ `Topic[]` sang `{ id: string; items: { id: string; term: string }[] }[]`
   để không phụ thuộc type `Topic` đã bị thu hẹp.
6. `subscribe`: một event `engstack:progress` cho cả hai nguồn; thêm listener `storage` như hiện tại.
7. `learn-mode.tsx`: thay
   `const [learned, setLearned] = useState<Set<string>>(() => getLearned(topic.id))`
   bằng `const learned = useLearned(topic.id)`; `markLearned` chỉ gọi `toggleLearned` và để store
   phát event, bỏ `setLearned` cục bộ.

## Verification

- `npm run typecheck` pass.
- Manual guest: học 3 từ → reload → vẫn 3; `localStorage["engstack.learned.v2"]` có 3 id.
- Manual login: sau khi login, key `engstack.learned.v2` không còn; số "Đã thuộc" khớp
  `SELECT count(*) FROM user_progress WHERE user_id = ... AND is_learned`.
- Manual rollback: chặn `/progress/toggle` trong DevTools (block request) → toggle nhảy lại trạng thái cũ.
- Manual hydration: reload khi đã login → learn-mode hiển thị đúng tập đã học ngay sau hydrate,
  không cần chuyển tab.
- Manual logout chéo tab: tab B đang authenticated → tab A logout → tab B về guest, số đã thuộc
  không còn của tài khoản cũ (map server đã clear).
- Manual hydrate retry: block `/progress` trong DevTools lúc reload → số hiển thị `—`; bỏ block +
  focus tab → số đúng hiện, không cần reload; promise reject không chặn lần thử sau.
- SQL union: tạo guest 2 item (một item đã có trên server, một item mới) → login → server có
  đúng 2 item, không mất item cũ.
- v1: đặt tay `engstack.learned.v1` với vài term → reload → key v1 biến mất, progress được map sang id.

## Success Criteria

- Một store duy nhất, hai nguồn, không có UI nào đọc `localStorage` trực tiếp ngoài store.
- Không tồn tại frame nào hiển thị 0 từ trong lúc hydrate.
- Union đúng, local bị xoá chỉ sau khi import thành công.
