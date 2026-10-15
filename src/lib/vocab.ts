import topicsJson from "@/data/topics.json"

export type VocabItem = {
  term: string
  meaning: string
  example: string
  ipa: string
  label: "word" | "collocation" | "idiom"
}

export type Topic = {
  id: string
  title: string
  accent: string
  eyebrow: string
  description: string
  related: string[]
  items: VocabItem[]
}

export const topics = topicsJson as Topic[]

export function getTopic(id: string | undefined): Topic | undefined {
  return topics.find((t) => t.id === id)
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

export const LABEL_TEXT: Record<VocabItem["label"], string> = {
  word: "Word · Oxford Core",
  collocation: "Collocation · IELTS",
  idiom: "Idiom · Speaking",
}
