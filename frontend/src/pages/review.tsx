import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Link } from "react-router-dom"
import {
  CheckCircle2Icon,
  Clock3Icon,
  MinusCircleIcon,
  RefreshCwIcon,
  RotateCcwIcon,
  Volume2Icon,
  ZapIcon,
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
  type ReviewRating,
} from "@/lib/review"

const RATINGS: { rating: ReviewRating; label: string; hint: string; icon: typeof CheckCircle2Icon }[] = [
  { rating: 1, label: "Lại", hint: "quên hẳn", icon: RotateCcwIcon },
  { rating: 2, label: "Khó", hint: "nhớ khó khăn", icon: MinusCircleIcon },
  { rating: 3, label: "Tốt", hint: "nhớ được", icon: CheckCircle2Icon },
  { rating: 4, label: "Dễ", hint: "nhớ ngay", icon: ZapIcon },
]

const RATING_STYLE: Record<ReviewRating, string> = {
  1: "border-destructive/40 bg-destructive/10 text-destructive hover:bg-destructive/20",
  2: "border-border bg-muted/60 text-foreground hover:bg-muted",
  3: "border-success/40 bg-success/10 text-success hover:bg-success/20",
  4: "border-primary/40 bg-primary/10 text-primary hover:bg-primary/20",
}

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
  ratings,
  onRestart,
}: {
  ratings: ReviewRating[]
  onRestart: () => void
}) {
  const counts = useMemo(() => {
    const by: Record<ReviewRating, number> = { 1: 0, 2: 0, 3: 0, 4: 0 }
    for (const r of ratings) by[r] += 1
    return by
  }, [ratings])

  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-center gap-5 px-4 py-24 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-success/10 text-success">
        <CheckCircle2Icon className="size-6" aria-hidden />
      </span>
      <h1 className="font-heading text-2xl font-bold">Xong phiên ôn tập</h1>
      <dl className="grid w-full grid-cols-4 gap-2">
        {RATINGS.map(({ rating, label, icon: Icon }) => (
          <div
            key={rating}
            className="flex flex-col items-center gap-1 rounded-lg border border-border bg-card p-3"
          >
            <Icon className="size-4 text-muted-foreground" aria-hidden />
            <dd className="font-heading text-xl">{counts[rating]}</dd>
            <dt className="text-xs text-muted-foreground">{label}</dt>
          </div>
        ))}
      </dl>
      <p className="text-sm text-muted-foreground">
        Tổng {ratings.length} thẻ. Thẻ "Lại" sẽ quay lại sớm hơn trong các lượt ôn tới.
      </p>
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
  const [index, setIndex] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState(false)
  const [ratings, setRatings] = useState<ReviewRating[]>([])
  const eventIds = useRef(new Map<string, string>())

  /** Chỉ gọi từ event handler: reset phiên rồi fetch lại queue. */
  const load = useCallback(() => {
    setPhase("loading")
    setData(null)
    setIndex(0)
    setFlipped(false)
    setSubmitError(false)
    setRatings([])
    eventIds.current.clear()
    setAttempt((n) => n + 1)
  }, [])

  useEffect(() => {
    if (status !== "authenticated") return
    let cancelled = false
    fetchDueReviews()
      .then((res) => {
        if (cancelled) return
        setData(res)
        setPhase("ready")
      })
      .catch(() => {
        if (!cancelled) setPhase("error")
      })
    return () => {
      cancelled = true
    }
  }, [status, attempt])

  const items = data?.items ?? []
  const item: ReviewItem | undefined = items[index]
  const done = phase === "ready" && items.length > 0 && index >= items.length

  const rate = useCallback(
    async (rating: ReviewRating) => {
      if (!item || submitting) return
      setSubmitting(true)
      setSubmitError(false)
      let eventId = eventIds.current.get(item.id)
      if (!eventId) {
        eventId = newClientEventId()
        eventIds.current.set(item.id, eventId)
      }
      try {
        await submitReviewRating(item.id, rating, eventId)
        setRatings((rs) => [...rs, rating])
        setIndex((i) => i + 1)
        setFlipped(false)
        void refreshReviewSummary()
      } catch {
        setSubmitError(true)
      } finally {
        setSubmitting(false)
      }
    },
    [item, submitting]
  )

  // Bàn phím: Space lật thẻ, 1-4 đánh giá, A phát âm.
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
        case "1":
        case "2":
        case "3":
        case "4":
          if (flipped) void rate(Number(event.key) as ReviewRating)
          break
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [phase, item, flipped, done, rate])

  if (status === "loading") {
    return (
      <div className="mx-auto flex max-w-4xl flex-col gap-4 px-4 py-24" aria-busy>
        <div className="h-8 w-1/3 animate-pulse rounded-md bg-muted" />
        <div className="h-64 animate-pulse rounded-xl bg-muted" />
      </div>
    )
  }

  if (status === "guest") return <GuestPrompt />

  if (phase === "loading") {
    return (
      <div className="mx-auto flex max-w-4xl flex-col gap-4 px-4 py-24" aria-busy>
        <div className="h-8 w-1/3 animate-pulse rounded-md bg-muted" />
        <div className="h-64 animate-pulse rounded-xl bg-muted" />
      </div>
    )
  }

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

  if (items.length === 0) return <EmptyState data={data} />
  if (done) return <SessionSummary ratings={ratings} onRestart={load} />
  if (!item) return null

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col items-center gap-5 px-4 py-6">
      <div className="flex w-full items-center justify-between px-2 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <Clock3Icon className="size-3.5" aria-hidden />
          Ôn hôm nay: {data.dueCount} thẻ đến hạn
        </span>
        <span>
          Thẻ:{" "}
          <strong className="text-foreground">{index + 1}</strong> / {items.length}
        </span>
      </div>

      <button
        type="button"
        onClick={() => setFlipped((f) => !f)}
        aria-label="Lật thẻ ôn tập"
        aria-pressed={flipped}
        className="group w-full cursor-pointer rounded-2xl text-left transition-transform focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <Card className="relative flex min-h-[380px] w-full flex-col justify-between border-border/80 bg-card p-6 transition-all hover:border-primary/50 hover:shadow-md sm:min-h-[420px] sm:p-10">
          <div className="flex items-center justify-between">
            <Badge
              variant="secondary"
              className="px-2.5 py-1 font-mono text-[11px] font-semibold tracking-wide"
            >
              {labelText(item)}
            </Badge>
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
            <span>{flipped ? "Mặt sau: tự chấm mức nhớ" : "Mặt trước: nhớ lại nghĩa"}</span>
            <span>đã ôn {item.reviewCount} lần</span>
          </div>
        </Card>
      </button>

      <Progress value={((index + 1) / items.length) * 100} className="w-full" />

      {flipped ? (
        <div className="flex w-full flex-col items-center gap-3">
          <div className="flex w-full max-w-2xl grid-cols-4 gap-2 sm:grid">
            {RATINGS.map(({ rating, label, hint, icon: Icon }) => (
              <button
                key={rating}
                type="button"
                disabled={submitting}
                onClick={() => void rate(rating)}
                className={cn(
                  "flex flex-1 cursor-pointer flex-col items-center gap-1 rounded-xl border px-3 py-3 text-sm font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-60",
                  RATING_STYLE[rating]
                )}
              >
                <Icon className="size-4" aria-hidden />
                {label}
                <span className="text-[10px] font-normal opacity-70">{hint}</span>
                <kbd className="rounded bg-muted px-1 py-0.5 font-mono text-[10px] text-muted-foreground">
                  {rating}
                </kbd>
              </button>
            ))}
          </div>
          {submitError && (
            <p className="flex items-center gap-2 text-xs text-destructive" role="alert">
              Không lưu được đánh giá — nhấn lại nút mức nhớ để thử lại.
            </p>
          )}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">Lật thẻ để tự chấm mức nhớ (1–4)</p>
      )}
    </div>
  )
}
