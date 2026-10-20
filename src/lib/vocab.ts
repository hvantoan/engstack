/**
 * Nhãn/màu UI của track và accent. Dữ liệu từ vựng giờ do API phục vụ
 * (`src/lib/content.ts`); `src/data/**` chỉ còn là seed cho backend.
 */
export type {
  AccentName,
  CefrLevel,
  ModuleItem,
  PartOfSpeech,
  Topic,
  TopicSource,
  Track,
  VocabItem,
  WordLabel,
} from "./vocab-schema"
export { itemId, slug } from "./vocab-schema"

/** Accent palette cycle → semantic chart tokens. */
export const ACCENT_CLASS: Record<string, string> = {
  mint: "text-chart-2",
  coral: "text-chart-4",
  yellow: "text-chart-3",
  blue: "text-chart-1",
}

export const ACCENT_BG: Record<string, string> = {
  mint: "bg-chart-2/15",
  coral: "bg-chart-4/15",
  yellow: "bg-chart-3/15",
  blue: "bg-chart-1/15",
}

/** Track label; track lạ (file mới push) vẫn render được bằng id thô. */
export const TRACK_LABEL: Record<string, string> = {
  ielts: "IELTS Academic",
  oxford: "Oxford 3000 Core",
}

export const TRACK_DESCRIPTION: Record<string, string> = {
  ielts: "20 chủ đề học thuật B2–C1, mỗi chủ đề 200 mục từ.",
  oxford: "Từ vựng nền tảng A1–B2 theo chuẩn Oxford 3000.",
}

/** Nhãn hiển thị của một mục — phụ thuộc track, không chỉ `label`. */
export function labelText(item: { track: string; label: string }): string {
  if (item.label === "collocation") return "Collocation · IELTS"
  if (item.label === "idiom") return "Idiom · Speaking"
  return item.track === "oxford" ? "Word · Oxford Core" : "Word"
}
