/**
 * Progress store: hai nguồn (guest localStorage / server), một API công khai.
 *
 * Guest ghi `engstack.learned.v2`; đã login chỉ đọc/ghi server (không bao giờ
 * ghi tiến độ server xuống localStorage — ngoại lệ duy nhất là hàng đợi mutation
 * lỗi `engstack.progress-sync.v1`, chỉ chứa các thay đổi chưa lên server để retry).
 * `useProgressReady()` tồn tại để page không hiển thị "0 từ" trong lúc hydrate.
 */
import { useMemo, useSyncExternalStore } from "react"

import { request } from "./api"
import {
  getAuthStatus,
  getAuthUser,
  registerSessionHandlers,
  subscribeAuth,
} from "./auth"

const KEY = "engstack.learned.v2"
/** Khoá cũ `{topicId: term[]}`; chỉ được đọc một lần để migrate sang item id. */
const LEGACY_KEY = "engstack.learned.v1"
const EVT = "engstack:progress"
const SYNC_KEY = "engstack.progress-sync.v1"

type LearnedMap = Record<string, string[]>

export type ProgressSyncIssue = {
  topicId: string
  itemId: string
  learned: boolean
  attemptedAt: number
  /** UUID của account đã tạo mutation — queue chỉ retry đúng user đó. */
  userId: string
}

type ToggleProgressResponse = {
  itemId: string
  topicId: string
  learned: boolean
}

/** Hình dạng tối thiểu để migrate v1 — không phụ thuộc type `Topic`. */
type MinimalTopic = { id: string; items: { id: string; term: string }[] }

let guestMap: LearnedMap = loadGuest()
let serverMap: LearnedMap = {}
let ready = false
let revision = 0
let restorePromise: Promise<void> | null = null
let syncIssues: ProgressSyncIssue[] = loadSyncIssues()
let syncInFlight = new Map<string, number>()
let mutationSeq = 0

function loadGuest(): LearnedMap {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed === "object" && parsed !== null)
      return parsed as LearnedMap
    return {}
  } catch {
    return {}
  }
}

function writeGuest(map: LearnedMap) {
  try {
    localStorage.setItem(KEY, JSON.stringify(map))
  } catch {
    /* storage full/denied — giữ state trong memory */
  }
}

function loadSyncIssues(): ProgressSyncIssue[] {
  try {
    const raw = localStorage.getItem(SYNC_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (issue): issue is ProgressSyncIssue =>
        typeof issue === "object" &&
        issue !== null &&
        typeof (issue as ProgressSyncIssue).topicId === "string" &&
        typeof (issue as ProgressSyncIssue).itemId === "string" &&
        typeof (issue as ProgressSyncIssue).learned === "boolean" &&
        typeof (issue as ProgressSyncIssue).attemptedAt === "number" &&
        typeof (issue as ProgressSyncIssue).userId === "string"
    )
  } catch {
    return []
  }
}

function writeSyncIssues() {
  try {
    if (syncIssues.length === 0) localStorage.removeItem(SYNC_KEY)
    else localStorage.setItem(SYNC_KEY, JSON.stringify(syncIssues))
  } catch {
    /* storage full/denied — giữ issue trong memory */
  }
}

function emit() {
  revision += 1
  window.dispatchEvent(new Event(EVT))
}

/**
 * Chuyển tiến độ đã học từ khoá `term` (v1) sang `item.id` (v2). Term không còn
 * tồn tại trong module sẽ bị bỏ — dữ liệu đã học không thể map sang mục khác.
 *
 * Khoá cũ chỉ bị xoá khi mọi topic id trong map cũ đều resolve được (nếu thiếu
 * module thì lần load này bỏ qua, không mất progress) và ghi v2 thành công.
 */
export function migrateLearnedToItemIds(modules: MinimalTopic[]) {
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

  const map = loadGuest()
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
  writeGuest(map)
  try {
    localStorage.removeItem(LEGACY_KEY)
  } catch {
    /* storage denied — v1 còn, lần sau migrate lại (idempotent) */
  }
  console.info(`[progress] Đã chuyển ${migrated} mục đã học sang khoá item.id`)
}

function readLegacy(): LearnedMap | null {
  try {
    const raw = localStorage.getItem(LEGACY_KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== "object" || parsed === null) return null
    return parsed as LearnedMap
  } catch {
    return null
  }
}

/**
 * v1 → guest v2. Chỉ fetch detail cho topic có trong legacy (thường 1-3).
 * Chạy được cho cả guest lẫn session đã login, single-flight.
 */
let migrationPromise: Promise<void> | null = null

function migrateLegacyLabels(): Promise<void> {
  if (migrationPromise) return migrationPromise
  const legacy = readLegacy()
  if (!legacy) return Promise.resolve()
  const ids = Object.keys(legacy)
  if (ids.length === 0) return Promise.resolve()

  migrationPromise = Promise.all(
    ids.map((id) => request<MinimalTopic>(`/topics/${encodeURIComponent(id)}`))
  )
    .then((details) => {
      migrateLearnedToItemIds(details)
      guestMap = loadGuest()
      emit()
    })
    .catch((error: unknown) => {
      migrationPromise = null
      console.warn("[progress] Bỏ qua migrate v1 lần này:", error)
    })

  return migrationPromise
}

const EMPTY_MAP: LearnedMap = {}
const EMPTY_IDS: readonly string[] = []

function active(): LearnedMap {
  const status = getAuthStatus()
  if (status === "authenticated") return serverMap
  if (status === "guest") return guestMap
  return EMPTY_MAP
}

function setServerItem(topicId: string, itemId: string, learned: boolean) {
  const list = serverMap[topicId] ?? []
  const next = learned
    ? [...list.filter((id) => id !== itemId), itemId]
    : list.filter((id) => id !== itemId)
  serverMap = { ...serverMap, [topicId]: next }
  emit()
}

function applyServerMutation(
  requestedTopicId: string,
  requestedId: string,
  response: ToggleProgressResponse
) {
  const nextMap = { ...serverMap }
  for (const topicId of new Set([requestedTopicId, response.topicId])) {
    const list = nextMap[topicId] ?? []
    nextMap[topicId] = list.filter(
      (id) => id !== requestedId && id !== response.itemId
    )
  }

  if (response.learned) {
    const targetList = nextMap[response.topicId] ?? []
    nextMap[response.topicId] = [
      ...targetList.filter((id) => id !== response.itemId),
      response.itemId,
    ]
  }

  serverMap = nextMap
  emit()
}

function removeSyncIssue(itemId: string) {
  const next = syncIssues.filter((issue) => issue.itemId !== itemId)
  if (next.length !== syncIssues.length) {
    syncIssues = next
    writeSyncIssues()
    emit()
  }
}

function isCurrentMutation(itemId: string, seq: number): boolean {
  return syncInFlight.get(itemId) === seq
}

async function saveToggle(
  issue: Omit<ProgressSyncIssue, "attemptedAt">,
  preserveOptimistic: boolean
) {
  const seq = ++mutationSeq
  syncInFlight.set(issue.itemId, seq)
  emit()

  try {
    const response = await request<ToggleProgressResponse>("/progress/toggle", {
      method: "PUT",
      body: JSON.stringify({ itemId: issue.itemId, learned: issue.learned }),
    })
    if (!isCurrentMutation(issue.itemId, seq)) return
    syncInFlight.delete(issue.itemId)
    applyServerMutation(issue.topicId, issue.itemId, response)
    removeSyncIssue(issue.itemId)
    emit()
  } catch (error) {
    if (!isCurrentMutation(issue.itemId, seq)) return
    syncInFlight.delete(issue.itemId)
    if (!preserveOptimistic) {
      // Lần ghi đầu thất bại: quay về trạng thái server đã xác nhận, giữ issue để retry.
      setServerItem(issue.topicId, issue.itemId, !issue.learned)
    }
    syncIssues = [
      ...syncIssues.filter((existing) => existing.itemId !== issue.itemId),
      { ...issue, attemptedAt: Date.now() },
    ]
    writeSyncIssues()
    emit()
    console.warn("[progress] Không lưu được tiến độ:", error)
  }
}

/** Thử ghi lại các thay đổi từng thất bại; an toàn khi được gọi nhiều lần. */
export async function retryProgressSync(itemId?: string): Promise<void> {
  const userId = getAuthUser()?.id ?? ""
  const due = syncIssues.filter(
    (issue) =>
      issue.userId === userId &&
      (!itemId || issue.itemId === itemId) &&
      !syncInFlight.has(issue.itemId)
  )
  await Promise.all(due.map((issue) => saveToggle(issue, true)))
}

async function importGuestProgress() {
  const itemIds = [...new Set(Object.values(guestMap).flat())]
  if (itemIds.length === 0) {
    clearGuest()
    return
  }
  await request<{ imported: number }>("/progress/import-guest", {
    method: "POST",
    body: JSON.stringify({ itemIds }),
  })
  // Chỉ xoá local sau khi server xác nhận union.
  clearGuest()
}

function clearGuest() {
  guestMap = {}
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* storage denied */
  }
}

/**
 * Điểm vào duy nhất của hydrate: v1 → guest import → `GET /progress` → ready.
 * Tuần tự, không chạy song song với import (nếu không sẽ hydrate bản trước import).
 */
export function sessionRestore(): Promise<void> {
  if (restorePromise) return restorePromise
  ready = false
  restorePromise = (async () => {
    await migrateLegacyLabels()
    await importGuestProgress()
    serverMap = (await request<LearnedMap>("/progress")) ?? {}
    ready = true
    emit()
    void retryProgressSync()
  })().catch((error: unknown) => {
    restorePromise = null
    ready = false
    emit()
    throw error
  })
  return restorePromise
}

function retryRestore() {
  if (getAuthStatus() === "authenticated" && !ready) {
    void sessionRestore().catch(() => undefined)
  }
}

registerSessionHandlers({
  onEstablished: () => {
    // Hydrate đang chạy thì không tạo vòng chờ thứ hai: nó có thể là chính
    // sessionRestore đang chờ refresh ở request bên trong (401 → refresh → đây).
    if (restorePromise) return
    void sessionRestore().catch(() => undefined)
  },
  onLost: () => {
    serverMap = {}
    restorePromise = null
    ready = false
    // Giữ syncIssues trong storage: queue thuộc về user vừa mất session và sẽ
    // retry khi đúng user đó login lại; chỉ huỷ tham chiếu in-flight.
    syncInFlight = new Map()
    guestMap = loadGuest()
    emit()
  },
})

if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key !== KEY) return
    guestMap = loadGuest()
    emit()
  })
  const retryAll = () => {
    retryRestore()
    void retryProgressSync()
  }
  window.addEventListener("online", retryAll)
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") retryAll()
  })

  // Guest cũng cần migrate v1 (không chỉ lúc đăng nhập).
  void migrateLegacyLabels()

  // Đổi nguồn (loading → guest → authenticated) cũng là một lần đổi số hiển thị.
  let lastStatus = getAuthStatus()
  subscribeAuth(() => {
    const status = getAuthStatus()
    if (status === lastStatus) return
    lastStatus = status
    emit()
  })
}

function subscribe(onStoreChange: () => void) {
  window.addEventListener(EVT, onStoreChange)
  window.addEventListener("storage", onStoreChange)
  return () => {
    window.removeEventListener(EVT, onStoreChange)
    window.removeEventListener("storage", onStoreChange)
  }
}

function getSnapshot(): number {
  return revision
}

/** Reactive: `ids` là reference ổn định giữa các lần store đổi (map thay bất biến). */
export function useLearned(topicId: string): Set<string> {
  const ids = useSyncExternalStore(
    subscribe,
    () => active()[topicId] ?? EMPTY_IDS
  )
  return useMemo(() => new Set(ids), [ids])
}

export function useTotalLearned(): number {
  useSyncExternalStore(subscribe, getSnapshot)
  return Object.values(active()).reduce((n, list) => n + list.length, 0)
}

/** `false` chỉ khi auth đang boot hoặc tiến độ server chưa hydrate xong. */
export function useProgressReady(): boolean {
  useSyncExternalStore(subscribe, getSnapshot)
  const status = getAuthStatus()
  if (status === "guest") return true
  if (status === "authenticated") return ready
  return false
}

export function useProgressSyncIssues(): ProgressSyncIssue[] {
  useSyncExternalStore(subscribe, getSnapshot)
  const userId = getAuthUser()?.id ?? ""
  return syncIssues.filter((issue) => issue.userId === userId)
}

export function useProgressSyncing(): boolean {
  useSyncExternalStore(subscribe, getSnapshot)
  return syncInFlight.size > 0
}

export function getLearned(topicId: string): Set<string> {
  return new Set(active()[topicId] ?? [])
}

/** `itemId` là `VocabItem.id` (không phải `term`). */
export function toggleLearned(topicId: string, itemId: string): boolean {
  if (getAuthStatus() !== "authenticated") {
    const list = guestMap[topicId] ?? []
    const learned = !list.includes(itemId)
    guestMap = {
      ...guestMap,
      [topicId]: learned
        ? [...list, itemId]
        : list.filter((id) => id !== itemId),
    }
    writeGuest(guestMap)
    emit()
    return learned
  }

  const list = serverMap[topicId] ?? []
  const learned = !list.includes(itemId)
  removeSyncIssue(itemId)
  setServerItem(topicId, itemId, learned)
  void saveToggle(
    { topicId, itemId, learned, userId: getAuthUser()?.id ?? "" },
    false
  )

  return learned
}
