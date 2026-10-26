import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Link } from "react-router-dom"
import {
  CheckCircle2Icon,
  Clock3Icon,
  RefreshCwIcon,

  Volume2Icon,
  XCircleIcon,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { GoogleLoginButton } from "@/components/google-login-button"
import { useAuth } from "@/lib/auth"
import { labelText } from "@/lib/vocab"
import { speakTerm } from "@/lib/speech"
import { cn } from "@/lib/utils"
import {
  fetchDueReviews,
  newClientEventId,
  refreshReviewSummary,
  submitReviewRating,
  type DueReviewResponse,
  type ReviewItem,
} from "@/lib/review"

/** Binary ratings: Chưa thuộc = again (về 1 ngày), Thuộc = good (lên bậc SM-2). */
const RATING_UNKNOWN = 1
const RATING_KNOWN = 3

/** Kéo quá ngưỡng này (px) thì coi như đã quẹt. */
const SWIPE_THRESHOLD = 90

type SwipeAttempt = { itemId: string; rating: number }

function formatDueAt(value?: string | null): string {
  if (!value) return ""
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  return date.toLocaleString("vi-VN", {
    day: "numeric",
    month: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function GuestPrompt() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 px-4 py-24 text-center">
      <Badge variant="secondary" className="w-fit uppercase tracking-wide">
        Ôn tập giãn cách
      </Badge>
      <h1 className="font-heading text-2xl font-bold">Ôn hôm nay cần tài khoản</h1>
      <p className="text-sm leading-relaxed text-muted-foreground">
        Lịch ôn được lưu trên tài khoản để đồng bộ giữa các thiết bị. Đăng nhập
        để bắt đầu ôn những từ đến hạn — chế độ học thường vẫn dùng được không
        cần tài khoản.
      </p>
      <GoogleLoginButton />
      <Button variant="ghost" size="sm" nativeButton={false} render={<Link to="/" />}
        className="cursor-pointer text-muted-foreground">
        Về thư viện
      </Button>
    </div>
  )
}

function EmptyState({ data }: { data: DueReviewResponse }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 px-4 py-24 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-success/10 text-success">
        <CheckCircle2Icon className="size-6" aria-hidden />
      </span>
      <h1 className="font-heading text-2xl font-bold">Hết thẻ đến hạn hôm nay</h1>
      <p className="text-sm leading-relaxed text-muted-foreground">
        {data.pendingCount > 0 ? (
          <>
            Hàng đợi còn {data.pendingCount} thẻ.
            {data.nextDueAt ? ` Đợt ôn tiếp theo: ${formatDueAt(data.nextDueAt)}.` : ""}
          </>
        ) : (
          <>Đánh dấu "đã thuộc" trong module để từ được đưa vào lịch ôn.</>
        )}
      </p>
      <Button nativeButton={false} render={<Link to="/" />} className="cursor-pointer">
        Về thư viện
      </Button>
    </div>
  )
}

function SessionSummary({
  attempts,
  items,
  onRestart,
}: {
  attempts: SwipeAttempt[]
  items: Map<string, ReviewItem>
  onRestart: () => void
}) {
  const { known, unknown, hard } = useMemo(() => {
    let k = 0
    let u = 0
    const lapses = new Map<string, number>()
    for (const a of attempts) {
      if (a.rating === RATING_KNOWN) k += 1
      else {
        u += 1
        lapses.set(a.itemId, (lapses.get(a.itemId) ?? 0) + 1)
      }
    }
    const hard = [...lapses.entries()]
      .map(([id, n]) => ({ item: items.get(id), lapses: n }))
      .filter((e): e is { item: ReviewItem; lapses: number } => Boolean(e.item))
      .sort((a, b) => b.lapses - a.lapses)
    return { known: k, unknown: u, hard }
  }, [attempts, items])

  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-center gap-5 px-4 py-24 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-success/10 text-success">
        <CheckCircle2Icon className="size-6" aria-hidden />
      </span>
      <h1 className="font-heading text-2xl font-bold">Xong — thuộc hết rồi</h1>
      <dl className="grid w-full grid-cols-3 gap-2">
        <div className="flex flex-col items-center gap-1 rounded-lg border border-border bg-card p-3">
          <dd className="font-heading text-xl">{items.size}</dd>
          <dt className="text-xs text-muted-foreground">Thẻ</dt>
        </div>
        <div className="flex flex-col items-center gap-1 rounded-lg border border-success/40 bg-success/10 p-3">
          <dd className="font-heading text-xl text-success">{known}</dd>
          <dt className="text-xs text-success">Lượt thuộc</dt>
        </div>
        <div className="flex flex-col items-center gap-1 rounded-lg border border-destructive/40 bg-destructive/10 p-3">
          <dd className="font-heading text-xl text-destructive">{unknown}</dd>
          <dt className="text-xs text-destructive">Lượt chưa thuộc</dt>
        </div>
      </dl>
      {hard.length > 0 && (
        <div className="w-full rounded-lg border border-border bg-card p-3 text-left">
          <p className="mb-2 text-xs font-medium text-muted-foreground">
            Từ khó của phiên (hay quên nhất)
          </p>
          <ul className="flex flex-col gap-1">
            {hard.map(({ item, lapses }) => (
              <li key={item.id} className="flex items-baseline justify-between gap-2 text-sm">
                <span className="font-medium text-foreground">{item.term}</span>
                <span className="text-xs text-destructive">quên {lapses} lần</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button onClick={onRestart} className="cursor-pointer">
          <RefreshCwIcon data-icon="inline-start" />
          Kiểm tra thẻ mới đến hạn
        </Button>
        <Button variant="outline" nativeButton={false} render={<Link to="/" />} className="cursor-pointer">
          Về thư viện
        </Button>
      </div>
    </div>
  )
}
export function ReviewPage() {
  const { status } = useAuth()
  const [attempt, setAttempt] = useState(0)
  const [phase, setPhase] = useState<"loading" | "error" | "ready">("loading")
  const [data, setData] = useState<DueReviewResponse | null>(null)
  const [deck, setDeck] = useState<ReviewItem[]>([])
  const [index, setIndex] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState(false)
  const [attempts, setAttempts] = useState<SwipeAttempt[]>([])
  const [dragX, setDragX] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [itemMap, setItemMap] = useState<Map<string, ReviewItem>>(new Map())
  const retryRef = useRef<{ itemId: string; rating: number; eventId: string } | null>(null)
  const dragStart = useRef<number | null>(null)

  /** Chỉ gọi từ event handler: reset phiên rồi fetch lại queue. */
  const load = useCallback(() => {
    setPhase("loading")
    setData(null)
    setDeck([])
    setIndex(0)
    setFlipped(false)
    setSubmitError(false)
    setAttempts([])
    retryRef.current = null
    setItemMap(new Map())
    setAttempt((n) => n + 1)
  }, [])

  useEffect(() => {
    if (status !== "authenticated") return
    let cancelled = false
    fetchDueReviews()
      .then((res) => {
        if (cancelled) return
        setData(res)
        setDeck(res.items)
        setItemMap(new Map(res.items.map((it) => [it.id, it])))
        setPhase("ready")
      })
      .catch(() => {
        if (!cancelled) setPhase("error")
      })
    return () => {
      cancelled = true
    }
  }, [status, attempt])

  const item: ReviewItem | undefined = deck[index]
  const done = phase === "ready" && deck.length > 0 && index >= deck.length
  const uniqueCount = itemMap.size || deck.length

  const rate = useCallback(
    async (rating: number, reuseEventId?: string) => {
      const target = deck[index]
      if (!target || submitting) return
      setSubmitting(true)
      setSubmitError(false)
      // Mỗi lượt quẹt là một event: retry dùng lại clientEventId, còn lượt
      // mới (kể cả cùng thẻ trong vòng lặp) phải có id mới.
      const eventId = reuseEventId ?? newClientEventId()
      retryRef.current = { itemId: target.id, rating, eventId }
      try {
        await submitReviewRating(target.id, rating as 1 | 3, eventId)
        retryRef.current = null
        setAttempts((as) => [...as, { itemId: target.id, rating }])
        if (rating === RATING_UNKNOWN) {
          // Chưa thuộc → xuống cuối hàng đợi, gặp lại cho đến khi thuộc.
          setDeck((d) => [...d, target])
        }
        setIndex((i) => i + 1)
        setFlipped(false)
        setDragX(0)
        void refreshReviewSummary()
      } catch {
        setSubmitError(true)
      } finally {
        setSubmitting(false)
      }
    },
    [deck, index, submitting]
  )

  const retry = useCallback(() => {
    const last = retryRef.current
    if (!last || !item || last.itemId !== item.id) return
    void rate(last.rating, last.eventId)
  }, [item, rate])

  // Vuốt trái (xanh) = Thuộc, vuốt phải (đỏ) = Chưa thuộc.
  const onPointerDown = (e: React.PointerEvent) => {
    if (!flipped || submitting) return
    dragStart.current = e.clientX
    setDragging(true)
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }
  const onPointerMove = (e: React.PointerEvent) => {
    if (dragStart.current === null) return
    setDragX(e.clientX - dragStart.current)
  }
  const onPointerUp = () => {
    if (dragStart.current === null) return
    dragStart.current = null
    setDragging(false)
    if (Math.abs(dragX) >= SWIPE_THRESHOLD) {
      void rate(dragX < 0 ? RATING_KNOWN : RATING_UNKNOWN)
    } else {
      setDragX(0)
    }
  }

  // Bàn phím: Space lật thẻ, ← Thuộc, → Chưa thuộc, A phát âm.
  useEffect(() => {
    if (phase !== "ready" || !item || done) return
    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement) return
      switch (event.key) {
        case " ":
          event.preventDefault()
          setFlipped((f) => !f)
          break
        case "a":
        case "A":
          speakTerm(item.term)
          break
        case "ArrowLeft":
          if (flipped) void rate(RATING_KNOWN)
          break
        case "ArrowRight":
          if (flipped) void rate(RATING_UNKNOWN)
          break
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [phase, item, flipped, done, rate])

  if (status === "loading" || phase === "loading") {
    return (
      <div className="mx-auto flex max-w-4xl flex-col gap-4 px-4 py-24" aria-busy>
        <div className="h-8 w-1/3 animate-pulse rounded-md bg-muted" />
        <div className="h-64 animate-pulse rounded-xl bg-muted" />
      </div>
    )
  }

  if (status === "guest") return <GuestPrompt />

  if (phase === "error" || !data) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-start gap-3 px-4 py-24">
        <h1 className="font-heading text-2xl font-bold">Ôn hôm nay</h1>
        <p className="text-sm text-muted-foreground" role="alert">
          Không tải được hàng đợi ôn tập. Kiểm tra kết nối và thử lại.
        </p>
        <Button variant="outline" size="sm" onClick={load} className="cursor-pointer">
          <RefreshCwIcon data-icon="inline-start" />
          Thử lại
        </Button>
      </div>
    )
  }

  if (deck.length === 0) return <EmptyState data={data} />
  if (done) return <SessionSummary attempts={attempts} items={itemMap} onRestart={load} />
  if (!item) return null

  const dragIntent = dragX <= -SWIPE_THRESHOLD ? "known" : dragX >= SWIPE_THRESHOLD ? "unknown" : null
  const progress = Math.min(100, (index / Math.max(deck.length, index)) * 100)

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col items-center gap-5 px-4 py-6">
      <div className="flex w-full items-center justify-between px-2 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <Clock3Icon className="size-3.5" aria-hidden />
          Ôn hôm nay: {uniqueCount} thẻ
        </span>
        <span>
          Còn trong vòng:{" "}
          <strong className="text-foreground">{deck.length - index}</strong>
        </span>
      </div>

      <div className="relative w-full">
        <div
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          role="button"
          tabIndex={0}
          onClick={() => {
            if (dragX === 0) setFlipped((f) => !f)
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") setFlipped((f) => !f)
          }}
          aria-label="Thẻ ôn tập — chạm để lật, quẹt trái Thuộc, quẹt phải Chưa thuộc"
          aria-pressed={flipped}
          style={{
            transform: `translateX(${dragX}px) rotate(${dragX / 30}deg)`,
            transition: dragging ? undefined : "transform 180ms ease",
          }}
          className={cn(
            "group w-full cursor-pointer touch-pan-y select-none rounded-2xl text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
            dragIntent === "known" && "ring-2 ring-success",
            dragIntent === "unknown" && "ring-2 ring-destructive"
          )}
        >
          <Card className="relative flex min-h-[380px] w-full flex-col justify-between border-border/80 bg-card p-6 transition-all hover:border-primary/50 hover:shadow-md sm:min-h-[420px] sm:p-10">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Badge
                  variant="secondary"
                  className="px-2.5 py-1 font-mono text-[11px] font-semibold tracking-wide"
                >
                  {labelText(item)}
                </Badge>
                {item.lapseCount >= 2 && (
                  <Badge variant="outline" className="border-destructive/40 text-destructive">
                    Khó
                  </Badge>
                )}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={(e) => {
                  e.stopPropagation()
                  speakTerm(item.term)
                }}
                title="Nghe phát âm (Phím A)"
                aria-label={`Nghe phát âm ${item.term}`}
                className="size-9 cursor-pointer rounded-full text-muted-foreground hover:bg-primary/10 hover:text-primary"
              >
                <Volume2Icon className="size-4" />
              </Button>
            </div>

            <CardContent
              className="flex flex-1 flex-col items-center justify-center p-0 text-center"
              aria-live="polite"
            >
              {flipped ? (
                <div className="flex flex-col items-center justify-center gap-4 py-4 animate-in fade-in-50 duration-200">
                  <p className="font-mono text-xs font-medium text-primary">
                    {item.term} {item.ipa ? `· /${item.ipa}/` : ""}
                  </p>
                  <h3 className="max-w-2xl font-heading text-2xl font-bold leading-snug text-foreground sm:text-3xl lg:text-4xl">
                    {item.meaning}
                  </h3>
                  {item.definition && (
                    <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
                      {item.definition}
                    </p>
                  )}
                  {item.example && (
                    <div className="mt-3 max-w-2xl rounded-2xl border border-border/80 bg-muted/40 p-4 text-sm leading-relaxed text-muted-foreground sm:p-5 sm:text-base">
                      <p className="italic font-medium text-foreground">"{item.example}"</p>
                      {item.exampleVi && (
                        <p className="mt-2 border-t border-border/60 pt-2 text-xs not-italic text-muted-foreground sm:text-sm">
                          {item.exampleVi}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center gap-3 py-6 animate-in fade-in-50 duration-200">
                  <h2 className="font-heading text-4xl font-bold tracking-tight text-foreground sm:text-5xl lg:text-6xl">
                    {item.term}
                  </h2>
                  {item.ipa && (
                    <span className="mt-1 font-mono text-base font-medium text-primary sm:text-lg">
                      /{item.ipa}/
                    </span>
                  )}
                  <span className="mt-6 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                    Nhớ nghĩa trước, rồi nhấn chuột hoặc{" "}
                    <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px]">
                      Space
                    </kbd>{" "}
                    để lật
                  </span>
                </div>
              )}
            </CardContent>

            <div className="flex items-center justify-between border-t border-border/40 pt-3 text-[11px] text-muted-foreground">
              <span>{flipped ? "Quẹt trái Thuộc · quẹt phải Chưa thuộc" : "Mặt trước: nhớ lại nghĩa"}</span>
              <span>
                đã ôn {item.reviewCount} lần{item.lapseCount > 0 ? ` · quên ${item.lapseCount}` : ""}
              </span>
            </div>
          </Card>
        </div>
      </div>

      <Progress value={progress} className="w-full" />

      {flipped ? (
        <div className="flex w-full flex-col items-center gap-3">
          <div className="flex w-full max-w-2xl gap-2">
            <button
              type="button"
              disabled={submitting}
              onClick={() => void rate(RATING_KNOWN)}
              className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl border border-success/40 bg-success/10 px-3 py-3.5 text-sm font-medium text-success transition-colors duration-150 hover:bg-success/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-60"
            >
              <CheckCircle2Icon className="size-4" aria-hidden />
              Thuộc
              <kbd className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">←</kbd>
            </button>
            <button
              type="button"
              disabled={submitting}
              onClick={() => void rate(RATING_UNKNOWN)}
              className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-3.5 text-sm font-medium text-destructive transition-colors duration-150 hover:bg-destructive/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-60"
            >
              <XCircleIcon className="size-4" aria-hidden />
              Chưa thuộc
              <kbd className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">→</kbd>
            </button>
          </div>
          {submitError && (
            <p className="flex items-center gap-2 text-xs text-destructive" role="alert">
              Không lưu được đánh giá —{" "}
              <button type="button" onClick={retry} className="cursor-pointer underline">
                thử lại
              </button>
            </p>
          )}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          Lật thẻ rồi quẹt trái (Thuộc) hoặc phải (Chưa thuộc)
        </p>
      )}
    </div>
  )
}
