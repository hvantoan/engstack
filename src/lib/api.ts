/**
 * Lớp HTTP duy nhất tới backend Go. Không thư viện: `fetch` + một wrapper.
 *
 * Auth store cắm vào qua `setTokenProvider`/`setUnauthorizedHandler` để tránh
 * import vòng `api ↔ auth`.
 */
const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "/api/v1"

export class ApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = "ApiError"
    this.status = status
  }
}

let tokenProvider: () => string | null = () => null
/** Trả `true` khi đã refresh xong và request nên được replay đúng một lần. */
let unauthorizedHandler: (() => Promise<boolean>) | null = null

export function setTokenProvider(provider: () => string | null) {
  tokenProvider = provider
}

export function setUnauthorizedHandler(handler: () => Promise<boolean>) {
  unauthorizedHandler = handler
}

function send(path: string, init: RequestInit): Promise<Response> {
  const headers = new Headers(init.headers)
  if (init.body !== undefined) headers.set("Content-Type", "application/json")
  const token = tokenProvider()
  if (token) headers.set("Authorization", `Bearer ${token}`)
  return fetch(`${API_BASE}${path}`, { ...init, headers })
}

async function toError(res: Response): Promise<ApiError> {
  let message = `HTTP ${res.status}`
  try {
    const body: unknown = await res.json()
    if (typeof body === "object" && body !== null && "error" in body) {
      const value = (body as { error: unknown }).error
      if (typeof value === "string" && value) message = value
    }
  } catch {
    /* body không phải JSON — giữ message mặc định */
  }
  return new ApiError(res.status, message)
}

export async function request<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  let res = await send(path, init)

  // `/auth/*` tự quản lý token; replay ở đây sẽ đệ quy refresh.
  if (res.status === 401 && !path.startsWith("/auth/")) {
    if (await unauthorizedHandler?.()) res = await send(path, init)
  }

  if (!res.ok) throw await toError(res)
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}
