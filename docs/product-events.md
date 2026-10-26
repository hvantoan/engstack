# Product event contract — tối thiểu cho engstack

Tài liệu này là hợp đồng dữ liệu trước khi thêm analytics. Chưa có collector trong code;
mọi instrumentation sau này phải tuân theo contract này để báo cáo retention và lộ trình ôn tập
không phụ thuộc cách đặt tên ad-hoc.

## Nguyên tắc

- Event chỉ mô tả hành vi học; không gửi nội dung cá nhân, email, tên, token hoặc IP từ client.
- `occurredAt` là ISO-8601 UTC do client tạo; server có thể thêm `receivedAt`.
- `sessionId` là UUID random trong tab/session, không persist sang thiết bị.
- `userKey` chỉ là UUID nội bộ sau login; guest dùng `anonymousKey` random trong browser và
  không cố fingerprint thiết bị.
- `itemId`/`topicId` dùng ID canonical. Nếu client chỉ có alias, resolve trước khi ghi event.

## Envelope bắt buộc

| field | kiểu | ghi chú |
| --- | --- | --- |
| `name` | string | snake_case, một trong các event dưới |
| `occurredAt` | string | ISO-8601 UTC |
| `sessionId` | string | UUID random của phiên |
| `userKey` | string | UUID người dùng; bỏ trống nếu guest |
| `anonymousKey` | string | UUID browser; bỏ trống sau khi event đã gắn `userKey` |
| `contentVersion` | string | `VITE_CONTENT_VERSION` tại thời điểm học |
| `client` | object | `{ appVersion, platform, locale }` |
| `properties` | object | payload theo từng event |

## Event tối thiểu

| event | trigger | properties bắt buộc |
| --- | --- | --- |
| `topic_viewed` | mở `/topic/{id}` | `topicId`, `track`, `itemCount` |
| `learning_session_started` | bắt đầu một mode trong topic | `topicId`, `track`, `mode`, `queueSize`, `source` |
| `card_viewed` | render một thẻ/mục | `topicId`, `track`, `mode`, `itemId`, `position` |
| `item_marked_learned` | bấm đã thuộc/chưa thuộc thành công server hoặc guest | `topicId`, `track`, `itemId`, `learned`, `syncState` |
| `answer_submitted` | nộp đáp án quiz/write/match | `topicId`, `track`, `mode`, `itemId`, `result`, `attempt`, `durationMs` |
| `learning_session_completed` | hết queue hoặc người học kết thúc | `topicId`, `track`, `mode`, `seenCount`, `correctCount`, `durationMs`, `completion` |
| `progress_sync_failed` | mutation lưu tiến độ thất bại | `topicId`, `itemId`, `learned`, `errorKind`, `willRetry` |
| `progress_imported` | import tiến độ guest sau login thành công | `importedCount`, `submittedCount`, `deviceCount` |

`mode` chỉ nhận `learn | quiz | write | match | list`. `result` chỉ nhận `correct | incorrect |`
`skipped`. `syncState` chỉ nhận `guest_local | queued | confirmed | failed`.

## Đo lường tối thiểu

- Activation: `learning_session_started` trong 24h đầu sau login/import.
- Retention: có ≥1 `learning_session_started` trong ngày 1/7/28.
- Chất lượng nhớ: `answer_submitted.result = correct` ở lần thử lại sau ≥1 ngày.
- Độ tin cậy tiến độ: `progress_sync_failed` / `item_marked_learned` và tỷ lệ retry thành công.
- Guest → login: `progress_imported.importedCount`, bỏ qua ID không hợp lệ khi phân tích.

## Bảo mật và retention

- Không đưa `term`, `meaning`, `example`, đáp án người viết hoặc raw user-agent vào `properties`.
- Không gửi event khi mutation tiến độ chưa rõ trạng thái; `item_marked_learned.syncState`
  phải phản ánh `queued/failed` thay vì suy diễn đã lưu.
- Giữ raw event tối đa 13 tháng; aggregate theo ngày không giới hạn nếu đã ẩn danh.
- Khi xoá tài khoản, xoá `userKey` khỏi raw event và giữ chỉ aggregate không định danh.
