# ==============================================================================
# engstack — Makefile for Development, Quality Checks, and Production Releases
# ==============================================================================

SHELL := /bin/bash
.SHELLFLAGS := -eu -o pipefail -c
.DEFAULT_GOAL := help

# Project metadata
NAME := $(shell node -p "require('./package.json').name")
VERSION := $(shell node -p "require('./package.json').version")
COMMIT := $(shell git rev-parse --short HEAD 2>/dev/null || echo "unknown")
IMAGE_NAME := $(NAME)
CONTAINER := $(NAME)-web
PORT ?= 5199
PUBLIC_URL ?= https://engstack.hvantoan.xyz

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
	npm ci

.PHONY: dev
dev: ## Chạy Vite development server
	@echo -e "$(GREEN)==> Khởi động dev server...$(RESET)"
	npm run dev

##@ Kiểm tra chất lượng (Verification & Linting)
.PHONY: typecheck
typecheck: ## Kiểm tra kiểu dữ liệu TypeScript (tsc --noEmit)
	@echo -e "$(CYAN)==> Kiểm tra TypeScript...$(RESET)"
	npm run typecheck
	@echo -e "$(GREEN)✓ Typecheck thành công!$(RESET)"

.PHONY: lint
lint: ## Kiểm tra linter ESLint
	@echo -e "$(CYAN)==> Chạy ESLint...$(RESET)"
	npm run lint
	@echo -e "$(GREEN)✓ Lint thành công!$(RESET)"

.PHONY: format
format: ## Tự động định dạng mã nguồn bằng Prettier
	@echo -e "$(CYAN)==> Định dạng code (Prettier)...$(RESET)"
	npm run format

.PHONY: check
check: typecheck lint ## Chạy toàn bộ kiểm tra (TypeScript + ESLint)
	@echo -e "$(GREEN)$(BOLD)✓ Toàn bộ mã nguồn đã sẵn sàng để release!$(RESET)"

##@ Build & Release Production
.PHONY: build
build: ## Biên dịch production SPA vào thư mục dist/
	@echo -e "$(CYAN)==> Biên dịch production build (tsc -b && vite build)...$(RESET)"
	npm run build
	@echo -e "$(GREEN)✓ Build hoàn tất! Output: dist/$(RESET)"

.PHONY: preview
preview: build ## Xem trước bản build production trên local server
	@echo -e "$(CYAN)==> Khởi chạy preview server...$(RESET)"
	npm run preview

.PHONY: release
release: check build ## Quy trình phát hành chuẩn: kiểm tra toàn diện và build production
	@echo -e "\n$(GREEN)$(BOLD)=====================================================$(RESET)"
	@echo -e "$(GREEN)$(BOLD)🎉 RELEASE BUILD THÀNH CÔNG!$(RESET)"
	@echo -e "   - Ứng dụng : $(BOLD)$(NAME)$(RESET)"
	@echo -e "   - Phiên bản: $(YELLOW)$(VERSION)$(RESET)"
	@echo -e "   - Commit   : $(CYAN)$(COMMIT)$(RESET)"
	@echo -e "   - Thư mục  : $(BOLD)dist/$(RESET)"
	@echo -e "   - Kích thước bundle: $$(du -sh dist | cut -f1)"
	@echo -e "$(GREEN)$(BOLD)=====================================================$(RESET)"
	@echo -e "Để chạy thử bản release: $(CYAN)make preview$(RESET)"
	@echo -e "Để cập nhật site đang chạy: $(CYAN)make deploy$(RESET)\n"

##@ Dữ liệu từ vựng (Data Management)
.PHONY: load-oxford
load-oxford: ## Tải và trích xuất bộ từ vựng Oxford 3000 (CEFR A1-B2)
	@echo -e "$(CYAN)==> Chạy pipeline trích xuất Oxford 3000...$(RESET)"
	npm run load:oxford

##@ Docker & Containerization
.PHONY: docker-build
docker-build: ## Đóng gói Docker image phục vụ production bằng Nginx
	@echo -e "$(CYAN)==> Đóng gói Docker image $(IMAGE_NAME):$(VERSION)...$(RESET)"
	docker build \
		-t $(IMAGE_NAME):$(VERSION) \
		-t $(IMAGE_NAME):latest .
	@echo -e "$(GREEN)✓ Docker image $(IMAGE_NAME):$(VERSION) đã sẵn sàng!$(RESET)"

.PHONY: deploy
deploy: release docker-build ## Cập nhật site đang chạy: check → build → image → recreate container → health check
	@echo -e "$(CYAN)==> Cập nhật container $(CONTAINER) trên cổng $(PORT)...$(RESET)"
	-docker rm -f $(CONTAINER) >/dev/null 2>&1
	docker run -d --restart unless-stopped -p $(PORT):80 --name $(CONTAINER) $(IMAGE_NAME):latest >/dev/null
	@for i in $$(seq 1 30); do \
		if curl -fsS http://localhost:$(PORT)/healthz >/dev/null 2>&1; then break; fi; \
		sleep 0.5; \
	done
	@curl -fsS http://localhost:$(PORT)/healthz || { echo -e "$(RED)✗ Health check thất bại, xem log: docker logs $(CONTAINER)$(RESET)"; docker logs --tail 20 $(CONTAINER); exit 1; }
	@echo -e "$(GREEN)$(BOLD)✓ Site đã cập nhật: http://localhost:$(PORT) → $(PUBLIC_URL) — $(IMAGE_NAME):$(VERSION) ($(COMMIT))$(RESET)"

.PHONY: docker-run
docker-run: ## Chạy container release trên cổng PORT (mặc định 5199)
	@echo -e "$(CYAN)==> Chạy container $(CONTAINER) trên port $(PORT)...$(RESET)"
	-docker rm -f $(CONTAINER) >/dev/null 2>&1
	docker run -d --restart unless-stopped -p $(PORT):80 --name $(CONTAINER) $(IMAGE_NAME):latest
	@echo -e "$(GREEN)✓ Đang chạy tại: $(BOLD)http://localhost:$(PORT)$(RESET)"
	@echo -e "Dừng container bằng: $(CYAN)make docker-stop$(RESET)"

.PHONY: docker-stop
docker-stop: ## Dừng và xoá container engstack đang chạy
	@echo -e "$(YELLOW)==> Dừng container $(CONTAINER)...$(RESET)"
	-docker stop $(CONTAINER)

##@ Dọn dẹp (Cleanup)
.PHONY: clean
clean: ## Dọn dẹp thư mục dist và cache tạm
	@echo -e "$(YELLOW)==> Dọn dẹp dist/ và cache...$(RESET)"
	rm -rf dist node_modules/.vite /tmp/oxford3000*
	@echo -e "$(GREEN)✓ Đã dọn dẹp sạch sẽ!$(RESET)"
