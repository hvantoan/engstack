# Release readiness — engstack

Checklist tối thiểu trước khi phát hành một thay đổi ảnh hưởng nội dung, auth hoặc progress.

## Trước merge

- [ ] `make check-data` pass: không duplicate `id`, alias sai format hoặc alias trùng ID hiện tại.
- [ ] `make typecheck`, `make lint`, `make build` pass.
- [ ] `go test ./...` trong `backend/` pass hoặc phần DB skip rõ vì thiếu Postgres test.
- [ ] Migration mới có file up/down và được `store.Migrate` nhận đúng thứ tự.
- [ ] Nếu đổi `term`/`pos`/module của một item: `aliases[]` chứa đúng `id` cũ.
- [ ] PR mô tả thay đổi dữ liệu/người dùng và cách rollback.

## Trước deploy

- [ ] Backup Postgres gần nhất đã được xác nhận khôi phục được.
- [ ] `VITE_CONTENT_VERSION` đổi khi nội dung/module thay đổi.
- [ ] `POSTGRES_PASSWORD`, `JWT_SECRET`, `VITE_GOOGLE_CLIENT_ID` đã có trong môi trường deploy.
- [ ] Chạy migration trước khi API mới nhận traffic; seed/reconcile chạy trong transaction.
- [ ] Có log/metric tối thiểu cho lỗi `progress/toggle`, import guest và lỗi seed.

## Sau deploy

- [ ] `GET /api/v1/health` và `/healthz` trả 200.
- [ ] Guest học được ngay; toggle tiến độ không làm mất dữ liệu khi offline.
- [ ] Login thử trên hai trình duyệt/thiết bị: import guest chỉ union một lần, progress giống nhau.
- [ ] Kiểm tra một alias thật hoặc fixture: `PUT /progress/toggle` trả `itemId` canonical.
- [ ] Alert lưu tiến độ xuất hiện khi API lỗi và biến mất sau retry thành công.
- [ ] Theo dõi lỗi server/client trong 24h trước khi mở rộng rollout.

## Rollback

- Nếu API mới lỗi nhưng dữ liệu chưa seed: rollback frontend/API về release trước, giữ migration
  alias vì nó tương thích ngược.
- Nếu seed/reconcile mới gây lỗi: dừng job seed, giữ API hiện tại, khôi phục snapshot DB trước seed.
  Không chạy `down` migration trên dữ liệu production trừ khi đã xác nhận không còn tiến độ cần giữ.
- Nếu release content sai: sửa JSON, thêm alias cho ID cũ, seed lại rồi bump `VITE_CONTENT_VERSION`.
