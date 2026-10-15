# AGENTS.md — Repository Guidance for AI Agents

## Overview
- **Project:** ForumFlash — Website học 4.000 từ vựng IELTS theo 20 chủ đề (B2–C1).
- **Stack:** Vite 8, React 19, TypeScript, Tailwind CSS v4, shadcn/ui (Base UI primitives), Lucide React.
- **Language:** Giao diện tiếng Việt, nội dung từ vựng học thuật song ngữ kèm IPA.

## Verification Commands
Chạy kiểm tra sau khi sửa đổi mã nguồn:
- `npm run typecheck` — Kiểm tra kiểu TypeScript (`tsc --noEmit`).
- `npm run build` — Kiểm tra biên dịch production (`tsc -b && vite build`).
- `npm run lint` — Kiểm tra linter ESLint.

## UI/UX & Design System Invariants (BẮT BUỘC)
Khi tạo mới hoặc chỉnh sửa bất kỳ giao diện/thành phần UI nào:

1. **Source of Truth:**
   - Luôn kiểm tra file override trang tại `design-system/forumflash/pages/[page-name].md` trước.
   - Nếu không có file trang riêng, **bắt buộc tuân thủ 100%** `design-system/forumflash/MASTER.md`.

2. **Phong cách & Hệ màu:**
   - **Phong cách:** Modern Swiss Editorial for EdTech — tối giản hướng nội dung (Content-First), không hoạt hình, không rườm rà.
   - **Màu chủ đạo:** **Academic Gold** (`--primary`: `#B45309` / `oklch(0.55 0.16 65)`), chữ trắng `--primary-foreground`.
   - **Màu nền canvas:** **Warm Ivory** (`--background`: `#FAF9F5`), chống lóa mắt khi đọc lâu.
   - **Màu chữ:** Deep Warm Stone (`--foreground`: `#1C1917`), đảm bảo tương phản > 14:1 trên nền sáng.
   - **Tuyệt đối KHÔNG hardcode mã màu hex tùy tiện trong components**; luôn dùng semantic tokens từ `src/index.css` (`--primary`, `--background`, `--card`, `--muted`, `--border`, v.v.).

3. **Quy tắc thành phần & Tương tác:**
   - **Icon:** Dùng 100% SVG từ `lucide-react`. **CẤM dùng Emoji làm icon chức năng**.
   - **Flashcard:** Cố định chiều cao tối thiểu (`min-h-[280px]`) để triệt tiêu hoàn toàn giật layout khi lật thẻ (Zero CLS).
   - **Hover / Transition:** Tốc độ phản hồi tức thì (150ms – 200ms). CẤM dùng `scale-105` gây xô lệch layout.
   - **Accessibility:** Tương phản chữ tối thiểu 4.5:1. Mọi nút bấm/thẻ bấm phải có `cursor-pointer` và focus ring nhìn thấy được.
   - **Trạng thái:** Báo đúng/sai luôn đi kèm icon (Check/X) + text, không báo bằng màu sắc đơn thuần.
