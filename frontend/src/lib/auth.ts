/**
 * Auth store: access token chỉ trong memory, refresh token trong localStorage.
 *
 * Refresh token của backend là single-use (`token_service.go`): replay một token
 * đã rotate sẽ revoke toàn bộ session của user. Vì vậy mọi lần refresh đi qua
 * `navigator.locks("engstack:refresh")` + single-flight promise, và trong lock
 * luôn đọc lại storage để adopt token mà tab khác vừa rotate.
 *
 * ponytail: lock dựa trên Web Locks API. Trình duyệt không có `navigator.locks`
 * rơi về gọi trực tiếp (chấp nhận hai tab có thể refresh đua) — chỉ thêm mutex
 * localStorage khi thực sự cần hỗ trợ trình duyệt cũ.
 */
import { useSyncExternalStore } from "react"

import {
  ApiError,
  request,
  setTokenProvider,
  setUnauthorizedHandler,
} from "./api"

export type AuthUser = {
  id: string
  email: string
  name: string
  avatarUrl?: string
}

export type AuthStatus = "loading" | "guest" | "authenticated"

export type AuthState = {
  status: AuthStatus
  user: AuthUser | null
}

type StoredSession = {
  refreshToken: string
  user: AuthUser
  rotatedAt: number
}

type TokenPair = {
  access_token: string
  refresh_token: string
  expires_in: number
  user: AuthUser
}

type RefreshResponse = {
  access_token: string
  refresh_token: string
  expires_in: number
}

const AUTH_KEY = "engstack.auth.v1"
const LOCK_NAME = "engstack:refresh"

let state: AuthState = { status: "loading", user: null }
let accessToken: string | null = null
let expiresAt = 0
let refreshToken: string | null = null
let refreshPromise: Promise<boolean> | null = null
let refreshTimer: number | null = null
let bootstrapped = false

let onSessionEstablished: (() => Promise<void> | void) | null = null
let onSessionLost: (() => void) | null = null

const listeners = new Set<() => void>()

export function registerSessionHandlers(handlers: {
  onEstablished: () => Promise<void> | void
  onLost: () => void
}) {
  onSessionEstablished = handlers.onEstablished
  onSessionLost = handlers.onLost
}

export function getAuthStatus(): AuthStatus {
  return state.status
}

export function getAuthUser(): AuthUser | null {
  return state.user
}

/** Progress store nghe cùng nguồn để số đã thuộc đổi khi auth đổi. */
export function subscribeAuth(listener: () => void): () => void {
  return subscribe(listener)
}

function emit() {
  for (const listener of listeners) listener()
}

function setState(next: AuthState) {
  state = next
  emit()
}

function readStored(): StoredSession | null {
  try {
    const raw = localStorage.getItem(AUTH_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as StoredSession
    return typeof parsed?.refreshToken === "string" ? parsed : null
  } catch {
    return null
  }
}

function writeStored(session: StoredSession) {
  try {
    localStorage.setItem(AUTH_KEY, JSON.stringify(session))
  } catch {
    /* storage denied — session vẫn sống trong memory tới khi reload */
  }
}

/** Chỉ xoá khi token đang lưu đúng là token đã gửi (tab khác có thể vừa rotate). */
function removeStoredIfMatches(sent: string | null) {
  const stored = readStored()
  if (stored && sent && stored.refreshToken !== sent) return
  try {
    localStorage.removeItem(AUTH_KEY)
  } catch {
    /* storage denied */
  }
}

function stopTimer() {
  if (refreshTimer !== null) {
    window.clearTimeout(refreshTimer)
    refreshTimer = null
  }
}

/** Refresh chủ động ở 80% tuổi thọ access token (≈12 phút với TTL 15 phút). */
function scheduleRefresh() {
  stopTimer()
  if (!refreshToken || !expiresAt) return
  const delay = Math.max(30_000, Math.round((expiresAt - Date.now()) * 0.8))
  refreshTimer = window.setTimeout(() => {
    refreshTimer = null
    void refreshOnce("timer")
  }, delay)
}

function adoptAccessToken(
  pair: { access_token: string; expires_in: number },
  user: AuthUser,
  nextRefreshToken: string
) {
  accessToken = pair.access_token
  expiresAt = Date.now() + pair.expires_in * 1000
  refreshToken = nextRefreshToken
  writeStored({ refreshToken: nextRefreshToken, user, rotatedAt: Date.now() })
  scheduleRefresh()
}

function clearMemory() {
  accessToken = null
  expiresAt = 0
  refreshToken = null
  stopTimer()
}

function withLock<T>(fn: () => Promise<T>): Promise<T> {
  if (typeof navigator === "undefined" || !navigator.locks) return fn()
  return navigator.locks.request(LOCK_NAME, fn)
}

function isDeadToken(error: unknown): boolean {
  return error instanceof ApiError && error.status === 401
}

async function establishSession(user: AuthUser | null) {
  setState({ status: "authenticated", user })
  try {
    await onSessionEstablished?.()
  } catch {
    /* progress store tự retry qua online/visibilitychange */
  }
}

/** Dùng refresh token đã có ở tab khác; access token sẽ lấy ở request kế tiếp. */
async function adoptStored(stored: StoredSession) {
  clearMemory()
  refreshToken = stored.refreshToken
  await establishSession(stored.user)
}

/**
 * Một đường refresh duy nhất cho cả app.
 *
 * `mode: "boot"` — lỗi bất kỳ (401/5xx/mạng) đều xoá token đã gửi rồi về guest.
 * `mode: "timer"` — lỗi mạng/5xx giữ nguyên phiên, thử lại ở tick sau; chỉ xoá
 * khi token chết (401).
 */
function refreshOnce(mode: "boot" | "timer"): Promise<boolean> {
  if (refreshPromise) return refreshPromise

  const sent = refreshToken ?? readStored()?.refreshToken ?? null
  if (!sent) {
    clearMemory()
    setState({ status: "guest", user: null })
    return Promise.resolve(false)
  }

  refreshPromise = (async () => {
    try {
      const adopted = await withLock(async () => {
        const stored = readStored()
        // Tab khác đã rotate trước khi ta vào lock → adopt, không gọi API.
        if (stored && stored.refreshToken !== sent) return stored

        const pair = await request<RefreshResponse>("/auth/refresh", {
          method: "POST",
          body: JSON.stringify({ refresh_token: sent }),
        })
        const user = stored?.user ??
          state.user ?? { id: "", email: "", name: "" }
        adoptAccessToken(pair, user, pair.refresh_token)
        return null
      })

      if (adopted) await adoptStored(adopted)
      else await establishSession(state.user)
      return true
    } catch (error) {
      const stored = readStored()
      if (stored && stored.refreshToken !== sent) {
        // Tab khác vừa rotate: token ta gửi đã chết, nhưng session còn sống.
        await adoptStored(stored)
        return true
      }
      if (mode === "timer" && !isDeadToken(error)) {
        scheduleRefresh()
        return false
      }
      removeStoredIfMatches(sent)
      clearMemory()
      setState({ status: "guest", user: null })
      onSessionLost?.()
      return false
    } finally {
      refreshPromise = null
    }
  })()

  return refreshPromise
}

export function bootstrapAuth(): void {
  if (bootstrapped) return
  bootstrapped = true

  const stored = readStored()
  if (!stored) {
    setState({ status: "guest", user: null })
    return
  }

  refreshToken = stored.refreshToken
  setState({ status: "loading", user: stored.user })
  void refreshOnce("boot")
}

export async function loginWithGoogle(idToken: string): Promise<void> {
  setState({ status: "loading", user: null })
  const pair = await request<TokenPair>("/auth/google", {
    method: "POST",
    body: JSON.stringify({ id_token: idToken }),
  })
  adoptAccessToken(pair, pair.user, pair.refresh_token)
  // Chỉ công bố authenticated sau khi tiến độ server đã hydrate xong.
  try {
    await onSessionEstablished?.()
  } catch {
    /* vẫn authenticated; progress hiển thị — cho tới lần retry sau */
  }
  setState({ status: "authenticated", user: pair.user })
}

export async function logout(): Promise<void> {
  const sent = refreshToken ?? readStored()?.refreshToken ?? null
  if (refreshPromise) await refreshPromise.catch(() => false)

  clearMemory()
  removeStoredIfMatches(sent)
  setState({ status: "guest", user: null })
  onSessionLost?.()

  if (sent) {
    void request("/auth/logout", {
      method: "POST",
      body: JSON.stringify({ refresh_token: sent }),
    }).catch(() => undefined)
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function useAuth(): AuthState {
  return useSyncExternalStore(subscribe, () => state)
}

setTokenProvider(() => accessToken)
setUnauthorizedHandler(() => refreshOnce("timer"))

if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key !== AUTH_KEY) return
    if (event.newValue === null) {
      // Logout ở tab khác: về guest ngay, không chờ access token hết hạn.
      clearMemory()
      setState({ status: "guest", user: null })
      onSessionLost?.()
      return
    }
    const stored = readStored()
    if (!stored || stored.refreshToken === refreshToken) return
    void adoptStored(stored)
  })

  import.meta.hot?.dispose(() => {
    stopTimer()
    bootstrapped = false
  })
}
