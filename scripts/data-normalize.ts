/**
 * scripts/data-normalize.ts
 *
 * Chuyển dữ liệu thô về đúng một format duy nhất (`TopicSource` trong
 * `frontend/src/lib/vocab-schema.ts`), chia mỗi topic thành một file JSON riêng dưới
 * `data/<track>/<id>.json`.
 *
 *  A. `data/topics.json` (một file 20 topic) → 20 file `data/topics/<id>.json`
 *     rồi xoá file gốc.
 *  B. `data/oxford/oxford-<level>.json` (mảng item thô) → envelope + id + pos
 *     chuẩn hoá + bỏ các dòng trùng `term`+`pos`.
 *
 * Idempotent: phần nào đã đúng format thì bỏ qua. Chạy lại sau `npm run load:oxford`
 * để đưa output của pipeline nguồn về format chuẩn.
 *
 * Usage: npm run data:normalize
 */

import fs from "node:fs"
import path from "node:path"

import {
  PARTS_OF_SPEECH,
  itemId,
  type AccentName,
  type CefrLevel,
  type PartOfSpeech,
  type TopicSource,
  type VocabItem,
} from "../frontend/src/lib/vocab-schema.ts"

const ROOT = path.resolve(import.meta.dirname, "..")
const DATA_DIR = path.join(ROOT, "data")
const TOPICS_DIR = path.join(DATA_DIR, "topics")
const OXFORD_DIR = path.join(DATA_DIR, "oxford")

const POS_ALIASES: Record<string, PartOfSpeech> = {
  n: "noun",
  v: "verb",
  adj: "adjective",
  adv: "adverb",
  prep: "preposition",
  pron: "pronoun",
  conj: "conjunction",
  det: "determiner",
  exclam: "exclamation",
  num: "number",
  "modal v": "modal verb",
  "auxiliary v": "auxiliary verb",
}

const LEVEL_META: Record<
  CefrLevel,
  { order: number; accent: AccentName; title: string; description: string }
> = {
  A1: {
    order: 1,
    accent: "mint",
    title: "Oxford 3000 — A1 Beginner",
    description: "Từ vựng nền tảng: giao tiếp hằng ngày, gia đình, đồ vật quen thuộc.",
  },
  A2: {
    order: 2,
    accent: "coral",
    title: "Oxford 3000 — A2 Elementary",
    description: "Từ vựng sơ cấp: sinh hoạt, công việc đơn giản, sở thích cá nhân.",
  },
  B1: {
    order: 3,
    accent: "yellow",
    title: "Oxford 3000 — B1 Intermediate",
    description: "Từ vựng trung cấp giúp diễn đạt ý kiến và giao tiếp tự tin.",
  },
  B2: {
    order: 4,
    accent: "blue",
    title: "Oxford 3000 — B2 Upper-Intermediate",
    description: "Từ vựng trên trung cấp cho thảo luận học thuật và chủ đề trừu tượng.",
  },
  C1: {
    order: 5,
    accent: "blue",
    title: "Oxford 3000 — C1 Advanced",
    description: "Từ vựng nâng cao cho diễn đạt chính xác và linh hoạt.",
  },
}

/** Nhãn từ loại bị dính vào cuối headword khi parse PDF (vd. "per cent noun.,"). */
const POS_WORD =
  /ordinal number|modal verb|auxiliary verb|linking verb|definite article|indefinite article|noun|verb|adjective|adverb|preposition|pronoun|conjunction|determiner|exclamation|number|modal v|auxiliary v|adj|adv|prep|pron|conj|det|exclam|num|n|v/i.source

const TRAILING_POS = new RegExp(
  `[\\s,]+(?:${POS_WORD})[.,]*(?:[\\s,/]+(?:${POS_WORD})[.,]*)*$`,
  "i",
)

const unknownPos = new Set<string>()
const suspiciousTerms = new Set<string>()
let droppedDuplicates = 0

function cleanTerm(term: string): string {
  const trimmed = term.trim()
  // Chỉ headword dính nhãn từ loại từ PDF mới kết thúc bằng "." hoặc "," — term sạch
  // (kể cả "round number", "a number of") không bao giờ bị cắt.
  if (!/[.,]\s*$/.test(trimmed)) return trimmed
  let out = trimmed
  for (;;) {
    const next = out.replace(TRAILING_POS, "").trim()
    if (next === out) break
    out = next
  }
  suspiciousTerms.add(term)
  return out
}

function normalizePos(raw: string): PartOfSpeech[] {
  const out: PartOfSpeech[] = []
  for (const piece of raw.split(/[,/]/)) {
    const token = piece.trim().replace(/\.$/, "").toLowerCase()
    if (!token) continue
    const mapped =
      POS_ALIASES[token] ??
      ((PARTS_OF_SPEECH as readonly string[]).includes(token)
        ? (token as PartOfSpeech)
        : undefined)
    if (!mapped) {
      unknownPos.add(raw)
      continue
    }
    if (!out.includes(mapped)) out.push(mapped)
  }
  return out
}

function writeJson(file: string, value: unknown) {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8")
}

function readJson(file: string): unknown {
  return JSON.parse(fs.readFileSync(file, "utf8"))
}

type RawOxfordItem = {
  term: string
  meaning?: string
  example?: string
  ipa?: string
  label?: string
  level?: CefrLevel
  pos?: string
  senseHint?: string
}

/**
 * Chuẩn hoá danh sách item Oxford thô → mục theo schema, đã bỏ trùng `term`+`pos`.
 * `senseHint` của nguồn PDF KHÔNG được chuyển sang schema chuẩn: đúng ở 10 cặp
 * trùng nó bị gán lệch sang sense khác, còn ở các mục còn lại thì nghĩa đã rõ
 * ràng nên hint không mang thêm thông tin dùng được.
 */
function toItems(moduleId: string, raw: RawOxfordItem[]): VocabItem[] {
  const seen = new Set<string>()
  const items: VocabItem[] = []

  for (const entry of raw) {
    const term = cleanTerm(entry.term)
    const pos = normalizePos(entry.pos ?? "")
    const key = `${term.toLowerCase()}|${pos.join("-")}`
    if (seen.has(key)) {
      // Bản ghi trùng: cùng term + pos + definition/example/ipa, chỉ khác senseHint
      // vốn lấy từ một sense khác của từ → bỏ.
      droppedDuplicates++
      continue
    }
    seen.add(key)

    items.push({
      id: itemId(moduleId, { term, pos }),
      term,
      ipa: entry.ipa ?? "",
      label: "word",
      // `meaning` là tiếng Việt (script data:translate điền); định nghĩa tiếng Anh
      // của nguồn chuyển sang `definition`.
      meaning: "",
      example: entry.example ?? "",
      exampleVi: "",
      ...(entry.meaning ? { definition: entry.meaning } : {}),
      ...(entry.level ? { level: entry.level } : {}),
      ...(pos.length ? { pos } : {}),
    })
  }

  return items
}

function normalizeTopics(): number {
  const monolith = path.join(DATA_DIR, "topics.json")
  if (!fs.existsSync(monolith)) {
    console.log("• topics.json không còn — bỏ qua bước tách topic.")
    return 0
  }

  const topics = readJson(monolith) as TopicSource[]
  fs.mkdirSync(TOPICS_DIR, { recursive: true })

  topics.forEach((topic, index) => {
    const items: VocabItem[] = topic.items.map((item) => ({
      id: itemId(topic.id, item),
      term: item.term,
      ipa: item.ipa,
      label: item.label,
      meaning: item.meaning,
      example: item.example,
      exampleVi: item.exampleVi ?? "",
    }))

    const module: TopicSource = {
      id: topic.id,
      track: "ielts",
      order: index + 1,
      title: topic.title,
      description: topic.description,
      eyebrow: topic.eyebrow,
      accent: topic.accent,
      related: topic.related ?? [],
      items,
    }
    writeJson(path.join(TOPICS_DIR, `${topic.id}.json`), module)
  })

  fs.rmSync(monolith)
  console.log(`• Đã tách ${topics.length} topic → data/topics/<id>.json và xoá topics.json`)
  return topics.length
}

function normalizeOxford(): number {
  if (!fs.existsSync(OXFORD_DIR)) return 0
  let count = 0

  for (const level of Object.keys(LEVEL_META) as CefrLevel[]) {
    const file = path.join(OXFORD_DIR, `oxford-${level.toLowerCase()}.json`)
    if (!fs.existsSync(file)) continue

    const raw = readJson(file)
    if (!Array.isArray(raw)) {
      console.log(`• oxford-${level.toLowerCase()}.json đã đúng format — bỏ qua.`)
      continue
    }

    const id = `oxford-${level.toLowerCase()}`
    const meta = LEVEL_META[level]
    const module: TopicSource = {
      id,
      track: "oxford",
      level,
      order: meta.order,
      title: meta.title,
      description: meta.description,
      eyebrow: `OXFORD 3000 · CEFR ${level}`,
      accent: meta.accent,
      items: toItems(id, raw as RawOxfordItem[]),
    }
    writeJson(file, module)
    console.log(`• oxford-${level.toLowerCase()}.json: ${raw.length} → ${module.items.length} mục`)
    count += module.items.length
  }

  return count
}

const topicCount = normalizeTopics()
const oxfordCount = normalizeOxford()

if (unknownPos.size) {
  console.error(`✗ Nhãn từ loại không map được (bổ sung vào POS_ALIASES):\n   ${[...unknownPos].join("\n   ")}`)
}
if (suspiciousTerms.size) {
  console.log(`! Term cần soi lại: ${[...suspiciousTerms].join(", ")}`)
}

console.log(
  `\n✓ Chuẩn hoá xong: ${topicCount} topic IELTS + ${oxfordCount} mục Oxford` +
    (droppedDuplicates ? ` (bỏ ${droppedDuplicates} dòng trùng term+pos)` : ""),
)
console.log("  Bước tiếp theo: npm run data:translate rồi npm run check:data")

if (unknownPos.size) process.exit(1)
