# Data model — dữ liệu từ vựng engstack

Một schema duy nhất cho cả hai track: mỗi file JSON dưới `src/data/**` là một **module**
tự mô tả. Thêm module = thêm file rồi build; không sửa code, không sửa index, không sửa type.

Types nguồn: [`src/lib/vocab-schema.ts`](../src/lib/vocab-schema.ts) (thuần, không import API
chỉ có trong Vite, để script Node load được). Loader: [`src/lib/vocab.ts`](../src/lib/vocab.ts).
Ranh giới BE/admin: [`src/lib/vocab-admin.ts`](../src/lib/vocab-admin.ts).

## 1. Cấu trúc file

```
src/data/
  topics/<id>.json     track: ielts   — 20 module, 200 mục mỗi module
  oxford/<level>.json  track: oxford  — a1 · a2 · b1 · b2
```

**Tên file = `id` của module** (không có phần mở rộng). Loader đọc chính tên file và kiểm tra
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

`pos` là **mảng** (`string[]`) vì một số headword có nhiều từ loại (`["noun","adjective"]`) và
nhận **16 nhãn**: `noun · verb · adjective · adverb · preposition · pronoun · conjunction ·
determiner · exclamation · number · ordinal number · modal verb · auxiliary verb · linking verb ·
definite article · indefinite article`. Viết tắt từ nguồn (`n.`, `adj.`, `prep.`, `adv.`,
`n., adj.`, `n., v.`, `adj./adv.`) được map trong `scripts/data-normalize.ts`.

`topicId` và `track` **không** có trong JSON: loader gắn vào từng item lúc load (`ModuleItem`),
vì bảng DB là phẳng còn file thì lồng trong module.

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
- Đánh đổi đã biết: `id` phụ thuộc `term` và `pos`. Sửa `term` trong file = đổi `id` = mất
  progress của mục đó; nếu về sau term bị sửa thường xuyên thì phải chuyển sang id do DB cấp.

## 5. Thêm module mới

1. Tạo `src/data/<track>/<id>.json` theo envelope ở mục 2 (mỗi item đầy đủ `meaning`,
   `example`, `exampleVi`).
2. Chạy `npm run check:data` — phải in `0 schema error`, `0 duplicate id`.
3. Chạy `npm run build`. Xong: module xuất hiện trên Home và ở `/topic/<id>`, dùng chung
   mọi mode học (Học thẻ · Trắc nghiệm · Viết lại · Nối từ · Danh sách từ).

File sai schema không làm vỡ app: loader log cảnh báo và bỏ qua đúng module đó.

## 6. Lệnh dữ liệu

| lệnh | việc |
| --- | --- |
| `npm run check:data` | validate toàn bộ `src/data/**`: schema, id trùng, field rỗng, `pos` lạ, `related` trỏ sai (warning) |
| `npm run data:normalize` | chuẩn hoá dữ liệu thô về schema (tách topic, thêm id, map pos, bỏ dòng trùng). Idempotent |
| `npm run data:translate` | điền `meaning`/`exampleVi` tiếng Việt bằng LLM, cache theo `item.id` |
| `npm run load:oxford` | cào lại Oxford 3000 từ nguồn Oxford + `data:normalize` |

`data:translate` đọc env (xem `.env.example`): `TRANSLATE_API_KEY`, `TRANSLATE_BASE_URL`,
`TRANSLATE_MODEL`, `TRANSLATE_CONCURRENCY`. Nguồn sự thật là chính file JSON: mục đã đủ
`meaning`/`exampleVi` (và `example` nếu cần) thì bỏ qua, không gọi API — nên clone sạch
không có cache cũng không dịch lại. `scripts/.cache/translate.json` (gitignored) chỉ là điểm
resume trong lúc chạy. Sửa tay một bản dịch trong JSON rồi đặt `"locked": true` cho entry
tương ứng trong cache (giữ nguyên text đã sửa) để script không ghi đè.
Response của model phải khớp 1:1 với batch (đủ, không trùng, không lệch chỉ số); batch lệch
bị bỏ nguyên và thử lại ở lần chạy sau.
`scripts/.cache/translate-review.md` liệt kê các mục LLM phải tự sinh ví dụ/định nghĩa.

## 7. Loader & hiển thị

- `import.meta.glob("../data/**/*.json", { eager: false })` → mỗi file là một chunk riêng.
- `loadTopics()` load song song, validate từng module, bỏ qua file lỗi, sort theo `order ?? id`.
- `useTopics()` là hook duy nhất cho cả Home và trang module (`null` khi đang load).
- Home nhóm module theo `track` (`TRACK_LABEL` + `TRACK_DESCRIPTION`, fallback về id thô nên
  track mới vẫn hiển thị).
- Nhãn của item phụ thuộc track: `labelText(item)` → `Word` (IELTS), `Word · Oxford Core`
  (Oxford), `Collocation · IELTS`, `Idiom · Speaking`.
- Progress lưu localStorage `engstack.learned.v2` = `{ moduleId: itemId[] }`. Khoá cũ
  `engstack.learned.v1` (`{ moduleId: term[] }`) được migrate một lần trong `loadTopics()`:
  chỉ chạy khi mọi module id trong khoá cũ đều load được, và chỉ xoá khoá cũ sau khi ghi v2
  thành công — module lỗi chunk không làm mất tiến độ.

## 8. Bàn giao BE / admin

`VocabItemRow = ModuleItem & { status, source, updatedAt, authorId }` là hình dạng một dòng
bảng `vocab_items`; `toRow(item)` chiếu một mục đã load thành dòng đó (`status: "published"`,
`source: "llm"` cho Oxford vì bản dịch do pipeline sinh, `"seed"` cho IELTS,
`updatedAt`/`authorId` = `null` vì DB set khi ghi).

File dữ liệu tĩnh trong repo là **seed**, không phải bản ghi runtime: chưa có SQL/migration,
chưa có API client, chưa đẩy progress lên server. Khi chốt BE thì `id` đã ổn định nên không
phải migrate khoá.

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
