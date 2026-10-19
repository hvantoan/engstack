/**
 * Canonical vocabulary schema — một định nghĩa duy nhất cho cả hai track
 * (IELTS topics và Oxford 3000), dùng chung bởi runtime loader
 * (`src/lib/vocab.ts`) và pipeline dữ liệu (`scripts/*`).
 *
 * Module này KHÔNG được import API chỉ có trong Vite (import.meta.glob...) để
 * `node --experimental-strip-types scripts/...` load được nó.
 */

export const CEFR_LEVELS = ["A1", "A2", "B1", "B2", "C1"] as const
export type CefrLevel = (typeof CEFR_LEVELS)[number]

/** Nhãn từ loại dùng trong dữ liệu Oxford (không thu gọn về "other"). */
export const PARTS_OF_SPEECH = [
  "noun",
  "verb",
  "adjective",
  "adverb",
  "preposition",
  "pronoun",
  "conjunction",
  "determiner",
  "exclamation",
  "number",
  "ordinal number",
  "modal verb",
  "auxiliary verb",
  "linking verb",
  "definite article",
  "indefinite article",
] as const
export type PartOfSpeech = (typeof PARTS_OF_SPEECH)[number]

export const WORD_LABELS = ["word", "collocation", "idiom"] as const
export type WordLabel = (typeof WORD_LABELS)[number]

export const TRACKS = ["ielts", "oxford"] as const
export type Track = (typeof TRACKS)[number]

export const ACCENTS = ["mint", "coral", "yellow", "blue"] as const
export type AccentName = (typeof ACCENTS)[number]

/** Một mục từ vựng. `id` là khoá ổn định — progress của người dùng trỏ vào đây. */
export type VocabItem = {
  id: string
  term: string
  ipa: string
  label: WordLabel
  /** Nghĩa tiếng Việt, gloss ngắn theo sense. */
  meaning: string
  /** Câu ví dụ tiếng Anh. */
  example: string
  /** Bản dịch câu ví dụ. */
  exampleVi: string
  /** Định nghĩa tiếng Anh (chỉ Oxford). */
  definition?: string
  level?: CefrLevel
  pos?: PartOfSpeech[]
}

/** Item sau khi loader gắn ngữ cảnh module — không bao giờ ghi field này vào JSON. */
export type ModuleItem = VocabItem & { topicId: string; track: Track }

/** Envelope của một file JSON trong `src/data/**` (chưa có ngữ cảnh loader). */
export type TopicSource = {
  id: string
  track: Track
  title: string
  description: string
  eyebrow: string
  accent: AccentName
  level?: CefrLevel
  order?: number
  /** id của các module liên quan (chỉ track IELTS dùng). */
  related?: string[]
  items: VocabItem[]
}

/** Module đã load: mọi item đều biết mình thuộc module/track nào. */
export type Topic = Omit<TopicSource, "items"> & { items: ModuleItem[] }

/** Slug tất định: fold dấu, bỏ ký tự thương hiệu, gom ký tự lạ thành "-". */
export function slug(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u2018\u2019\u02bc]/g, "'")
    .replace(/[\u2122\u00ae\u00a9]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

/** id tất định của một mục: `<module>:<term-slug>[:pos-slug]`. */
export function itemId(
  moduleId: string,
  item: { term: string; pos?: PartOfSpeech[] },
): string {
  const base = `${moduleId}:${slug(item.term)}`
  return item.pos?.length ? `${base}:${item.pos.map(slug).join("-")}` : base
}

export type SchemaIssue = {
  moduleId: string
  /** Đường dẫn tới field lỗi, ví dụ `items[12].meaning`. */
  field: string
  message: string
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0
}

/**
 * Kiểm tra một file JSON có đúng schema không. Trả về danh sách lỗi rỗng nếu hợp lệ.
 * Dùng chung bởi loader runtime, script `check:data` và pipeline dịch.
 */
export function validateTopicSource(
  raw: unknown,
  expectedId: string,
): SchemaIssue[] {
  const issues: SchemaIssue[] = []
  const push = (field: string, message: string) =>
    issues.push({ moduleId: expectedId, field, message })

  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    push("", "module phải là một JSON object")
    return issues
  }
  const mod = raw as Record<string, unknown>

  if (mod.id !== expectedId) {
    push("id", `id phải bằng tên file ("${expectedId}")`)
  }
  for (const key of ["id", "title", "description", "eyebrow"] as const) {
    if (!isNonEmptyString(mod[key])) push(key, "thiếu chuỗi không rỗng")
  }
  if (!TRACKS.includes(mod.track as Track)) {
    push("track", `track phải thuộc ${TRACKS.join(" | ")}`)
  }
  if (!ACCENTS.includes(mod.accent as AccentName)) {
    push("accent", `accent phải thuộc ${ACCENTS.join(" | ")}`)
  }
  if (mod.level !== undefined && !CEFR_LEVELS.includes(mod.level as CefrLevel)) {
    push("level", `level phải thuộc ${CEFR_LEVELS.join(" | ")}`)
  }
  if (mod.order !== undefined && typeof mod.order !== "number") {
    push("order", "order phải là number")
  }
  if (
    mod.related !== undefined &&
    (!Array.isArray(mod.related) ||
      mod.related.some((r) => typeof r !== "string"))
  ) {
    push("related", "related phải là mảng string")
  }

  if (!Array.isArray(mod.items) || mod.items.length === 0) {
    push("items", "items phải là mảng không rỗng")
    return issues
  }

  const seen = new Set<string>()
  mod.items.forEach((entry, index) => {
    const at = `items[${index}]`
    if (typeof entry !== "object" || entry === null) {
      push(at, "item phải là object")
      return
    }
    const item = entry as Record<string, unknown>

    for (const key of ["id", "term", "meaning", "example", "exampleVi"] as const) {
      if (!isNonEmptyString(item[key])) push(`${at}.${key}`, "thiếu chuỗi không rỗng")
    }
    // 17 mục Oxford không có phiên âm trong nguồn — cho phép rỗng, nhưng phải là string.
    if (typeof item.ipa !== "string") push(`${at}.ipa`, "ipa phải là string (được phép rỗng)")
    if (!WORD_LABELS.includes(item.label as WordLabel)) {
      push(`${at}.label`, `label phải thuộc ${WORD_LABELS.join(" | ")}`)
    }
    if (item.level !== undefined && !CEFR_LEVELS.includes(item.level as CefrLevel)) {
      push(`${at}.level`, `level phải thuộc ${CEFR_LEVELS.join(" | ")}`)
    }
    if (item.pos !== undefined) {
      if (!Array.isArray(item.pos) || item.pos.some((p) => !PARTS_OF_SPEECH.includes(p as PartOfSpeech))) {
        push(`${at}.pos`, `pos phải là mảng thuộc ${PARTS_OF_SPEECH.length} nhãn từ loại chuẩn`)
      }
    }
    if (isNonEmptyString(item.id)) {
      if (seen.has(item.id)) push(`${at}.id`, `id trùng trong module: ${item.id}`)
      seen.add(item.id)
      if (
        isNonEmptyString(item.term) &&
        item.id !== itemId(expectedId, { term: item.term, pos: item.pos as PartOfSpeech[] })
      ) {
        push(`${at}.id`, "id không khớp term/pos (phải sinh bằng itemId())")
      }
    }
  })

  return issues
}
