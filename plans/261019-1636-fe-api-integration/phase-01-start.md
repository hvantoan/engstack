---
title: "Phase 1: API Client & Auth Store"
status: done
priority: P1
effort: 4h
dependencies: []
---

# Phase 1: API Client & Auth Store

## Overview

Tạo một lớp HTTP duy nhất và store auth an toàn với refresh token single-use. Đây là
nền của mọi phase sau: không có single-flight refresh thì hai tab sẽ đăng xuất lẫn nhau
(`token_service.go:65-75` revoke toàn bộ token của user khi replay).

## Requirements

- [ ] Một hàm `request<T>` duy nhất; không thư viện HTTP mới.
- [ ] Access token chỉ trong memory; refresh token trong `localStorage` key `engstack.auth.v1`.
- [ ] Refresh đi qua `navigator.locks.request("engstack:refresh")` và **đọc lại refresh token
      trong lock** trước khi gọi API.
- [ ] Mọi 401 chờ chung một `refreshPromise`, replay request đúng một lần.
- [ ] Tab khác rotate token → tab này adopt qua `storage` event, không gọi API.
- [ ] Refresh fail: xoá `engstack.auth.v1` **chỉ khi** token đang lưu vẫn là token đã gửi; nếu
      khác (tab khác vừa rotate) → adopt token mới, không xoá. Lúc **boot** xoá với mọi lỗi
      (401/5xx/mạng); refresh timer **giữa phiên** chỉ xoá khi 401/token chết — lỗi mạng/5xx giữ
      token và `authenticated`, không đăng xuất user đang học offline.
- [ ] Tab khác logout (storage key bị xoá) → tab này về `guest` ngay, gọi `onSessionLost()` để
      progress store xoá map server; không chờ 401.
- [ ] Refresh chủ động ở 80% `expires_in` (khoảng 12 phút với TTL 15 phút).
- [ ] `auth.status` có ba giá trị: `loading | guest | authenticated`.
- [ ] Không có đường code nào gọi `/auth/refresh` song song.
- [ ] Denylist access token phía server (Redis) **không** thuộc phase này — Follow-up #1 của plan.
- [ ] `bootstrapAuth()` chạy **đúng một lần ở module scope** trong `src/main.tsx`, không trong
      `useEffect` (StrictMode double-invoke sẽ tạo hai refresh → revoke toàn bộ).
- [ ] Tab adopt token qua `storage` event phải chuyển `status = authenticated` **và** phát tín hiệu
      để progress store hydrate; nếu không tab B đứng ở `guest` với token hợp lệ.
- [ ] Refresh/HMR: khi `import.meta.hot` chạy lại module, không khởi động lại refresh timer trùng.

## Files to Create / Modify

- Create: `src/lib/api.ts`
- Create: `src/lib/auth.ts`
- Modify: `index.html` (nạp Google Identity Services bằng `defer`)
- Modify: `src/main.tsx` (gọi `bootstrapAuth()` trước render hoặc render trong `loading`)

## Implementation Steps

1. `src/lib/api.ts`:
   - `const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "/api/v1"`.
   - `class ApiError extends Error { status: number }`, message lấy từ field `error` của backend.
   - `request<T>(path, init)` gắn `Authorization: Bearer` nếu có access token, parse JSON,
     ném `ApiError` khi `!res.ok`.
   - Export `setTokenProvider(fn)` và `setUnauthorizedHandler(fn)` để auth store cắm vào,
     tránh import vòng `api ↔ auth`.
   - Bỏ qua retry cho `/auth/*` để không đệ quy.
2. `src/lib/auth.ts`:
   - State: `{status, user, accessToken, expiresAt}` + `useSyncExternalStore` (`useAuth`).
   - `bootstrapAuth()`: nếu không có refresh token → `guest`; nếu có → `refreshOnce()`; fail →
     compare-and-delete (bước dưới) rồi `guest`.
   - `refreshOnce()`: nếu `refreshPromise` đang bay thì trả nó; nếu không, tạo promise chạy trong
     `navigator.locks.request("engstack:refresh", async () => { const stored = readStored(); if (stored && stored.expiresAt > Date.now() + 1000 && stored.rotatedAt > startedAt) return adopt(stored); ... })`.
   - Lưu `{refreshToken, user, expiresAt, rotatedAt: Date.now()}` sau mỗi lần rotate.
   - Refresh fail: vẫn trong lock, đọc lại storage; `stored.refreshToken !== sentToken` →
     `adopt(stored)` (tab khác đã rotate). Trùng token: boot hoặc 401/token chết → xoá key + clear
     memory + `status = "guest"` + `onSessionLost()`; timer giữa phiên gặp lỗi mạng/5xx → giữ token,
     vẫn `authenticated`, thử lại ở tick sau hoặc khi `online`. Không nhánh nào xoá token mà tab
     khác vừa ghi.
   - `storage` listener: token trong storage khác với token trong memory → adopt, không gọi API,
     rồi gọi `onSessionEstablished()` (hook do progress store đăng ký) để hydrate tiến độ.
     `newValue === null` (logout ở tab khác) → clear memory + `status = "guest"` + `onSessionLost()`.
   - Timer refresh chủ động ở `expiresIn * 0.8`, clear khi logout; guard để HMR không tạo timer thứ hai.
   - `loginWithGoogle(idToken)`: `POST /auth/google` → lưu pair → gọi `onSessionEstablished()`
     (progress store đăng ký) → **chỉ sau khi** promise đó xong mới đặt `status = authenticated`.
     Trong lúc chờ, `status` giữ `loading`; hydrate lỗi thì vẫn `authenticated` và progress trả `ready=false`.
   - `logout()`: chờ `refreshPromise` đang bay, gọi `POST /auth/logout`, xoá storage + memory → `guest`.
3. `src/main.tsx`: gọi `bootstrapAuth()` trước `createRoot(...).render`, nhưng không `await` chặn
   render — render ngay với `status: "loading"` (skeleton). Không được block first paint bằng network.
4. `index.html`: `<script src="https://accounts.google.com/gsi/client" async defer></script>`.
5. Ghi chú `ponytail:` trong `auth.ts`: "single-tab lock via Web Locks; nếu cần hỗ trợ trình duyệt
   không có navigator.locks thì fallback localStorage mutex" — chỉ thêm khi có yêu cầu.

## Verification

- `npm run typecheck` pass.
- Manual: reload khi đã login → không có request `/auth/refresh` nào lặp; DevTools Network thấy
  đúng 1 lần refresh lúc boot.
- Manual: hai tab mở cùng lúc, để access hết hạn (hoặc xoá `expiresAt` trong storage) → cả hai tab
  vẫn authenticated.
- Manual: login tab A, sau đó reload tab B → tab B adopt token, không gọi `/auth/refresh`.
- Manual: DevTools offline khi reload (đang có token) → key `engstack.auth.v1` biến mất, app ở
  `guest`, không crash; online lại + đăng nhập được.
- Manual: hai tab đã login; tab A "Đăng xuất" → tab B về `guest` ngay, không còn hiển thị tiến độ
  của tài khoản cũ.
- SQL: `SELECT count(*) FROM refresh_tokens WHERE revoked_at IS NOT NULL;` chỉ tăng theo số lần
  rotate thực tế, không tăng đột biến khi mở nhiều tab.

## Success Criteria

- Chỉ một đường refresh duy nhất, có lock, có adopt cross-tab.
- `auth.status` phản ánh đúng: không nhảy `authenticated → guest` do race giữa hai tab; chỉ về
  `guest` khi logout, token bị xoá, hoặc refresh fail theo quy tắc compare-and-delete.
- Dev server chạy với `AUTH_DEV_MODE=true` login được bằng token `dev:<email>`.
