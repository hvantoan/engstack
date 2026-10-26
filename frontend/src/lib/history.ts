/**
 * B10: tìm kiếm xuyên module + điểm tiếp tục học + timeline hoạt động.
 *
 * Position: tài khoản lưu server (PUT /state/position) để resume đa thiết
 * bị; guest lưu localStorage. Session events chỉ ghi cho tài khoản — guest
 * không có timeline phía server.
 */
import { getAuthStatus, getAuthUser } from "./auth"
import { request } from "./api"
import type { ModuleItem, CefrLevel, Track } from "./vocab-schema"

export type SearchItem = ModuleItem & { topicTitle: string }

export type SearchResponse = {
  query: string
  total: number
  page: number
  perPage: number
  items: SearchItem[]
}

export type Position = {
  topicId: string
  mode: string
  itemId?: string
  updatedAt: string
}

export type HistoryItem = {
  kind: "review" | "learn" | "unlearn" | "session_start" | "session_end"
  itemId?: string
  term?: string
  topicId: string
  mode?: string
  rating?: number
  at: string
}

export function searchItems(params: {
  q: string
  track?: Track | ""
  level?: CefrLevel | ""
  page?: number
  perPage?: number
}): Promise<SearchResponse> {
  const sp = new URLSearchParams()
  sp.set("q", params.q)
  if (params.track) sp.set("track", params.track)
  if (params.level) sp.set("level", params.level)
  sp.set("page", String(params.page ?? 1))
  sp.set("perPage", String(params.perPage ?? 20))
  return request<SearchResponse>(`/search/items?${sp.toString()}`)
}

// Key theo userId: guest chỉ đọc key guest, account chỉ đọc key của chính
// mình — tránh rò rỉ điểm học của tài khoản trước sang người dùng sau trên
// cùng thiết bị.
function positionKey(): string {
  const user = getAuthUser()
  return "engstack.position.v1:" + (user ? user.id : "guest")
}

function readLocalPosition(): Position | null {
  try {
    const raw = localStorage.getItem(positionKey())
    return raw ? (JSON.parse(raw) as Position) : null
  } catch {
    return null
  }
}

function writeLocalPosition(pos: Position) {
  try {
    localStorage.setItem(positionKey(), JSON.stringify(pos))
  } catch {
    /* storage denied — server copy đã đủ */
  }
}

/** Điểm học gần nhất: server khi đăng nhập, localStorage cho guest. */
export async function fetchPosition(): Promise<Position | null> {
  if (getAuthStatus() === "authenticated") {
    try {
      return await request<Position>("/state/position")
    } catch {
      return readLocalPosition()
    }
  }
  return readLocalPosition()
}

/** Fire-and-forget: vị trí học là gợi ý tiện ích, không phải dữ liệu gốc. */
export function savePosition(pos: Omit<Position, "updatedAt">) {
  writeLocalPosition({ ...pos, updatedAt: new Date().toISOString() })
  if (getAuthStatus() !== "authenticated") return
  void request<Position>("/state/position", {
    method: "PUT",
    body: JSON.stringify(pos),
  }).catch(() => {
    /* offline — localStorage giữ bản gần nhất */
  })
}

/** Log một mốc phiên học (mở/kết thúc chế độ) — idempotent qua clientEventId. */
export function postSessionEvent(
  type: "session_start" | "session_end",
  topicId: string,
  mode: string,
  clientEventId: string
) {
  if (getAuthStatus() !== "authenticated") return
  void request("/events", {
    method: "POST",
    body: JSON.stringify({ type, topicId, mode, clientEventId }),
  }).catch(() => {})
}

export function newSessionEventId(): string {
  return crypto.randomUUID()
}

export function fetchHistory(limit = 50): Promise<{ items: HistoryItem[] }> {
  return request(`/history?limit=${limit}`)
}
