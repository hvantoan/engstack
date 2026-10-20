# Self-host engstack tại local

Một lệnh dựng toàn bộ app: Postgres 16 + Go API + web nginx (proxy `/api` same-origin),
tự migrate schema và tự seed 20 chủ đề từ `src/data/**` khi database còn rỗng.

## 1. Chuẩn bị

```bash
cp .env.example .env
```

Điền `VITE_GOOGLE_CLIENT_ID` trong `.env`. Giá trị này được dùng cho **cả hai phía**:
Vite inline vào bundle lúc build, và backend dùng làm `GOOGLE_CLIENT_ID` để verify ID token.

Trong Google Cloud Console → APIs & Services → Credentials → OAuth Client ID (Web application):

- **Authorized JavaScript origins**: `http://localhost:5199` (thêm `http://localhost:5173` nếu chạy
  `npm run dev`).
- Không cần client secret: backend chỉ verify ID token do Google Identity Services trả về.

`AUTH_DEV_MODE=false` là mặc định — đăng nhập phải qua Google thật. Đặt `true` chỉ khi muốn
dùng token giả `dev:<email>` để thử API mà không cần OAuth.

## 2. Chạy

```bash
make selfhost
# ✓ engstack đang chạy: http://localhost:5199
```

Lệnh này build image, start `postgres` → `api` (migrate on boot) → `seed` (một lần, bỏ qua nếu
bảng `topics` đã có dữ liệu) → `web`, rồi chờ health check của web và proxy API trước khi báo xong.

| Lệnh | Việc |
| --- | --- |
| `make selfhost` | Dựng/cập nhật toàn bộ stack, chờ health check |
| `make selfhost-logs` | Theo dõi log toàn bộ stack |
| `make selfhost-down` | Dừng và xoá container (giữ volume dữ liệu) |
| `make seed` | Nạp lại/upsert dữ liệu từ `src/data` vào DB đang chạy |
| `make selfhost-reset` | Xoá volume Postgres rồi dựng lại từ đầu |
| `make docker-stop` | Dừng stack, giữ container |

Kiểm tra nhanh sau khi chạy:

```bash
curl -s http://localhost:5199/healthz                     # OK
curl -s http://localhost:5199/api/v1/health                # {"status":"ok",...}
curl -s http://localhost:5199/api/v1/topics | head -c 200  # danh sách chủ đề đã seed
```

## 3. Dữ liệu & cập nhật nội dung

- Seed chỉ chạy khi `topics` rỗng, nên restart stack không ghi đè dữ liệu người dùng.
- Sửa JSON trong `src/data/**` → `make seed` (upsert idempotent, chạy trong transaction).
  Đổi thêm `VITE_CONTENT_VERSION` trong `.env` rồi `make selfhost` để browser bỏ cache
  `GET /topics` (`?v=` đổi).
- Schema đổi → migration mới trong `backend/migrations/`; API tự apply lúc khởi động
  (`MIGRATE_ON_BOOT=true`).

## 4. Backup & restore

```bash
# backup
docker exec engstack-db pg_dump -U postgres engstack > backup.sql
# restore vào stack mới
docker exec -i engstack-db psql -U postgres -d engstack < backup.sql
```

## 5. Xử lý sự cố

| Triệu chứng | Nguyên nhân / cách sửa |
| --- | --- |
| `required variable VITE_GOOGLE_CLIENT_ID is missing a value` | Chưa có key trong `.env` |
| Đăng nhập Google báo lỗi `invalid google id token` | Origin chưa có trong Authorized JavaScript origins, hoặc client ID trong bundle khác client ID backend (đổi `.env` rồi `make selfhost` để build lại) |
| `bind: address already in use` ở 5199/8080/5433 | Cổng đang bị chiếm. Đổi `WEB_PORT` trong `.env`; container cũ do `docker run` tạo (`engstack-web`) thì `docker rm -f engstack-web` |
| Web lên nhưng `/api/v1/*` trả 502 | `api` chưa healthy: `docker compose logs api` |
| Seed lỗi | `docker compose logs seed`; chạy lại `docker compose run --rm seed --data-dir /app/src/data` |
| Trang không thấy chủ đề mới | Chưa seed (`make seed`) hoặc browser cache: bump `VITE_CONTENT_VERSION` |

## 6. Giới hạn của cấu hình local

- `JWT_SECRET` mặc định là giá trị dev trong `docker-compose.yml`; đổi trước khi mở ra LAN.
- `5433` (Postgres) và `8080` (API) publish ra host để debug; bỏ `ports` của hai service này
  nếu chỉ dùng qua web.
- Không TLS, không domain: đây là stack local, production cần reverse proxy/secret riêng.
