/**
 * Phát âm từ vựng: ưu tiên MP3 thu sẵn trong `public/audio/` (nguồn
 * dictionaryapi.dev/Wiktionary — xem `frontend/scripts/fetch-pronunciations.ts`),
 * fallback về Web Speech API `speechSynthesis` khi term không có file.
 */
import { slug } from "./vocab-schema"

type Manifest = Record<string, string>

/**
 * Base URL chứa `manifest.json` + MP3. Prod trỏ tới Cloudflare R2 qua
 * `VITE_AUDIO_BASE_URL` (vd `https://audio.engstack.example`); rỗng → dùng
 * `public/audio/` nội bộ (dev / self-host).
 */
const AUDIO_BASE = (
  (import.meta.env.VITE_AUDIO_BASE_URL as string | undefined) ??
  `${import.meta.env.BASE_URL}audio`
).replace(/\/+$/, "")

let manifestPromise: Promise<Manifest> | null = null
let player: HTMLAudioElement | null = null

function loadManifest(): Promise<Manifest> {
  manifestPromise ??= fetch(`${AUDIO_BASE}/manifest.json`)
    .then((r) => (r.ok ? (r.json() as Promise<Manifest>) : {}))
    .catch(() => ({}))
  return manifestPromise
}

function speak(text: string, lang: string) {
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.lang = lang
  utterance.rate = 0.9
  window.speechSynthesis.speak(utterance)
}

export async function speakTerm(text: string, lang = "en-US") {
  if (typeof window === "undefined") return
  try {
    const manifest = await loadManifest()
    const file = manifest[slug(text)]
    if (file) {
      window.speechSynthesis?.cancel()
      player ??= new Audio()
      player.src = `${AUDIO_BASE}/${file}`
      player.onerror = () => speak(text, lang)
      await player.play()
      return
    }
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel()
      speak(text, lang)
    }
  } catch {
    try {
      if ("speechSynthesis" in window) speak(text, lang)
    } catch {
      // Ignore speech errors gracefully
    }
  }
}
