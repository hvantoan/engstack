# ForumFlash — IELTS Vocabulary

Website học từ vựng IELTS theo chủ đề: 20 chủ đề × 200 mục từ (4.000 mục từ)
kèm phiên âm IPA, nghĩa tiếng Việt và ví dụ thật. Trình độ mục tiêu B2–C1.

## Stack

- **Vite 8** + React 19 + TypeScript
- **Tailwind CSS v4** + **shadcn/ui** (preset `base-nova`, Base UI primitives)
- React Router DOM, localStorage cho tiến độ học
- Font brand: Alexandria + CalSans (self-host tại `public/fonts/`)

## Chạy dự án

```bash
npm install
npm run dev        # dev server
npm run build      # production build -> dist/
npm run preview    # xem bản build
npm run typecheck  # tsc --noEmit
npm run lint       # eslint
```

## Cấu trúc

- `src/data/topics.json` — dữ liệu 20 chủ đề, mỗi chủ đề 200 mục từ.
- `src/lib/vocab.ts` — kiểu dữ liệu, truy cập topic, nhãn, accent color.
- `src/lib/progress.ts` — tiến độ "đã thuộc" trong `localStorage`
  (`forumflash.learned.v1`).
- `src/pages/` — trang chủ và trang chủ đề.
- `src/components/modes/` — 4 chế độ luyện tập (Học thẻ, Trắc nghiệm,
  Viết lại, Nối từ) + danh sách từ có tìm kiếm.
- `design-system/` — hệ thiết kế (MASTER.md là source of truth).
- `legacy/` — bản static export cũ (Next.js) giữ lại làm tham chiếu nội dung.

## Mục tiêu đơn giản trước

Bản hiện tại giữ nguyên: brand, ngôn ngữ tiếng Việt, 20 chủ đề, 4 chế độ
luyện tập, tiến độ học cục bộ. Chưa có: backend, tài khoản, spaced
repetition, deploy.
