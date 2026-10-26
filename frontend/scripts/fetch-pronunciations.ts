/**
 * frontend/scripts/fetch-pronunciations.ts
 *
 * Sinh MP3 phát âm cho toàn bộ term trong `data/**` bằng Microsoft Edge TTS
 * (neural voice, miễn phí, không cần key) qua package `msedge-tts`. File lưu
 * vào `frontend/public/audio/` kèm `manifest.json` dạng
 * `{ [termSlug]: "file.mp3" }`. Idempotent: file đã tồn tại thì bỏ qua.
 *
 * Giọng mặc định `en-GB-SoniaNeural` (IELTS → UK English), rate -10% cho học
 * viên. Ghi đè bằng env `AUDIO_VOICE`, `AUDIO_RATE`.
 *
 * Usage: npm run fetch:audio   (chạy từ frontend/)
 */

import fs from "node:fs"
import path from "node:path"

import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts"

import { slug, type TopicSource } from "../src/lib/vocab-schema.ts"

const ROOT = path.resolve(import.meta.dirname, "..", "..")
const DATA_DIR = path.join(ROOT, "data")
const OUT_DIR = path.join(ROOT, "frontend", "public", "audio")
const VOICE = process.env.AUDIO_VOICE ?? "en-GB-SoniaNeural"
const RATE = process.env.AUDIO_RATE ?? "-10%"
const CONCURRENCY = 4
const MAX_RETRY = 3

function* moduleFiles(dir: string): Generator<string> {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) yield* moduleFiles(full)
    else if (entry.name.endsWith(".json")) yield full
  }
}

function collectTerms(): Map<string, string> {
  const terms = new Map<string, string>()
  for (const file of moduleFiles(DATA_DIR)) {
    const source = JSON.parse(fs.readFileSync(file, "utf8")) as TopicSource
    for (const item of source.items) terms.set(slug(item.term), item.term)
  }
  return terms
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function synthesize(termSlug: string, term: string): Promise<void> {
  const tts = new MsEdgeTTS()
  await tts.setMetadata(VOICE, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3)
  const tmpDir = path.join(OUT_DIR, ".tmp", termSlug)
  fs.mkdirSync(tmpDir, { recursive: true })
  try {
    const { audioFilePath } = await tts.toFile(tmpDir, term, { rate: RATE })
    fs.renameSync(audioFilePath, path.join(OUT_DIR, `${termSlug}.mp3`))
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  }
}

async function synthesizeRetry(termSlug: string, term: string): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await synthesize(termSlug, term)
    } catch (err) {
      if (attempt >= MAX_RETRY) throw err
      await sleep(1000 * attempt)
    }
  }
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true })
  const terms = collectTerms()
  console.log(`${terms.size} term duy nhất — voice=${VOICE} rate=${RATE}`)

  const manifestPath = path.join(OUT_DIR, "manifest.json")
  const manifest: Record<string, string> = fs.existsSync(manifestPath)
    ? JSON.parse(fs.readFileSync(manifestPath, "utf8"))
    : {}

  const pending = [...terms].filter(
    ([termSlug]) =>
      !(
        manifest[termSlug] &&
        fs.existsSync(path.join(OUT_DIR, manifest[termSlug]))
      ),
  )
  console.log(`Cần sinh: ${pending.length}, đã có: ${terms.size - pending.length}`)

  let done = 0
  let failed = 0
  const queue = [...pending]

  async function worker() {
    for (;;) {
      const next = queue.shift()
      if (!next) return
      const [termSlug, term] = next
      try {
        await synthesizeRetry(termSlug, term)
        manifest[termSlug] = `${termSlug}.mp3`
      } catch (err) {
        failed++
        console.error(`FAIL ${term}: ${(err as Error).message}`)
      }
      done++
      if (done % 100 === 0) {
        fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2))
        console.log(`[${done}/${pending.length}] failed=${failed}`)
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker))
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2))
  console.log(`Xong: ${done - failed}/${pending.length} sinh mới, failed=${failed}`)
}

main()
