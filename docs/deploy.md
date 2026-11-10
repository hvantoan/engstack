# CI/CD & Release bằng tag

Pipeline: push tag `v*` → GitHub Actions build 2 Docker image đẩy lên GHCR
(`ghcr.io/hvantoan/engstack-api`, `ghcr.io/hvantoan/engstack-web`) với 2 tag
`vX.Y.Z` + `latest`. Watchtower trên server poll GHCR mỗi 5 phút, thấy `latest`
đổi thì tự pull + recreate `api`/`web`. Không có deploy job, không cần SSH.

## 1. Các workflow

| Workflow | Trigger | Việc |
| --- | --- | --- |
| `.github/workflows/ci.yml` | push `main`, pull_request | FE: `npm ci` → typecheck → lint → build. BE: `go vet` → `go build` → `go test -race` (kèm Postgres service) |
| `.github/workflows/release.yml` | push tag `v*` | Kiểm tra tag khớp version + `VITE_GOOGLE_CLIENT_ID` → chạy CI checks gate → buildx build & push image GHCR (`vX.Y.Z` + `latest`) |

## 2. Cấu hình một lần

### 2a. GitHub Actions — variables

Vào: **repo → Settings → Secrets and variables → Actions → tab Variables**
(link: <https://github.com/hvantoan/engstack/settings/variables/actions>)

| Variable | Giá trị |
| --- | --- |
| `VITE_GOOGLE_CLIENT_ID` | OAuth client ID — inline vào bundle lúc build |
| `VITE_API_BASE_URL` | (optional, mặc định `/api/v1`) |

Push image dùng `GITHUB_TOKEN` tự động — không cần secret nào thêm.

### 2b. Server — chạy stack một lần

```bash
git clone https://github.com/hvantoan/engstack.git /opt/engstack
cd /opt/engstack && cp .env.example .env
# .env production: JWT_SECRET thật, POSTGRES_PASSWORD, WEB_PORT,
# VITE_GOOGLE_CLIENT_ID (cho seed/api), CORS_ALLOWED_ORIGINS nếu cần
```

Repo **private** (watchtower phải auth mới pull được):

```bash
# 1. Classic PAT scope read:packages — https://github.com/settings/tokens/new
#    (GHCR không nhận fine-grained token)
echo "<PAT>" | docker login ghcr.io -u <github-username> --password-stdin
```

Start stack (pin `latest` để watchtower auto-update được):

```bash
IMAGE_TAG=latest docker compose --project-directory . --env-file .env \
  -f infras/docker-compose.deploy.yml pull api web

# Repo private: kèm auth override cho watchtower
EXTRA=""; [ -f ~/.docker/config.json ] && EXTRA="-f infras/docker-compose.watchtower-auth.yml"

IMAGE_TAG=latest docker compose --project-directory . --env-file .env \
  -f infras/docker-compose.deploy.yml $EXTRA up -d
```

`--project-directory .` bắt buộc: mount `./data` phải resolve từ root repo.
Nếu sau này `up` lại trên repo private, LUÔN kèm `-f infras/docker-compose.watchtower-auth.yml`
— thiếu thì watchtower bị recreate mất mount credentials → `access forbidden`.

## 3. Phát hành một version

```bash
# 1. bump version
cd frontend && npm version 1.2.3 --no-git-tag-version && cd ..
git add frontend/package.json && git commit -m "chore(release): v1.2.3"

# 2. tag + push → workflow build & push image
make tag          # tạo tag v1.2.3 từ package.json và push origin
```

`release.yml` từ chối build nếu tag khác version trong `package.json` — tránh
image mang tag `v1.2.3` nhưng bundle nhúng version khác.

Sau khi workflow xong (~vài phút), watchtower tự kéo `latest` mới. Theo dõi:

```bash
# trên GitHub: Actions → Release → run vừa chạy
# trên server:
docker logs -f engstack-watchtower
```

Dữ liệu từ vựng (`data/`) KHÔNG tự tới prod theo image: service `seed` chạy
`-if-empty` nên bỏ qua DB đã có topic, và mount `./data` là code checkout trên
host. Sau mỗi vocab release, trên server chạy:

```bash
git pull --ff-only
IMAGE_TAG=latest docker compose --project-directory . --env-file .env \
  -f infras/docker-compose.deploy.yml pull seed
IMAGE_TAG=latest docker compose --project-directory . --env-file .env \
  -f infras/docker-compose.deploy.yml run --rm seed --data-dir /app/data
```

`run` ghi đè `command` (bỏ `-if-empty`) → upsert toàn bộ topics/items
(`ON CONFLICT DO UPDATE`, chạy lại an toàn). Chưa bake `data/` vào api image:
vocab release hiện thưa, manual một lệnh sau `git pull` là đủ.

## 4. Auto-update bằng Watchtower

Stack deploy chạy `containrrr/watchtower` — poll GHCR mỗi 5 phút, tự pull + recreate
container có label `com.centurylinklabs.watchtower.enable=true` (chỉ `api` và `web`;
`postgres` pin version, `seed` one-shot nên không update).

Lưu ý: container đang pin tag version (`IMAGE_TAG=v1.2.3` khi `up` tay) thì
watchtower KHÔNG tự update — tag đó không đổi trên registry. Muốn quay lại
auto-update phải `up -d` với `IMAGE_TAG=latest`.

## 5. Deploy file riêng

`infras/docker-compose.deploy.yml` là stack **độc lập** (không merge với
`docker-compose.yml`): chỉ `image: ghcr.io/...:${IMAGE_TAG}`, không có section
`build:` nên `up` không bao giờ rebuild local. Khác file dev ở chỗ: không publish
port `5433`/`5198`, `JWT_SECRET` bắt buộc (`${JWT_SECRET:?}`), có thêm service
`watchtower`.

`infras/docker-compose.watchtower-auth.yml` là override optional: mount
`~/.docker/config.json` vào watchtower khi GHCR private (file phải tồn tại trước,
nếu không Docker tạo thư mục rỗng tại mount source).

## 6. Rollback

```bash
IMAGE_TAG=v1.2.2 docker compose --project-directory . --env-file .env \
  -f infras/docker-compose.deploy.yml up -d
```

Image của mọi tag cũ vẫn trên GHCR. Pin tag version cũng là cách "đóng băng"
watchtower (nó không đụng container không chạy `latest`). Migration tự apply lúc
boot — rollback qua migration phá vỡ schema thì restore Postgres từ backup trước
(xem `selfhost.md` §4).
