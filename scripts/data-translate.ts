/**
 * scripts/data-translate.ts
 *
 * Điền tiếng Việt (`meaning`, `exampleVi`) cho các mục từ vựng còn thiếu, dùng
 * LLM qua endpoint OpenAI-compatible. Cache theo `item.id` nên chạy lại chỉ tốn
 * thời gian cho mục chưa có; entry `"locked": true` không bao giờ bị ghi đè.
 *
 * Env:
 *   TRANSLATE_API_KEY   (bắt buộc)  — fallback HERMES_CUSTOM_9ROUTER_HVANTOAN_IO_VN_API_KEY
 *   TRANSLATE_BASE_URL  (mặc định https://9router.hvantoan.xyz/v1)
 *   TRANSLATE_MODEL     (mặc định "flash")
 *   TRANSLATE_CONCURRENCY (mặc định 6)
 *
 * Usage: npm run data:translate
 */

import fs from "node:fs"
import path from "node:path"

import type { ModuleItem, TopicSource } from "../src/lib/vocab-schema.ts"

const ROOT = path.resolve(import.meta.dirname, "..")
const OXFORD_DIR = path.join(ROOT, "src", "data", "oxford")
const CACHE_DIR = path.join(ROOT, "scripts", ".cache")
const CACHE_FILE = path.join(CACHE_DIR, "translate.json")
const REVIEW_FILE = path.join(CACHE_DIR, "translate-review.md")

const BASE_URL = (process.env.TRANSLATE_BASE_URL ?? "https://9router.hvantoan.xyz/v1").replace(/\/$/, "")
const MODEL = process.env.TRANSLATE_MODEL ?? "flash"
const API_KEY = process.env.TRANSLATE_API_KEY ?? process.env.HERMES_CUSTOM_9ROUTER_HVANTOAN_IO_VN_API_KEY ?? ""
const CONCURRENCY = Number(process.env.TRANSLATE_CONCURRENCY ?? 6)
const BATCH_SIZE = 20

type CacheEntry = {
  meaning: string
  exampleVi: string
  example?: string
  locked?: boolean
}

const SYSTEM_PROMPT = `Bạn là biên tập viên từ điển Anh-Việt cho ứng dụng học từ vựng IELTS.
Nhận vào một JSON array các mục từ vựng, trả về DUY NHẤT một JSON array cùng thứ tự, mỗi phần tử:
  {"i": <chỉ số "i" của mục>, "meaning": "...", "exampleVi": "..."}
Quy tắc:
- meaning: gloss tiếng Việt NGẮN (1-6 từ), đúng nghĩa theo "pos", "definition" và "example" đã cho. KHÔNG dịch nguyên câu định nghĩa.
- exampleVi: dịch tự nhiên câu "example" sang tiếng Việt, giữ nguyên thành ngữ và sắc thái.
- Mục nào có "exampleMissing": true thì KHÔNG có câu ví dụ tiếng Anh: hãy tự viết một câu ví dụ tiếng Anh tự nhiên, ngắn, đúng trình độ CEFR của "level", và trả thêm field "example".
- Giữ nguyên tên riêng và thương hiệu.
- Không markdown, không giải thích, không văn bản ngoài JSON array.`

type Job = {
  moduleId: string
  item: ModuleItem
  needsExample: boolean
}

function readJson<T>(file: string, fallback: T): T {
  if (!fs.existsSync(file)) return fallback
  return JSON.parse(fs.readFileSync(file, "utf8")) as T
}

function writeJson(file: string, value: unknown) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8")
}

/** Model đôi khi trả NDJSON hoặc object đơn thay vì array — nhận cả ba dạng. */
function parseModelList(content: string): unknown[] {
  const trimmed = content.trim()
  const start = trimmed.indexOf("[")
  const end = trimmed.lastIndexOf("]")
  if (start !== -1 && end > start) {
    try {
      const parsed = JSON.parse(trimmed.slice(start, end + 1))
      if (Array.isArray(parsed)) return parsed
    } catch {
      /* rơi xuống parse từng dòng */
    }
  }

  const rows: unknown[] = []
  for (const line of trimmed.split("\n")) {
    const text = line.trim().replace(/^```(?:json)?/, "").replace(/,$/, "")
    if (!text.startsWith("{")) continue
    try {
      rows.push(JSON.parse(text))
    } catch {
      /* bỏ dòng hỏng, các dòng còn lại vẫn dùng được */
    }
  }
  return rows
}

async function callModel(items: unknown[]): Promise<unknown[]> {
  const response = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
      // Gateway sau Cloudflare chặn User-Agent lạ (vd. python-urllib/node).
      "User-Agent": "Mozilla/5.0 (engstack data-translate)",
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: JSON.stringify(items) },
      ],
      max_tokens: 4000,
      temperature: 0,
      stream: false,
    }),
    signal: AbortSignal.timeout(300_000),
  })

  const body = await response.text()
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${body.slice(0, 200)}`)

  let payload: { choices?: { message?: { content?: string } }[] }
  try {
    payload = JSON.parse(body)
  } catch {
    // Một số gateway trả SSE dù stream=false — lấy object JSON đầu tiên.
    const line = body.split("\n").find((l) => l.trim().startsWith("{"))
    if (!line) throw new Error(`Không parse được response: ${body.slice(0, 200)}`)
    payload = JSON.parse(line)
  }

  const content = payload.choices?.[0]?.message?.content ?? ""
  const rows = parseModelList(content)
  if (rows.length === 0) throw new Error(`Model không trả JSON dùng được: ${content.slice(0, 200)}`)
  return rows
}

function buildPayload(jobs: Job[], base: number) {
  return jobs.map((job, index) => ({
    i: base + index,
    term: job.item.term,
    pos: job.item.pos ?? [],
    level: job.item.level ?? "",
    definition: job.item.definition ?? "",
    example: job.item.example,
    ...(job.needsExample ? { exampleMissing: true } : {}),
  }))
}

/**
 * Lấy giá trị hợp lệ cho batch. Yêu cầu khớp 1:1 tuyệt đối: mọi `i` trong batch
 * phải xuất hiện đúng một lần và đủ field — thiếu/thừa/trùng thì bỏ cả batch để
 * lần chạy sau làm lại, không bao giờ ghi một gloss lệch vị trí.
 */
function parseEntries(raw: unknown, jobs: Job[], base: number): Map<number, CacheEntry> {
  if (!Array.isArray(raw)) throw new Error(`Model trả ${typeof raw}, không phải array`)
  const out = new Map<number, CacheEntry>()

  for (const row of raw) {
    if (typeof row !== "object" || row === null) continue
    const entry = row as Record<string, unknown>
    const i = Number(entry.i)
    if (!Number.isInteger(i) || i < base || i >= base + jobs.length) continue
    if (out.has(i)) throw new Error(`Model trả trùng chỉ số ${i}`)

    const meaning = typeof entry.meaning === "string" ? entry.meaning.trim() : ""
    const exampleVi = typeof entry.exampleVi === "string" ? entry.exampleVi.trim() : ""
    if (!meaning || !exampleVi) continue

    const result: CacheEntry = { meaning, exampleVi }
    if (jobs[i - base].needsExample) {
      const example = typeof entry.example === "string" ? entry.example.trim() : ""
      if (!example) continue
      result.example = example
    }
    out.set(i, result)
  }

  if (out.size !== jobs.length) {
    throw new Error(`Batch thiếu ${jobs.length - out.size}/${jobs.length} mục`)
  }
  return out
}

async function main() {
  if (!API_KEY) {
    console.error(
      "✗ Thiếu TRANSLATE_API_KEY (hoặc HERMES_CUSTOM_9ROUTER_HVANTOAN_IO_VN_API_KEY).\n" +
        "  Xem .env.example — script không tự đọc file .env.",
    )
    process.exit(1)
  }

  const moduleFiles = fs
    .readdirSync(OXFORD_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort()

  const modules = moduleFiles.map((file) => ({
    file: path.join(OXFORD_DIR, file),
    data: readJson<TopicSource>(path.join(OXFORD_DIR, file), {} as TopicSource),
  }))

  const cache = readJson<Record<string, CacheEntry>>(CACHE_FILE, {})

  const pending: Job[] = []
  for (const { data } of modules) {
    for (const item of data.items) {
      const needsExample = !item.example.trim()
      // JSON là nguồn sự thật: mục đã đủ nội dung thì không cần gọi API, kể cả
      // khi không có cache (fresh clone). Cache chỉ là điểm resume trong lần chạy.
      if (item.meaning.trim() && item.exampleVi.trim() && !needsExample) continue
      const cached = cache[item.id]
      if (cached && (needsExample ? Boolean(cached.example) : true)) continue
      pending.push({ moduleId: data.id, item, needsExample })
    }
  }

  console.log(`==> Dịch ${pending.length} mục (cache: ${Object.keys(cache).length} entry) bằng ${MODEL} qua ${BASE_URL}`)

  const batches: Job[][] = []
  for (let i = 0; i < pending.length; i += BATCH_SIZE) batches.push(pending.slice(i, i + BATCH_SIZE))

  let done = 0
  let failedBatches = 0
  let cursor = 0

  const worker = async () => {
    for (;;) {
      const index = cursor++
      if (index >= batches.length) return
      const jobs = batches[index]
      const base = index * BATCH_SIZE
      try {
        const raw = await callModel(buildPayload(jobs, base))
        const entries = parseEntries(raw, jobs, base)
        for (const [i, entry] of entries) {
          cache[jobs[i - base].item.id] = entry
        }
        done += entries.size
        writeJson(CACHE_FILE, cache)
        process.stdout.write(`\r   ${done}/${pending.length} mục đã dịch`)
      } catch (error) {
        failedBatches++
        console.warn(`\n! Batch ${index} lỗi: ${(error as Error).message}`)
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, batches.length) }, worker))
  process.stdout.write("\n")

  // Áp cache vào module + ghi lại file.
  let applied = 0
  const missing: string[] = []
  const review: string[] = [
    "# Review bản dịch tự động",
    "",
    "Các mục mà LLM phải tự sinh nội dung: ví dụ tiếng Anh thiếu trong nguồn, hoặc thiếu cả định nghĩa.",
    "Sửa tay trong file JSON rồi đặt `\"locked\": true` cho entry tương ứng trong `scripts/.cache/translate.json` để không bị ghi đè khi chạy lại.",
    "",
    "| id | term | pos | meaning | example (EN) | exampleVi |",
    "| --- | --- | --- | --- | --- | --- |",
  ]

  for (const { file, data } of modules) {
    for (const item of data.items) {
      const entry = cache[item.id]
      // `locked` = bản dịch đã sửa tay trong JSON → không ghi đè từ cache.
      if (entry && !entry.locked) {
        item.meaning = entry.meaning
        item.exampleVi = entry.exampleVi
        if (entry.example && !item.example.trim()) item.example = entry.example
        applied++
        if (entry.example || !item.definition) {
          review.push(
            `| ${item.id} | ${item.term} | ${(item.pos ?? []).join(", ")} | ${item.meaning} | ${item.example} | ${item.exampleVi} |`,
          )
        }
      }
      if (!item.meaning.trim() || !item.exampleVi.trim()) missing.push(item.id)
    }
    writeJson(file, data)
  }

  fs.writeFileSync(REVIEW_FILE, `${review.join("\n")}\n`, "utf8")

  console.log(`✓ Ghi ${applied} mục từ cache vào ${modules.length} file Oxford`)
  console.log(`  Review: ${path.relative(ROOT, REVIEW_FILE)}`)
  if (failedBatches) console.log(`! ${failedBatches} batch lỗi — chạy lại lệnh này để thử tiếp (cache giữ nguyên kết quả cũ).`)
  if (missing.length) {
    console.error(`✗ ${missing.length} mục vẫn thiếu meaning/exampleVi: ${missing.slice(0, 10).join(", ")}`)
    process.exit(1)
  }
  console.log("  Bước tiếp theo: npm run check:data")
}

await main()
