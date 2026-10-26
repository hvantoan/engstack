# Data model — dữ liệu từ vựng engstack

Một schema duy nhất cho cả hai track: mỗi file JSON dưới `data/**` là một **module**
tự mô tả. File là **seed**: runtime đọc nội dung qua API Go (`GET /api/v1/topics`), không đọc JSON.
Thêm module = thêm file + seed lại DB + bump `VITE_CONTENT_VERSION`; không sửa code, không sửa index.

Types nguồn: [`frontend/src/lib/vocab-schema.ts`](../frontend/src/lib/vocab-schema.ts) (thuần, không import API
chỉ có trong Vite, để script Node load được). Runtime: [`frontend/src/lib/content.ts`](../frontend/src/lib/content.ts)
(hook `useTopicSummaries` / `useTopic`) — [`frontend/src/lib/vocab.ts`](../frontend/src/lib/vocab.ts) chỉ còn nhãn/màu UI.
Ranh giới BE/admin: [`frontend/src/lib/vocab-admin.ts`](../frontend/src/lib/vocab-admin.ts).

## 1. Cấu trúc file

```
data/
  topics/<id>.json     track: ielts   — 20 module, 200 mục mỗi module
  oxford/<level>.json  track: oxford  — a1 · a2 · b1 · b2
```

**Tên file = `id` của module** (không có phần mở rộng). Bước seed đọc chính tên file và kiểm tra
`module.id` khớp với nó, nên không có danh sách module nào phải bảo trì thủ công.
`related[]` trong file topic cũng trỏ bằng `id` này.

## 2. Envelope của module

| field | bắt buộc | kiểu | ghi chú |
| --- | --- | --- | --- |
| `id` | ✓ | string | phải bằng tên file |
| `track` | ✓ | `"ielts" \| "oxford"` | track mới vẫn render được (nhãn fallback về id thô) |
| `title` | ✓ | string | tiêu đề hiển thị |
| `description` | ✓ | string | mô tả ngắn, tiếng Việt |
| `eyebrow` | ✓ | string | nhãn nhỏ trên card, ví dụ `OXFORD 3000 · CEFR B1` |
| `accent` | ✓ | `mint \| coral \| yellow \| blue` | map sang token chart trong `src/index.css` |
| `level` | – | `A1 \| A2 \| B1 \| B2 \| C1` | chỉ track Oxford |
| `order` | – | number | thứ tự hiển thị; thiếu thì xếp cuối theo `id` |
| `related` | – | string[] | id các module liên quan (chỉ track IELTS) |
| `items` | ✓ | `VocabItem[]` | không được rỗng |

## 3. Item

| field | bắt buộc | ngôn ngữ | ghi chú |
| --- | --- | --- | --- |
| `id` | ✓ | – | sinh bằng `itemId()` trong `vocab-schema.ts`, **không** tự đặt tay |
| `term` | ✓ | EN | headword / collocation / idiom |
| `ipa` | ✓ (được rỗng) | – | 17 mục Oxford không có phiên âm trong nguồn |
| `label` | ✓ | – | `word \| collocation \| idiom` |
| `meaning` | ✓ | **VI** | gloss ngắn 1–6 từ, đúng sense theo `pos` + `definition` |
| `example` | ✓ | EN | câu ví dụ thật |
| `exampleVi` | ✓ | **VI** | dịch của `example` |
| `definition` | – | EN | định nghĩa từ điển (chỉ Oxford) |
| `level` | – | – | CEFR của mục (chỉ Oxford) |
| `pos` | – | – | mảng nhãn từ loại chuẩn, xem dưới |
| `aliases` | – | – | các `id` cũ của cùng một mục; dùng khi đổi `term`/`pos` hoặc chuyển module |

`pos` là **mảng** (`string[]`) vì một số headword có nhiều từ loại (`["noun","adjective"]`) và
nhận **16 nhãn**: `noun · verb · adjective · adverb · preposition · pronoun · conjunction ·
determiner · exclamation · number · ordinal number · modal verb · auxiliary verb · linking verb ·
definite article · indefinite article`. Viết tắt từ nguồn (`n.`, `adj.`, `prep.`, `adv.`,
`n., adj.`, `n., v.`, `adj./adv.`) được map trong `scripts/data-normalize.ts`.

`topicId` và `track` **không** có trong JSON: bước seed gắn vào từng item khi ghi DB
(`ModuleItem`), vì bảng DB là phẳng còn file thì lồng trong module.

## 4. Luật `id`

```
<module-id>:<slug(term)>[:<slug(pos)>]        slug(pos) nối bằng "-" khi nhiều từ loại
oxford-b1:about:preposition
oxford-a2:per-cent:noun-adjective-adverb
education:early-childhood-education           (IELTS không có pos)
```

- Tất định: regenerate dữ liệu không đổi `id` → progress của người dùng không mất.
- `slug()` fold dấu, bỏ `™`/`®`, đổi mọi ký tự khác thành `-` (`o’clock` → `o-clock`).
- **Trùng `id` là lỗi, không có số thứ tự dự phòng.** `npm run check:data` fail và người viết
  phải sửa dữ liệu (đổi term/pos), không được để id phụ thuộc thứ tự dòng.
- `id` phụ thuộc `term` và `pos`. Khi sửa một trong hai (hoặc chuyển item sang module khác),
  **bắt buộc** giữ `id` cũ trong `aliases[]` của item mới. `check-data` từ chối alias sai định dạng,
  trùng nhau, tự trỏ chính nó hoặc trùng một `id` hiện tại.
- Seed ghi alias vào `vocab_item_aliases`, migrate `user_progress` từ `id` cũ sang `id` canonical rồi
  mới xoá item cũ. `PUT /progress/toggle` và `POST /progress/import-guest` cũng resolve alias để
  client đang cache nội dung cũ không mất tiến độ.

## 5. Thêm module mới

1. Tạo `data/<track>/<id>.json` theo envelope ở mục 2 (mỗi item đầy đủ `meaning`,
   `example`, `exampleVi`).
2. Chạy `make check-data` (hoặc `npm run check:data` từ `frontend/`) — phải in `0 schema error`, `0 duplicate id`.
3. Seed lại DB: `make seed`.
4. Bump `VITE_CONTENT_VERSION` rồi rebuild/deploy: URL `/topics?v=` đổi nên browser không chờ
   hết `max-age` 24h của list. Xong: module xuất hiện trên Home và ở `/topic/<id>`, dùng chung
   mọi mode học (Học thẻ · Trắc nghiệm · Viết lại · Nối từ · Danh sách từ).

Item sai schema bị seed từ chối; module lỗi không làm vỡ app.

## 6. Lệnh dữ liệu

| lệnh | việc |
| --- | --- |
| `make check-data` / `npm run check:data` | validate toàn bộ `data/**`: schema, id trùng, field rỗng, `pos` lạ, `related` trỏ sai (warning) |
| `npm run data:normalize` | chuẩn hoá dữ liệu thô về schema (tách topic, thêm id, map pos, bỏ dòng trùng). Idempotent |
| `npm run data:translate` | điền `meaning`/`exampleVi` tiếng Việt bằng LLM, cache theo `item.id` |
| `make load-oxford` / `npm run load:oxford` | cào lại Oxford 3000 từ nguồn Oxford + chuẩn hoá |

`data:translate` đọc env (xem `.env.example`): `TRANSLATE_API_KEY`, `TRANSLATE_BASE_URL`,
`TRANSLATE_MODEL`, `TRANSLATE_CONCURRENCY`. Nguồn sự thật là chính file JSON: mục đã đủ
`meaning`/`exampleVi` (và `example` nếu cần) thì bỏ qua, không gọi API — nên clone sạch
không có cache cũng không dịch lại. `scripts/.cache/translate.json` (gitignored) chỉ là điểm
resume trong lúc chạy. Sửa tay một bản dịch trong JSON rồi đặt `"locked": true` cho entry
tương ứng trong cache (giữ nguyên text đã sửa) để script không ghi đè.
Response của model phải khớp 1:1 với batch (đủ, không trùng, không lệch chỉ số); batch lệch
bị bỏ nguyên và thử lại ở lần chạy sau.
`scripts/.cache/translate-review.md` liệt kê các mục LLM phải tự sinh ví dụ/định nghĩa.

## 7. Runtime: API & hiển thị

- `useTopicSummaries()` → `GET /topics?v=${VITE_CONTENT_VERSION}`, sort theo `orderIndex` rồi `id`;
  Home dùng `itemCount` + `related` từ DTO summary.
- `useTopic(id)` → `GET /topics/{id}` với `cache: "no-cache"` (revalidate qua `ETag`), nên seed lại
  thấy nội dung mới ngay, không chờ `max-age` 24h.
- Trang module dùng cả hai hook: `useTopic` cho nội dung, `useTopicSummaries` cho khối
  "Chủ đề liên quan" (lọc `related` trên danh sách summary).
- Home nhóm module theo `track` (`TRACK_LABEL` + `TRACK_DESCRIPTION`, fallback về id thô nên
  track mới vẫn hiển thị).
- Nhãn của item phụ thuộc track: `labelText(item)` → `Word` (IELTS), `Word · Oxford Core`
  (Oxford), `Collocation · IELTS`, `Idiom · Speaking`.
- Progress: guest trong localStorage `engstack.learned.v2` = `{ moduleId: itemId[] }`; đã login thì
  đọc/ghi server (`GET /progress`, `PUT /progress/toggle`). Login lần đầu: `POST
  /progress/import-guest` union với dữ liệu server, chỉ xoá key local sau khi server trả 200.
  Khoá cũ `engstack.learned.v1` (`{ moduleId: term[] }`) được migrate một lần trong
  `sessionRestore()`: chỉ chạy khi mọi module id trong khoá cũ đều fetch được, và chỉ xoá khoá cũ
  sau khi ghi v2 thành công — module lỗi không làm mất tiến độ.
- Nếu `PUT /progress/toggle` lỗi, UI hoàn lại optimistic update, giữ mutation chưa xác nhận trong
  memory và hiển thị alert toàn cục kèm nút **Thử lại**; khi online/visible app cũng tự retry.
  Response trả `itemId` canonical để client thay ID alias ngay sau mutation thành công.

## 7.1 Ôn tập giãn cách (SRS — chỉ tài khoản đăng nhập)

Ba khái niệm tách biệt: cờ **"đã thuộc"** (`user_progress`), **lịch ôn** (`review_items`) và
**kết quả nhớ lại** (`review_events`). Không suy ra độ thành thạo từ cờ boolean.

- **Vào hàng đợi:** đánh dấu "đã thuộc" (toggle hoặc import-guest) đưa item vào `review_items`
  với `due_at = NOW() + 1 ngày`; bỏ thuộc thì xoá khỏi hàng đợi (log giữ nguyên).
- **Scheduler:** SM-2 trong `backend/internal/review` — rating 1–4 (Lại/Khó/Tốt/Dễ) → quality
  1/3/4/5; q<3 reset ladder về 1 ngày và giảm ease (sàn 1.3); lần đầu 1 ngày, lần hai 6 ngày,
  sau đó `interval × ease` ("Khó" chỉ ×1.2; trần 365 ngày). Pure function, test pinned.
- **API:** `GET /review/due?limit=` trả thẻ đến hạn kèm nội dung + `dueCount`, `pendingCount`,
  `nextDueAt`. `POST /review/submit {itemId, rating, clientEventId?}` ghi event + cập nhật
  lịch trong một transaction (row lock chống đua đa thiết bị); replay cùng `clientEventId`
  trả `duplicate: true`, không ghi event lần hai.
- **Guest:** không có SRS — lịch ôn cần tài khoản để đồng bộ đa thiết bị (quyết định D2).
- **Alias:** bước seed migrate `review_items` (merge-guard như `user_progress`) và
  `review_events` sang id canonical trước khi xoá alias/item cũ.

## 8. Bàn giao BE / admin

`VocabItemRow = ModuleItem & { status, source, updatedAt, authorId }` là hình dạng một dòng
bảng `vocab_items`; `toRow(item)` chiếu một mục đã load thành dòng đó (`status: "published"`,
`source: "llm"` cho Oxford vì bản dịch do pipeline sinh, `"seed"` cho IELTS,
`updatedAt`/`authorId` = `null` vì DB set khi ghi).

File dữ liệu tĩnh trong repo là **seed**, không phải bản ghi runtime. Backend đọc JSON qua
`seeder.Import` rồi reconcile trong một transaction: upsert nội dung hiện tại, migrate progress và
review qua `vocab_item_aliases`, xoá item/topic không còn trong dataset. `user_progress`, `review_items`
và `review_events` luôn trỏ tới `vocab_items.id` canonical; `vocab_item_aliases.alias` chỉ là lối tắt
tương thích cho dữ liệu/client cũ.

## 9. Ghi chú dữ liệu đã biết

- 10 dòng trùng `term` + `pos` trong nguồn Oxford đã bị bỏ (chúng lặp y hệt
  `definition`/`example`/`ipa`, chỉ khác `senseHint` vốn lấy từ một sense khác). `senseHint`
  không được chuyển sang schema chuẩn: ở đúng 10 cặp cần nó thì nó bị gán lệch sense, các mục
  còn lại đã rõ nghĩa nên hint không thêm thông tin dùng được.
- `meaning`/`exampleVi` của 3303 mục Oxford do LLM sinh và đã spot-check; các mục mà LLM phải
  tự sinh luôn ví dụ hoặc định nghĩa nằm trong `scripts/.cache/translate-review.md`.
- 17 mục Oxford không có phiên âm trong nguồn → `ipa: ""`; UI tự ẩn khi rỗng.
- 21 mục Oxford thiếu cả `definition` lẫn `example` trong nguồn → gloss và ví dụ do LLM sinh.

> Tài liệu này thay thế §3.1–3.2 của
> [`plans/research/load-oxford-3000-dataset.md`](../plans/research/load-oxford-3000-dataset.md)
> (schema ở đó dùng union `pos` 8 giá trị và chưa có id ổn định).
