# Page Override: Topic Study Arena (`/topic/:topicId`)

> **OVERRIDE SPEC:** This file overrides `design-system/forumflash/MASTER.md` specifically for the `/topic/:topicId` route.

---

## 1. Bố cục & Trải nghiệm tập trung (Distraction-Free Study Deck)

- **Compact Header (Chế độ tập trung):**
  - Mặc định thu gọn thanh header để đưa nội dung học lên ngay tầm mắt (above the fold).
  - Ẩn mô tả dài và nút chép liên kết khi đang học.
  - Ẩn phần "Chủ đề liên quan" ở chân trang khi ở các tab luyện tập (`learn`, `quiz`, `write`, `match`).
  - Nút chuyển đổi Focus Mode lưu trạng thái vào `localStorage` (`forumflash.focus_mode`).

---

## 2. Flashcard Specs (`LearnMode`)

- **Kích thước & Căn giữa:**
  - Container: `max-w-4xl mx-auto` căn giữa hoàn hảo.
  - Chiều cao cố định: `min-h-[380px]` (mobile) / `min-h-[420px]` (desktop) để đảm bảo **Zero Layout Shift (CLS = 0)** khi lật mặt trước $\leftrightarrow$ mặt sau.
- **Typography mặt trước:**
  - Thuật ngữ (Term): `text-4xl sm:text-5xl lg:text-6xl font-heading font-bold text-foreground`.
  - Phiên âm (IPA): `text-base sm:text-lg font-mono text-primary font-medium` kèm nút loa phát âm.
- **Typography mặt sau:**
  - Nghĩa tiếng Việt: `text-2xl sm:text-3xl font-heading font-semibold text-foreground`.
  - Ví dụ ngữ cảnh IELTS: Hộp `bg-muted/40 p-4 rounded-2xl border border-border/80` làm nổi bật câu ví dụ thực tế.
- **Bàn phím toàn diện (Keyboard-First):**
  - `Space` / `Enter`: Lật thẻ.
  - `←` / `→`: Chuyển thẻ trước / sau.
  - `M`: Đánh dấu đã thuộc / chưa thuộc.
  - `A`: Phát âm bản xứ (Web Speech API).
  - `S`: Xáo trộn thứ tự thẻ (Shuffle).
- **Bộ lọc từ vựng:** Toggle "Tất cả từ" vs "Chỉ học từ chưa thuộc".

---

## 3. Quiz Specs (`QuizMode`)

- **Kích thước & Bố cục:**
  - Container: `max-w-3xl mx-auto`.
  - Nút đáp án: Chiều cao tối thiểu `min-h-16`, padding `16px`, bo góc `rounded-xl`.
- **Phím tắt chọn đáp án & chuyển câu:**
  - Phím `1`, `2`, `3`, `4` (và bàn phím số numpad): Chọn đáp án tương ứng tức thì nếu chưa trả lời.
  - Phím `Enter`: Chuyển ngay sang câu tiếp theo khi câu hỏi đã được trả lời (hoặc làm lại vòng mới khi xong 10 câu).
  - Phím `A`: Nghe phát âm từ vựng câu hỏi.
- **Visual Affordance (Chỉ dẫn thị giác):**
  - Badge số thứ tự: `[ 1 ]`, `[ 2 ]`, `[ 3 ]`, `[ 4 ]` hiển thị nổi bật ở đầu mỗi nút đáp án.
  - Badge phím chuyển: `Enter ↵` tích hợp trực tiếp trên nút "Câu tiếp theo".
- **Hộp ngữ cảnh củng cố kiến thức:**
  - Khi học sinh đã trả lời, tự động hiển thị câu ví dụ thực tế của từ vựng ngay bên dưới các đáp án để giải thích ngữ cảnh, giúp học sinh nhớ lâu hơn.
