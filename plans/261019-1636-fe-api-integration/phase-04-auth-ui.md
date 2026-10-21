---
title: "Phase 4: Auth UI"
status: done
priority: P1
effort: 3h
dependencies: [1, 2]
---

# Phase 4: Auth UI

## Overview

Đưa auth ra giao diện: nút đăng nhập Google ở header khi guest, avatar + tên + "Đăng xuất" khi
đã login, skeleton trong lúc `loading`. Đây là nơi chặn hiển thị sai "Đã thuộc: 0 từ".

## Requirements

- [ ] Guest: nút "Đăng nhập Google" trong `site-header.tsx`, dùng GIS `renderButton`.
- [ ] `loading`: số "Đã thuộc" render `—`, không phải `0`; nút login disabled.
- [ ] Authenticated: avatar (`AvatarURL` nếu có, fallback chữ cái đầu) + tên + "Đăng xuất".
- [ ] Logout: gọi `logout()`, xoá token, về guest; không reload trang.
- [ ] Design system: token semantic, icon `lucide-react`, không emoji, hover/focus 150–200ms.
- [ ] Không thêm package; không tự vẽ form login.

## Files to Create / Modify

- Create: `src/components/google-login-button.tsx`
- Modify: `src/components/site-header.tsx`
- Modify: `src/components/ui/` chỉ khi thiếu primitive (ưu tiên tái dùng `Button`)

## Implementation Steps

1. `google-login-button.tsx`:
   - Đọc `import.meta.env.VITE_GOOGLE_CLIENT_ID`; nếu rỗng và `import.meta.env.DEV` → hiện nút
     "Đăng nhập (dev)" gọi `loginWithGoogle("dev:dev@example.com")` để test không cần Google.
   - Dùng `window.google.accounts.id.initialize({ client_id, callback })` + `renderButton` vào ref;
     chờ script sẵn sàng bằng polling `setTimeout` (tối đa ~5 lần) hoặc sự kiện load.
   - `callback` → `loginWithGoogle(response.credential)`.
2. `site-header.tsx`:
   - `const { status, user } = useAuth()`; `const learned = useTotalLearned()`; `const ready = useProgressReady()`.
   - `status === "loading" || !ready` → `<span className="text-muted-foreground">—</span>`.
   - `status === "guest"` → `GoogleLoginButton`.
   - `status === "authenticated"` → avatar + tên (ẩn trên mobile nếu chật) + `Button variant="ghost"` "Đăng xuất".
3. Giữ nguyên testid/aria hiện có; thêm `aria-label` tiếng Việt cho nút.
4. Kiểm tra zero CLS: header cao 14 (h-14) như hiện tại, các trạng thái không đổi kích thước.

## Verification

- `npm run typecheck && npm run lint` pass.
- Manual (dev mode): bấm "Đăng nhập (dev)" → header đổi sang avatar, số đã thuộc khớp server.
- Manual: reload → trong lúc boot thấy `—`, sau đó số thật; không thấy `0`.
- Manual: "Đăng xuất" → header về guest, key `engstack.auth.v1` biến mất, không reload trang.
- Manual: dựng Docker + `GOOGLE_CLIENT_ID` thật → nút GIS hiển thị, login được.

## Success Criteria

- Ba trạng thái header rõ ràng, không layout shift.
- Không có giá trị 0 giả trong lúc hydrate.
- Logout sạch token và state.
