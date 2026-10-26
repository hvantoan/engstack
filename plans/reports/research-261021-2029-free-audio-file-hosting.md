# Research: Nền tảng lưu file audio miễn phí cho engstack

**Thời gian:** 21/10/2026, 20:29 (Asia/Saigon)
**Nhu cầu:** Host 3.451 file MP3 (~42 MB, mỗi file ~12 KB) phục vụ playback trực tiếp trong web app (GET → `<audio>`), băng thông khó lường trước, không muốn commit binary vào git repo chính.

## Kết luận

**Cloudflare R2 là lựa chọn tốt nhất** nếu chấp nhận tạo một tài khoản Cloudflare: 10 GB storage miễn phí, **egress miễn phí hoàn toàn** (điểm duy nhất trong các phương án — quan trọng vì audio playback chính là egress), CDN toàn cầu, S3-compatible. Nếu muốn **zero-setup, không tài khoản mới**: đẩy audio lên một **GitHub repo riêng + jsDelivr CDN** — miễn phí, không giới hạn băng thông công bố, URL vĩnh viễn, nhưng chịu ràng buộc repo public và giới hạn ~1 GB/repo.

---

## Bảng so sánh

| Nền tảng | Storage free | Egress/băng thông free | CDN | Ghi chú |
|---|---|---|---|---|
| **Cloudflare R2** | 10 GB | **Không giới hạn, $0** | Có (Cloudflare edge) | 10M read + 1M write ops/tháng free. Cần account + gắn public domain. Phù hợp nhất cho audio streaming. |
| **GitHub repo + jsDelivr** | ~1 GB/repo (soft) | Không giới hạn công bố | Có (jsDelivr global) | File ≤ 50 MB, repo public. URL dạng `cdn.jsdelivr.net/gh/user/repo@tag/file.mp3`. Free vĩnh viễn cho open-source. |
| **GitHub Releases** | Không giới hạn thực tế | Cao, không công bố cap | Không CDN | File ≤ 2 GB/asset. Dùng được nhưng không có edge cache, latency cao hơn cho file nhỏ nhiều request. |
| **Supabase Storage** | 1 GB | 5 GB + 5 GB cached/tháng | Smart CDN | Egress free tier nhỏ — 12 KB × nghe nhiều từ/người dùng sẽ chạm 5 GB khi ~400k lượt nghe. Project free bị pause sau 1 tuần không hoạt động. Không chọn. |
| **Backblaze B2 + Cloudflare** | 10 GB | Free qua Bandwidth Alliance với Cloudflare | Gián tiếp | Cần ghép 2 dịch vụ, phức tạp hơn R2 thuần. |
| **Firebase Storage (Spark)** | 5 GB | 1 GB/**ngày** | Có | ~30 GB/tháng egress — ổn nếu traffic nhỏ, nhưng rủi ro hết quota giữa ngày; cần project Google. |
| **Netlify/Vercel (bundle vào site)** | — | 100 GB/tháng | Có | Deploy audio cùng frontend; nhưng 42 MB binary vào git + mọi deploy tải lại. Chỉ hợp nếu chấp nhận commit audio. |

## Phân tích nhanh

### R2 — khuyến nghị nếu có tài khoản Cloudflare
Audio playback = egress nặng và khó dự đoán. R2 là phương án free duy nhất có **egress không tính phí**, nên scale traffic không lo vỡ quota. Free tier 10 GB chứa 42 MB hiện tại dư sức cho mở rộng gấp 200 lần. Upload một lần bằng `rclone`/`aws s3` (S3-compatible), gắn public bucket hoặc custom domain, frontend chỉ đổi base URL trong `speech.ts`.

### GitHub + jsDelivr — khuyến nghị nếu muốn zero-infra
Tạo repo riêng `engstack-audio` (public), push 3.451 MP3 + manifest, tag release. File truy cập qua `https://cdn.jsdelivr.net/gh/<user>/engstack-audio@v1/<slug>.mp3`. Không cần tài khoản nào ngoài GitHub đang có. Hạn chế: repo public (file audio không nhạy cảm — không vấn đề), soft cap ~1 GB/repo, jsDelivr chỉ phục vụ file ≤ 50 MB (của ta ~12 KB — không sao). Đây là phương án KISS nhất vì stack hiện tại đã là git.

### Vì sao không Supabase
1 GB storage + 10 GB egress/tháng chia cho file 12 KB: ~800k lượt phát là hết quota, và project free bị **pause sau 7 ngày không hoạt động** — nguy cơ audio chết âm thầm. Không hợp với nội dung public tĩnh.

## Kiến trúc đề xuất (cả 2 phương án)

```
speech.ts
   │ manifest[slug] có?
   ▼
new Audio(`${AUDIO_BASE}/${file}`)     AUDIO_BASE =
   │ R2:   https://audio.<domain>/...
   │ jsd:  https://cdn.jsdelivr.net/gh/<user>/engstack-audio@v1/
   ▼ fallback
speechSynthesis (đã có sẵn)
```

Chỉ cần đổi `AUDIO_BASE` trong `speech.ts` (env `VITE_AUDIO_BASE_URL`) — manifest và cơ chế fallback giữ nguyên.

## Next steps

1. Quyết định: **R2** (nếu đã/sẵn sàng có Cloudflare) hay **jsDelivr** (nhanh nhất, chỉ cần GitHub).
2. Nếu jsDelivr: tạo repo `engstack-audio` public → `git init && git add public/audio && git tag v1.0.0 && push` → set `VITE_AUDIO_BASE_URL=https://cdn.jsdelivr.net/gh/<user>/engstack-audio@v1.0.0`.
3. Nếu R2: tạo bucket → upload bằng `rclone copy public/audio r2:engstack-audio` → bật public access/custom domain → set `VITE_AUDIO_BASE_URL`.
4. Cập nhật `speech.ts` đọc base URL từ `import.meta.env.VITE_AUDIO_BASE_URL` (fallback về `BASE_URL + "audio/"` cho dev local).
5. Gỡ `frontend/public/audio/` khỏi deploy artifact nếu đã host ngoài.

## Câu hỏi còn mở

- Traffic nghe audio dự kiến? Nếu < ~50 GB/tháng thì Vercel/Netlify cùng site vẫn đủ — có thể khỏi cần dịch vụ riêng.
- Repo engstack-audio public được không (audio CC-free do Edge TTS tự sinh — không vấn đề license).

## Sources

- [Cloudflare R2 Pricing](https://developers.cloudflare.com/r2/pricing/) — free tier 10 GB, egress $0 (cập nhật 10/2026)
- [Cloudflare pricing summary](https://www.cloudflare.com/pricing.md)
- [jsDelivr — free CDN for GitHub/npm, no bandwidth limit](https://github.com/jsDelivr/jsDelivr)
- [Supabase Pricing](https://supabase.com/pricing) · [Storage egress docs](https://supabase.com/docs/guides/storage/serving/bandwidth)
- [Automated hosting with jsDelivr (giới hạn file 50 MB)](https://engineered.at/articles/automated-screenshot-hosting-with-jsdelivr)
- [Hosting Modern Web Apps for Free 2025](https://btheo.com/posts/free-hosting-web-apps-2025/)
