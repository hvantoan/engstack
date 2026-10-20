/**
 * Ranh giới dữ liệu cho tầng admin/BE. File này KHÔNG được import từ đường
 * runtime của app — mọi field quản trị ở đây là thứ DB set, không phải thứ
 * nội dung tĩnh trong git mang theo.
 */

import type { ModuleItem } from "./vocab-schema"

export type VocabItemStatus = "draft" | "published"
export type VocabItemSource = "seed" | "llm" | "manual"

/** Một dòng bảng `vocab_items` khi đẩy dữ liệu tĩnh xuống BE. */
export type VocabItemRow = ModuleItem & {
  status: VocabItemStatus
  source: VocabItemSource
  /** DB set khi ghi; seed để null để không mang timestamp giả vào git. */
  updatedAt: string | null
  authorId: string | null
}

/**
 * Chiếu một mục đã load thành dòng DB. `source` mặc định: nội dung Oxford có
 * `meaning`/`exampleVi` do pipeline dịch sinh ra (`llm`), nội dung IELTS là
 * biên tập tay (`seed`).
 */
export function toRow(
  item: ModuleItem,
  source: VocabItemSource = item.track === "oxford" ? "llm" : "seed",
): VocabItemRow {
  return { ...item, status: "published", source, updatedAt: null, authorId: null }
}
