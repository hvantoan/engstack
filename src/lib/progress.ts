import { useSyncExternalStore } from "react"

import type { Topic } from "./vocab-schema"

const KEY = "engstack.learned.v2"
/** Khoá cũ `{topicId: term[]}`; chỉ được đọc một lần để migrate sang item id. */
const LEGACY_KEY = "engstack.learned.v1"
const EVT = "engstack:progress"

type LearnedMap = Record<string, string[]>

function load(): LearnedMap {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    if (typeof parsed === "object" && parsed !== null) return parsed as LearnedMap
    return {}
  } catch {
    return {}
  }
}

function write(map: LearnedMap) {
  try {
    localStorage.setItem(KEY, JSON.stringify(map))
    window.dispatchEvent(new Event(EVT))
  } catch {
    /* storage full/denied — keep in-memory state */
  }
}

/**
 * Chuyển tiến độ đã học từ khoá `term` (v1) sang `item.id` (v2). Term không còn
 * tồn tại trong module sẽ bị bỏ — dữ liệu đã học không thể map sang mục khác.
 *
 * Khoá cũ chỉ bị xoá khi (a) mọi topic id trong map cũ đều có module tương ứng
 * (nếu một chunk lỗi thì lần load này bỏ qua, không mất progress) và (b) ghi v2
 * thành công.
 */
export function migrateLearnedToItemIds(modules: Topic[]) {
  let legacy: LearnedMap
  try {
    const raw = localStorage.getItem(LEGACY_KEY)
    if (!raw) return
    legacy = JSON.parse(raw) as LearnedMap
  } catch {
    return
  }
  if (typeof legacy !== "object" || legacy === null) return

  const loaded = new Set(modules.map((topic) => topic.id))
  if (!Object.keys(legacy).every((topicId) => loaded.has(topicId))) return

  const map = load()
  let migrated = 0
  for (const topic of modules) {
    const terms = legacy[topic.id]
    if (!Array.isArray(terms)) continue
    const ids = map[topic.id] ?? []
    for (const term of terms) {
      const item = topic.items.find((candidate) => candidate.term === term)
      if (item && !ids.includes(item.id)) {
        ids.push(item.id)
        migrated++
      }
    }
    map[topic.id] = ids
  }

  if (migrated === 0) return
  write(map)
  try {
    localStorage.removeItem(LEGACY_KEY)
  } catch {
    /* storage denied — v1 còn, lần sau migrate lại (idempotent) */
  }
  console.info(`[progress] Đã chuyển ${migrated} mục đã học sang khoá item.id`)
}

function subscribe(onStoreChange: () => void) {
  window.addEventListener(EVT, onStoreChange)
  window.addEventListener("storage", onStoreChange)
  return () => {
    window.removeEventListener(EVT, onStoreChange)
    window.removeEventListener("storage", onStoreChange)
  }
}

function getSnapshot(): string {
  return localStorage.getItem(KEY) ?? "{}"
}

/** Reactive: re-reads localStorage whenever learned state changes. */
export function useLearned(topicId: string): Set<string> {
  const raw = useSyncExternalStore(subscribe, getSnapshot)
  let map: LearnedMap = {}
  try {
    map = JSON.parse(raw)
  } catch {
    /* corrupt value treated as empty */
  }
  return new Set(map[topicId] ?? [])
}

export function useTotalLearned(): number {
  const raw = useSyncExternalStore(subscribe, getSnapshot)
  let map: LearnedMap = {}
  try {
    map = JSON.parse(raw)
  } catch {
    /* corrupt value treated as empty */
  }
  return Object.values(map).reduce((n, list) => n + list.length, 0)
}

export function getLearned(topicId: string): Set<string> {
  return new Set(load()[topicId] ?? [])
}

/** `itemId` là `VocabItem.id` (không phải `term`). */
export function toggleLearned(topicId: string, itemId: string): boolean {
  const map = load()
  const list = map[topicId] ?? []
  const idx = list.indexOf(itemId)
  let learned: boolean
  if (idx >= 0) {
    list.splice(idx, 1)
    learned = false
  } else {
    list.push(itemId)
    learned = true
  }
  map[topicId] = list
  write(map)
  return learned
}
