/**
 * Review store: phiên "Ôn hôm nay" + badge số thẻ đến hạn trên header.
 *
 * SRS chỉ chạy cho tài khoản đã đăng nhập (D2): lịch ôn sống trên server nên
 * hoạt động đa thiết bị; guest giữ 4 chế độ hiện có. Submit rating mang
 * `clientEventId` — retry/đa tab replay an toàn nhờ idempotency phía server.
 *
 * "Đã thuộc" (cờ thủ công), "lịch ôn" và "kết quả nhớ lại" là ba khái niệm
 * riêng: UI review chỉ đọc/ghi review endpoints, không đụng progress store.
 */
import { useSyncExternalStore } from "react"

import { request } from "./api"
import { getAuthStatus, subscribeAuth } from "./auth"
import type { ModuleItem } from "./vocab-schema"

export type ReviewRating = 1 | 2 | 3 | 4

export type ReviewItem = ModuleItem & {
  dueAt: string
  reviewCount: number
}

export type DueReviewResponse = {
  generatedAt: string
  /** Tổng thẻ đến hạn (có thể nhiều hơn items trả về do limit). */
  dueCount: number
  /** Tổng thẻ trong hàng đợi ôn, kể cả chưa đến hạn. */
  pendingCount: number
  nextDueAt?: string
  items: ReviewItem[]
}

export type SubmitReviewResponse = {
  itemId: string
  rating: number
  intervalDays: number
  reviewCount: number
  dueAt: string
  duplicate: boolean
}

export type ReviewSummary = {
  dueCount: number
  pendingCount: number
  nextDueAt: string | null
}

const EVT = "engstack:review"
const SESSION_LIMIT = 20

let summary: ReviewSummary | null = null
let revision = 0

function emit() {
  revision += 1
  window.dispatchEvent(new Event(EVT))
}

export function fetchDueReviews(limit = SESSION_LIMIT): Promise<DueReviewResponse> {
  return request<DueReviewResponse>(`/review/due?limit=${limit}`)
}

export function submitReviewRating(
  itemId: string,
  rating: ReviewRating,
  clientEventId: string
): Promise<SubmitReviewResponse> {
  return request<SubmitReviewResponse>("/review/submit", {
    method: "POST",
    body: JSON.stringify({ itemId, rating, clientEventId }),
  })
}

export function newClientEventId(): string {
  return crypto.randomUUID()
}

export async function refreshReviewSummary(): Promise<void> {
  if (getAuthStatus() !== "authenticated") {
    if (summary !== null) {
      summary = null
      emit()
    }
    return
  }
  try {
    const res = await fetchDueReviews(1)
    summary = {
      dueCount: res.dueCount,
      pendingCount: res.pendingCount,
      nextDueAt: res.nextDueAt ?? null,
    }
  } catch {
    /* offline — giữ summary cũ, badge chỉ là gợi ý */
  }
  emit()
}

function subscribe(onStoreChange: () => void) {
  window.addEventListener(EVT, onStoreChange)
  return () => window.removeEventListener(EVT, onStoreChange)
}

export function useReviewSummary(): ReviewSummary | null {
  useSyncExternalStore(subscribe, () => revision)
  return summary
}

if (typeof window !== "undefined") {
  // Đổi trạng thái auth (guest ↔ authenticated) → refresh badge một lần.
  let lastStatus = getAuthStatus()
  subscribeAuth(() => {
    const status = getAuthStatus()
    if (status === lastStatus) return
    lastStatus = status
    void refreshReviewSummary()
  })
  window.addEventListener("online", () => void refreshReviewSummary())
  // Thẻ đến hạn trong lúc app đang mở: poll nhẹ (limit=1) để badge cập nhật.
  window.setInterval(() => {
    if (getAuthStatus() === "authenticated") void refreshReviewSummary()
  }, 60_000)
}
