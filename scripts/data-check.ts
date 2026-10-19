/**
 * scripts/data-check.ts
 *
 * Kiểm tra toàn bộ dữ liệu trong `src/data/**` theo schema chuẩn trước khi
 * commit. Lỗi (exit 1): schema sai, id trùng, thiếu meaning/exampleVi, pos lạ.
 * Cảnh báo (không fail): `related[]` trỏ tới module chưa tồn tại — file mới có
 * thể được push trước khi topic tham chiếu nó xuất hiện.
 *
 * Usage: npm run check:data
 */

import fs from "node:fs"
import path from "node:path"

import {
  validateTopicSource,
  type SchemaIssue,
  type TopicSource,
} from "../src/lib/vocab-schema.ts"
import { toRow } from "../src/lib/vocab-admin.ts"

const ROOT = path.resolve(import.meta.dirname, "..")
const DATA_DIR = path.join(ROOT, "src", "data")

function moduleFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...moduleFiles(full))
    else if (entry.name.endsWith(".json")) out.push(full)
  }
  return out.sort()
}

const files = moduleFiles(DATA_DIR)
const errors: SchemaIssue[] = []
const warnings: string[] = []
const ids = new Map<string, string>()
const moduleIds = new Set(files.map((file) => path.basename(file, ".json")))
let itemCount = 0
let relatedLinks = 0

for (const file of files) {
  const id = path.basename(file, ".json")
  const raw = JSON.parse(fs.readFileSync(file, "utf8")) as unknown
  errors.push(...validateTopicSource(raw, id))

  const module = raw as TopicSource
  if (!Array.isArray(module.items)) continue

  for (const item of module.items) {
    itemCount++
    if (ids.has(item.id)) errors.push({ moduleId: id, field: "id", message: `id đã tồn tại ở ${ids.get(item.id)}` })
    else ids.set(item.id, id)

    // Chiếu sang dòng DB phải luôn có ngữ cảnh module — đây là hợp đồng với BE.
    const row = toRow({ ...item, topicId: id, track: module.track })
    if (!row.topicId || !row.track || !row.id || !row.status || !row.source) {
      errors.push({ moduleId: id, field: item.id, message: "không chiếu được sang VocabItemRow" })
    }
  }

  for (const related of module.related ?? []) {
    relatedLinks++
    if (!moduleIds.has(related)) {
      warnings.push(`${id}: related "${related}" trỏ tới module chưa tồn tại`)
    }
  }
}

const duplicateIds = itemCount - ids.size

console.log(
  `${itemCount} items · ${files.length} modules · ${duplicateIds} duplicate id · ` +
    `${errors.length} schema error · ${warnings.length} warning`,
)

for (const issue of warnings) console.warn(`! ${issue}`)
for (const issue of errors.slice(0, 40)) {
  console.error(`✗ ${issue.moduleId} ${issue.field}: ${issue.message}`)
}
if (errors.length > 40) console.error(`✗ … và ${errors.length - 40} lỗi nữa`)

if (errors.length > 0 || duplicateIds > 0) {
  console.error(`\n✗ Dữ liệu chưa hợp lệ (${errors.length} lỗi). Mỗi file JSON là một module trong src/data/<track>/<id>.json.`)
  process.exit(1)
}

console.log(`✓ Dữ liệu hợp lệ: ${itemCount} mục trong ${files.length} module, ${relatedLinks} liên kết related.`)
