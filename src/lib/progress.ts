import { useSyncExternalStore } from "react"

const KEY = "forumflash.learned.v1"
const EVT = "forumflash:progress"

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

export function toggleLearned(topicId: string, term: string): boolean {
  const map = load()
  const list = map[topicId] ?? []
  const idx = list.indexOf(term)
  let learned: boolean
  if (idx >= 0) {
    list.splice(idx, 1)
    learned = false
  } else {
    list.push(term)
    learned = true
  }
  map[topicId] = list
  try {
    localStorage.setItem(KEY, JSON.stringify(map))
    window.dispatchEvent(new Event(EVT))
  } catch {
    /* storage full/denied — keep in-memory state */
  }
  return learned
}
