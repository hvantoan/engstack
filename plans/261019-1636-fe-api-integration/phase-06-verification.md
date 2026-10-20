---
title: "Phase 6: Verification"
status: todo
priority: P1
effort: 3h
dependencies: [1, 2, 3, 4, 5]
---

# Phase 6: Verification

## Overview

Chứng minh end state bằng quan sát thật, không bằng "typecheck xanh". Repo không có test
framework (`package.json` không có vitest/jest), nên lớp kiểm chứng là: static gates + backend
e2e + ma trận smoke thủ công có lệnh/SQL cụ thể.

## Requirements

- [ ] Static gates pass.
- [ ] Backend e2e vẫn pass nguyên trạng.
- [ ] Ma trận smoke guest / login / reload / hai tab / logout chéo tab / mất mạng / reseed / deploy
      guard được chạy và ghi lại kết quả.
- [ ] Không còn dấu vết loader tĩnh trong runtime.
- [ ] Không có uncaught exception trong console ở mọi trạng thái.

## Files to Create / Modify

- Modify: `plans/261019-1636-fe-api-integration/plan.md` (ghi kết quả verification vào Validation Log)
- Không tạo test file mới trừ khi phát hiện lỗi hồi quy cần khoá lại.

## Implementation Steps

1. Chạy static gates:
   ```bash
   npm run typecheck && npm run build && npm run lint
   ```
2. Chạy backend e2e:
   ```bash
   docker compose up -d --build
   docker compose exec backend /app/bin/seed --data-dir /app/src/data
   bash backend/scripts/test-e2e.sh
   ```
3. Ma trận smoke (ghi kết quả từng dòng vào bảng dưới):
   - Guest: học 3 từ → reload → còn 3; header hiển thị 3.
   - Login: header đổi, key `engstack.learned.v2` biến mất, số khớp `GET /progress`.
   - Union: guest có 1 item trùng server + 1 item mới → login → cả hai có mặt.
   - Reload đã login: không thấy "Đã thuộc: 0 từ"; Network đúng 1 `/auth/refresh` và 1 `/progress`.
   - Hai tab: hết hạn access → cả hai còn đăng nhập; `refresh_tokens` không có revoked ngoài dự kiến.
   - Toggle ở tab A → reload tab B → thấy thay đổi.
   - Logout: về guest, tiến độ hiển thị 0 (đúng, vì guest state đã xoá lúc login).
   - API down (`docker compose stop backend`): home/topic hiện error + "Thử lại"; bật lại → hoạt động.
   - Deep-link `/topic/oxford-b2`: đúng 2 request nội dung (summaries + detail), related topics render.
   - 404: `/topic/khong-ton-tai`.
   - v1: đặt tay key legacy → reload → migrate xong, key biến mất.
   - Logout chéo tab: tab A logout → tab B về guest trong <1s, số đã thuộc không còn của tài khoản cũ.
   - Reseed + bump `VITE_CONTENT_VERSION` + rebuild/deploy: `/topics?v=` đổi, `itemCount` mới hiện ngay.
   - Refresh fail: DevTools offline khi reload (có token) → key `engstack.auth.v1` biến mất, app guest.
   - Deploy guard: `VITE_GOOGLE_CLIENT_ID= make deploy` fail trước `docker build`.
   - Hydration retry: block `/progress` lúc boot → số `—`; bỏ block + focus tab → số đúng hiện,
     không cần reload.
4. Kiểm tra artifact: `grep -rnE "(from|import\\()\\s*[\"'][^\"']*data/" src/` = 0;
   `grep -rn "import.meta.glob" src/` = 0; `grep -rn "useTopics" src/` = 0; bundle không còn dữ liệu
   vocab — kiểm bằng kích thước chunk: `ls -S dist/assets/*.js | head -3` và xác nhận chunk lớn nhất
   < 400 KB (trước migration bundle chứa ~750 KB gzip dữ liệu nên chênh lệch thấy rõ).
5. Cập nhật Validation Log trong `plan.md` với kết quả thật (pass/fail + output ngắn).

## Verification

- `npm run typecheck && npm run build && npm run lint` → exit 0.
- `bash backend/scripts/test-e2e.sh` → exit 0.
- Ma trận smoke: 17/17 dòng có kết quả quan sát được.

| # | Kịch bản | Kết quả mong đợi | Quan sát |
|---|----------|------------------|----------|
| 1 | Guest học 3 từ, reload | còn 3 | |
| 2 | Login | key local biến mất, số khớp API | |
| 3 | Union | trùng + mới đều có | |
| 4 | Reload đã login | không flash 0, 1 refresh | |
| 5 | Hai tab hết hạn | không đăng xuất | |
| 6 | Toggle chéo tab | thấy sau reload | |
| 7 | Logout | về guest | |
| 8 | API down | error + retry | |
| 9 | Deep-link oxford-b2 | 2 request (summaries + detail), khối "Chủ đề liên quan" render | |
| 10 | 404 topic | trạng thái 404 | |
| 11 | v1 migration | key biến mất | |
| 12 | Seed lại + reload topic | nội dung mới hiện ngay, không chờ `max-age` | |
| 13 | Logout chéo tab | tab B về guest, không còn số của tài khoản cũ | |
| 14 | Reseed + bump `VITE_CONTENT_VERSION` + rebuild/deploy | `/topics?v=` mới, `itemCount`/`related` cập nhật | |
| 15 | Refresh fail (offline khi reload) | `engstack.auth.v1` bị xoá, về guest, không crash | |
| 16 | `VITE_GOOGLE_CLIENT_ID= make deploy` | fail trước `docker build` | |
| 17 | Block `/progress` lúc boot | số `—`; bỏ block + focus tab → số đúng hiện, không cần reload | |

## Success Criteria

- Mọi dòng trong bảng có kết quả thật, không phải "[dự kiến]".
- Không có mục nào fail mà không có quyết định rõ (fix hoặc ghi nhận trade-off).
