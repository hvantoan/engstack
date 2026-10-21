# ==============================================================================
# engstack — Makefile for Development, Quality Checks, and Production Releases
# ==============================================================================

SHELL := /bin/bash
.SHELLFLAGS := -eu -o pipefail -c
.DEFAULT_GOAL := help

# Project metadata
NAME := $(shell node -p "require('./frontend/package.json').name")
VERSION := $(shell node -p "require('./frontend/package.json').version")
COMMIT := $(shell git rev-parse --short HEAD 2>/dev/null || echo "unknown")
IMAGE_NAME := $(NAME)
PORT ?= 5199
WEB_PORT ?= $(or $(shell sed -n 's/^WEB_PORT=//p' .env 2>/dev/null | tail -1),$(PORT))

# Docker Compose command with project directory and env file at root
COMPOSE := docker compose --project-directory . --env-file .env -f infras/docker-compose.yml
# ANSI Colors
CYAN   := \033[36m
GREEN  := \033[32m
YELLOW := \033[33m
RED    := \033[31m
BOLD   := \033[1m
RESET  := \033[0m

##@ Trợ giúp (Help)
.PHONY: help
help: ## Hiển thị danh sách các lệnh có sẵn
	@echo -e "$(BOLD)$(CYAN)engstack$(RESET) — Quản lý Build & Release $(YELLOW)v$(VERSION)$(RESET) ($(COMMIT))"
	@echo -e "Cách dùng: $(BOLD)make [target]$(RESET)\n"
	@awk 'BEGIN {FS = ":.*##"; printf ""} \
		/^[a-zA-Z0-9_-]+:.*?##/ { printf "  $(CYAN)%-16s$(RESET) %s\n", $$1, $$2 } \
		/^##@/ { printf "\n$(BOLD)%s$(RESET)\n", substr($$0, 5) } ' $(MAKEFILE_LIST)
	@echo ""

##@ Cài đặt & Phát triển (Dev & Install)
.PHONY: install
install: ## Cài đặt dependencies chính xác theo package-lock.json
	@echo -e "$(CYAN)==> Cài đặt dependencies (npm ci)...$(RESET)"
	cd frontend && npm ci

.PHONY: dev
dev: ## Chạy Vite development server
	@echo -e "$(GREEN)==> Khởi động dev server...$(RESET)"
	cd frontend && npm run dev

##@ Kiểm tra chất lượng (Verification & Linting)
.PHONY: typecheck
typecheck: ## Kiểm tra kiểu dữ liệu TypeScript (tsc --noEmit)
	@echo -e "$(CYAN)==> Kiểm tra TypeScript...$(RESET)"
	cd frontend && npm run typecheck
	@echo -e "$(GREEN)✓ Typecheck thành công!$(RESET)"

.PHONY: lint
lint: ## Kiểm tra linter ESLint
	@echo -e "$(CYAN)==> Chạy ESLint...$(RESET)"
	cd frontend && npm run lint
	@echo -e "$(GREEN)✓ Lint thành công!$(RESET)"

.PHONY: format
format: ## Tự động định dạng mã nguồn bằng Prettier
	@echo -e "$(CYAN)==> Định dạng code (Prettier)...$(RESET)"
	cd frontend && npm run format

.PHONY: check
check: typecheck lint ## Chạy toàn bộ kiểm tra (TypeScript + ESLint)
	@echo -e "$(GREEN)$(BOLD)✓ Toàn bộ mã nguồn đã sẵn sàng để release!$(RESET)"

##@ Build & Release Production
.PHONY: build
build: ## Biên dịch production SPA vào thư mục dist/
	@echo -e "$(CYAN)==> Biên dịch production build (tsc -b && vite build)...$(RESET)"
	cd frontend && npm run build
	@echo -e "$(GREEN)✓ Build hoàn tất! Output: frontend/dist/$(RESET)"

.PHONY: preview
preview: build ## Xem trước bản build production trên local server
	@echo -e "$(CYAN)==> Khởi chạy preview server...$(RESET)"
	cd frontend && npm run preview

.PHONY: release
release: check build ## Quy trình phát hành chuẩn: kiểm tra toàn diện và build production
	@echo -e "\n$(GREEN)$(BOLD)=====================================================$(RESET)"
	@echo -e "$(GREEN)$(BOLD)🎉 RELEASE BUILD THÀNH CÔNG!$(RESET)"
	@echo -e "   - Ứng dụng : $(BOLD)$(NAME)$(RESET)"
	@echo -e "   - Phiên bản: $(YELLOW)$(VERSION)$(RESET)"
	@echo -e "   - Commit   : $(CYAN)$(COMMIT)$(RESET)"
	@echo -e "   - Thư mục  : $(BOLD)frontend/dist/$(RESET)"
	@echo -e "   - Kích thước bundle: $$(du -sh frontend/dist | cut -f1)"
	@echo -e "$(GREEN)$(BOLD)=====================================================$(RESET)"
	@echo -e "Để chạy thử bản release: $(CYAN)make preview$(RESET)"
	@echo -e "Để cập nhật site đang chạy: $(CYAN)make deploy$(RESET)\n"

##@ Dữ liệu từ vựng (Data Management)
.PHONY: load-oxford
load-oxford: ## Tải và trích xuất bộ từ vựng Oxford 3000 (CEFR A1-B2)
	@echo -e "$(CYAN)==> Chạy pipeline trích xuất Oxford 3000...$(RESET)"
	node --experimental-strip-types scripts/load-oxford3000.ts && node --experimental-strip-types scripts/data-normalize.ts

.PHONY: check-data
check-data: ## Kiểm tra tính hợp lệ của toàn bộ dữ liệu trong data/
	@echo -e "$(CYAN)==> Kiểm tra dữ liệu (data-check)...$(RESET)"
	node --experimental-strip-types scripts/data-check.ts

##@ Self-host (local full stack)
# Toàn bộ stack (Postgres + API + web + seed) chạy bằng docker compose; cấu hình đọc từ `.env`.
# Truy cập: http://localhost:$(WEB_PORT) — chi tiết: docs/selfhost.md
.PHONY: selfhost
selfhost: ## Dựng/cập nhật toàn bộ stack local và chờ health check
	@test -f .env || { echo -e "$(RED)✗ Thiếu .env — chạy: cp .env.example .env rồi điền VITE_GOOGLE_CLIENT_ID$(RESET)"; exit 1; }
	@echo -e "$(CYAN)==> Build + start stack (Postgres, API, seed, web)...$(RESET)"
	$(COMPOSE) up -d --build --remove-orphans
	@echo -e "$(CYAN)==> Chờ seed dữ liệu từ vựng...$(RESET)"
	@$(COMPOSE) wait seed
	@curl -fsS --retry 30 --retry-delay 1 --retry-connrefused http://localhost:$(WEB_PORT)/healthz >/dev/null || { echo -e "$(RED)✗ Web health check thất bại — xem: make selfhost-logs$(RESET)"; $(COMPOSE) logs --tail 20 web; exit 1; }
	@curl -fsS --retry 10 --retry-delay 1 --retry-connrefused http://localhost:$(WEB_PORT)/api/v1/health >/dev/null || { echo -e "$(RED)✗ Proxy API (/api/v1/health) thất bại — xem: make selfhost-logs$(RESET)"; $(COMPOSE) logs --tail 20 api; exit 1; }
	@echo -e "$(GREEN)$(BOLD)✓ engstack đang chạy: http://localhost:$(WEB_PORT)$(RESET)"

.PHONY: selfhost-down
selfhost-down: ## Dừng và xoá container của stack (giữ volume dữ liệu)
	$(COMPOSE) down

.PHONY: selfhost-logs
selfhost-logs: ## Xem log toàn bộ stack
	$(COMPOSE) logs -f --tail=100

.PHONY: seed
seed: ## Nạp lại (upsert) dữ liệu từ vựng từ data vào DB đang chạy
	$(COMPOSE) run --rm seed --data-dir /app/data

.PHONY: selfhost-reset
selfhost-reset: ## Xoá sạch dữ liệu (volume) rồi dựng lại stack
	@echo -e "$(YELLOW)==> Xoá volume Postgres...$(RESET)"
	$(COMPOSE) down -v
	@$(MAKE) --no-print-directory selfhost

##@ Docker & Containerization
.PHONY: docker-build
docker-build: ## Build image web (nginx) theo biến trong .env
	$(COMPOSE) build web

.PHONY: deploy
deploy: check selfhost ## Cập nhật site đang chạy: kiểm tra mã nguồn rồi rebuild stack

.PHONY: docker-stop
docker-stop: ## Dừng stack (giữ container và dữ liệu)
	$(COMPOSE) stop

##@ Dọn dẹp (Cleanup)
.PHONY: clean
clean: ## Dọn dẹp thư mục dist và cache tạm
	@echo -e "$(YELLOW)==> Dọn dẹp dist/ và cache...$(RESET)"
	rm -rf frontend/dist frontend/node_modules/.vite /tmp/oxford3000*
	@echo -e "$(GREEN)✓ Đã dọn dẹp sạch sẽ!$(RESET)"
