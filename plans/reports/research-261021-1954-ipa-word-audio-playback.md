# Research: Phát âm từ vựng qua loa (IPA → Audio) cho engstack

**Thời gian nghiên cứu:** 21/10/2026, 19:54 (Asia/Saigon)
**Phạm vi:** Cách hiện thực nút loa để người học nghe phát âm từ vựng IELTS (4.000 từ, 20 chủ đề) trong web app React + Vite, không backend.

## Kết luận nhanh

IPA không thể "đọc thành tiếng" trực tiếp — mọi phương án đều phát **từ gốc (headword)**, còn IPA chỉ là text hiển thị. Vì bộ từ vựng của engstack là **cố định (4.000 từ)**, phương án tốt nhất là **bundle sẵn file MP3 phát âm thật** (lấy từ dictionaryapi.dev/Wiktionary một lần lúc build), với **Web Speech API `speechSynthesis` làm fallback** cho từ thiếu audio. Không cần backend, không cần API key, không phụ thuộc chất lượng giọng của từng thiết bị.

---

## So sánh các phương án

### 1. Web Speech API — `speechSynthesis` (trình duyệt, free)

```ts
const utter = new SpeechSynthesisUtterance(word);
utter.lang = "en-GB"; // hoặc "en-US"
utter.rate = 0.9;     // chậm hơn cho học viên
speechSynthesis.speak(utter);
```

- **Ưu:** Zero dependency, zero cost, hỗ trợ ~96% trình duyệt (Baseline từ 2018). Một dòng code là chạy.
- **Khuyết — nghiêm trọng cho app học phát âm:**
  - Chất lượng giọng **không đồng nhất theo thiết bị/OS**. iOS trả về danh sách giọng "ảo" — nhiều giọng en-US nhưng thực tế chỉ phát một giọng mặc định; từ iOS 16 giọng English thường nghe "muffled, nasal".
  - Safari: `getVoices()` trả rỗng khi mới load, phải chờ `voiceschanged`; speech dừng khi app vào background trên iOS.
  - Không kiểm soát được accent chuẩn (UK/US) — người học IELTS cần giọng nhất quán.
- **Vai trò phù hợp:** fallback, không phải giải pháp chính.

### 2. Audio thật từ dictionary API — khuyến nghị chính

**Free Dictionary API** (`https://api.dictionaryapi.dev/api/v2/entries/en/{word}`): free, không cần key, CORS mở. Trả `phonetics[]` gồm IPA text + URL MP3 phát âm thật (nguồn Wiktionary/Wikimedia, license BY-SA / BY 3.0 US — cần ghi attribution nếu redistribute).

```json
"phonetics": [
  { "text": "/həˈləʊ/", "audio": "https://api.dictionaryapi.dev/media/pronunciations/en/hello-uk.mp3" },
  { "text": "/həˈloʊ/", "audio": "" }
]
```

- **Ưu:** giọng người/native nhất quán, cùng một âm trên mọi thiết bị; có cả UK/US/AU cho nhiều từ.
- **Khuyết:** coverage không 100% — `audio` có thể rỗng với từ ít phổ biến; URL cũ thiếu scheme `https:` (bug đã biết, phải normalize); audio từ Wikimedia nên chất lượng không đều giữa các từ.
- **Lưu ý legal:** audio gắn license CC BY / BY-SA từng file (field `license` + `sourceUrl` trong response) — bundle vào app cần attribution.

**Vì bộ từ cố định → không nên gọi API runtime.** Nên fetch 1 lần cho cả 4.000 từ lúc build/script, lưu MP3 vào `frontend/public/audio/` (hoặc bundle vào data), phát qua `<audio>`/`new Audio()`. Ước tính ~4.000 file × ~30–50KB ≈ 120–200MB nếu bundle hết — nên cân nhắc chỉ bundle + lazy-load theo chủ đề, hoặc host riêng/CDN.

**Nguồn audio trả phí/đăng ký (nếu cần chất lượng cao hơn):**
- Merriam-Webster Dictionary API: free non-commercial, 1.000 query/ngày, có audio — nhưng kỳ hạn non-commercial và key server-side.
- Oxford Dictionaries API: trả phí, có IPA + audio.
- Cambridge API: trả phí, có audio helper.

### 3. Cloud/neural TTS API (synthesize theo yêu cầu)

- **QuickPronounce API**: GET trả base64 MP3 (Google WaveNet), kèm IPA + syllable stress, US+UK; free key by email, 30 req/phút — public testing, không SLA.
- **eidosSpeech** (Edge neural voices): 30 req/ngày free tier.
- **Google Cloud TTS / Azure / ElevenLabs / Cartesia**: chất lượng cao nhất, có phí, cần key server-side.

Phù hợp nếu muốn pre-generate MP3 chất lượng neural cho 4.000 từ (gọi 1 lần offline, bundle như phương án 2) — đây là cách tốt nhất để có âm **nhất quán + đầy đủ 100% coverage** nếu chấp nhận giọng máy.

### 4. On-device neural TTS (Kokoro, v.v.)

Kokoro Web chạy TTS bằng WebGPU ngay trong browser, MIT, self-hostable. Hay nhưng nặng (model download) cho use case chỉ cần phát từ đơn — overkill, bỏ qua trừ khi muốn offline-first hoàn toàn.

---

## Kiến trúc đề xuất (KISS)

```
[Speaker button] → audioMap[word] có MP3?
                       │ có                │ không
                       ▼                   ▼
              new Audio(url).play()   speechSynthesis fallback
              (file bundle/CDN)        (en-GB, rate 0.9)
```

1. **Script one-off** (Node, chạy lúc build hoặc manual): duyệt 4.000 từ → gọi dictionaryapi.dev → tải MP3 (ưu tiên UK cho IELTS) + ghi IPA vào data. Từ thiếu audio → đánh dấu `audioFallback: true` hoặc generate bằng neural TTS.
2. **Runtime**: component `PronounceButton` (icon `Volume2` từ lucide-react, `cursor-pointer`, focus ring, min size để tránh CLS) — `new Audio()` nếu có file, else `speechSynthesis`.
3. Cache `Audio` object hoặc preload theo chủ đề đang học.

## Next steps

1. Viết script `scripts/fetch-pronunciations.ts`: đọc word list, gọi dictionaryapi.dev, tải MP3 + IPA về `frontend/public/audio/` và cập nhật word data (xử lý URL thiếu `https:`, retry 404).
2. Kiểm coverage thực tế trên 4.000 từ; quyết định fallback cho phần thiếu: speechSynthesis (free) hay pre-gen neural TTS (QuickPronounce/eidosSpeech free quota không đủ 4.000 — cần trả phí hoặc tự host).
3. Implement `PronounceButton` component + hook `usePronunciation(word)`.
4. Thêm attribution cho audio CC BY/BY-SA (footer hoặc trang credits).

## Câu hỏi còn mở

- Coverage thực tế của dictionaryapi.dev trên danh sách 4.000 từ IELTS (B2–C1, nhiều từ học thuật có thể thiếu audio) — cần chạy script thử.
- Dung lượng bundle 4.000 MP3 có chấp nhận được, hay host riêng/lazy-load theo topic?
- Yêu cầu accent: chỉ UK (IELTS chuẩn), hay cả US?

## Sources

- [MDN: SpeechSynthesis](https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesis) · [Can I use: speechSynthesis 96.39%](https://caniuse.com/mdn-api_window_speechsynthesis)
- [Free Dictionary API](https://dictionaryapi.dev/) · [Wiktionary audio + license fields](https://github.com/meetDeveloper/freeDictionaryAPI/issues/134) · [Audio URL missing scheme #103](https://github.com/meetDeveloper/freeDictionaryAPI/issues/103)
- [talkrapp: speechSynthesis lessons learned (iOS lies about voices)](https://talkrapp.com/speechSynthesis.html) · [iOS 16 voice quality regression](https://stackoverflow.com/questions/73926314/ios-16-poor-speechsynthesisutterance-voice-quality) · [Safari speech synthesis bugs](https://weboutloud.io/bulletin/speech_synthesis_in_safari/)
- [Merriam-Webster API](https://www.dictionaryapi.com/) · [Oxford API](https://developer.oxforddictionaries.com/dictionary-api) · [Cambridge API](https://dictionary-api.cambridge.org/api/resources)
- [QuickPronounce API](https://www.quickpronounce.site/api/pronunciation-api) · [eidosSpeech](https://eidosspeech.xyz/) · [Kokoro Web TTS](https://github.com/hukkum/kokoro-tts)
