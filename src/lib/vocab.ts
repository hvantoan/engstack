import { useEffect, useState } from "react"

import { migrateLearnedToItemIds } from "./progress"
import type { Topic, TopicSource } from "./vocab-schema"
import { validateTopicSource } from "./vocab-schema"

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

/**
 * Mọi file JSON dưới `src/data/**` là một module tự mô tả. Thêm file mới = push,
 * không phải sửa file này (pattern resolve tương đối từ `src/lib/`).
 */
const moduleLoaders = import.meta.glob<TopicSource>("../data/**/*.json", {
  eager: false,
  import: "default",
})

const moduleIds = Object.keys(moduleLoaders).map((filePath) => ({
  filePath,
  id: filePath.split("/").pop()!.replace(/\.json$/, ""),
}))

if (moduleIds.length === 0) {
  throw new Error("Không tìm thấy module dữ liệu nào trong src/data/**/*.json")
}

const loaded = new Map<string, Topic>()

function toTopic(source: TopicSource): Topic {
  return {
    ...source,
    items: source.items.map((item) => ({
      ...item,
      topicId: source.id,
      track: source.track,
    })),
  }
}

/** Load toàn bộ module hợp lệ; file sai schema bị bỏ qua kèm cảnh báo, không làm vỡ app. */
export async function loadTopics(): Promise<Topic[]> {
  const results = await Promise.all(
    moduleIds.map(async ({ filePath, id }) => {
      const cached = loaded.get(id)
      if (cached) return cached

      const source = await moduleLoaders[filePath]()
      const issues = validateTopicSource(source, id)
      if (issues.length > 0) {
        console.warn(
          `[vocab] Bỏ qua module "${id}" vì sai schema:\n` +
            issues.map((issue) => `  · ${issue.field || "module"}: ${issue.message}`).join("\n"),
        )
        return undefined
      }

      const topic = toTopic(source)
      loaded.set(id, topic)
      return topic
    }),
  )

  migrateLearnedToItemIds(results.filter((topic): topic is Topic => Boolean(topic)))

  return results
    .filter((topic): topic is Topic => Boolean(topic))
    .sort((a, b) => (a.order ?? 999) - (b.order ?? 999) || a.id.localeCompare(b.id))
}

/** React hook: `null` khi đang load. */
export function useTopics() {
  const [topics, setTopics] = useState<Topic[] | null>(null)

  useEffect(() => {
    if (typeof window === "undefined") return
    let active = true
    loadTopics()
      .then((next) => {
        if (active) setTopics(next)
      })
      .catch((error: unknown) => {
        console.error("[vocab] Không load được dữ liệu:", error)
        if (active) setTopics([])
      })
    return () => {
      active = false
    }
  }, [])

  return topics
}

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
