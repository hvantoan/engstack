import { useEffect, useMemo, useRef, useState } from "react"
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  BookmarkCheckIcon,
  CheckCircle2Icon,
  FilterIcon,
  RotateCcwIcon,
  ShuffleIcon,
  Volume2Icon,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { LABEL_TEXT, type Topic } from "@/lib/vocab"
import { getLearned, toggleLearned } from "@/lib/progress"
import { speakTerm } from "@/lib/speech"
import { cn } from "@/lib/utils"

export function LearnMode({ topic }: { topic: Topic }) {
  const allItems = topic.items
  const [unlearnedOnly, setUnlearnedOnly] = useState(false)
  const [learned, setLearned] = useState<Set<string>>(() =>
    getLearned(topic.id)
  )

  // Filter items based on user choice (all or unlearned only)
  const items = useMemo(() => {
    if (!unlearnedOnly) return allItems
    const unlearned = allItems.filter((i) => !learned.has(i.term))
    return unlearned.length > 0 ? unlearned : allItems
  }, [allItems, learned, unlearnedOnly])

  const [index, setIndex] = useState(0)
  const [order, setOrder] = useState<number[]>(() => items.map((_, i) => i))
  const [flipped, setFlipped] = useState(false)

  // Reset order when items change (e.g. toggling unlearned filter)
  const [prevItems, setPrevItems] = useState(items)
  if (items !== prevItems) {
    setPrevItems(items)
    setOrder(items.map((_, i) => i))
    setIndex(0)
    setFlipped(false)
  }

  const currentIndex = Math.min(index, Math.max(0, order.length - 1))
  const item = items[order[currentIndex]]

  const move = (delta: number) => {
    if (order.length <= 1) return
    setFlipped(false)
    setIndex((i) => (i + delta + order.length) % order.length)
  }

  const shuffle = () => {
    const next = [...order]
    for (let i = next.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[next[i], next[j]] = [next[j], next[i]]
    }
    setOrder(next)
    setIndex(0)
    setFlipped(false)
  }

  const markLearned = () => {
    if (!item) return
    const nowLearned = toggleLearned(topic.id, item.term)
    setLearned((prev) => {
      const next = new Set(prev)
      if (nowLearned) next.add(item.term)
      else next.delete(item.term)
      return next
    })
  }
  const stateRef = useRef({ move, shuffle, markLearned, item })
  useEffect(() => {
    stateRef.current = { move, shuffle, markLearned, item }
  })
  // Window-level keyboard shortcuts for ergonomic desktop learning
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return

      if (e.key === " " || e.key === "Enter") {
        // Space or Enter flips the card
        e.preventDefault()
        setFlipped((f) => !f)
        return
      }

      if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        e.preventDefault()
        stateRef.current.move(1)
        return
      }

      if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault()
        stateRef.current.move(-1)
        return
      }

      if (e.key === "m" || e.key === "M") {
        e.preventDefault()
        stateRef.current.markLearned()
        return
      }

      if (e.key === "a" || e.key === "A" || e.key === "p" || e.key === "P") {
        e.preventDefault()
        if (stateRef.current.item) speakTerm(stateRef.current.item.term)
        return
      }

      if (e.key === "s" || e.key === "S") {
        e.preventDefault()
        stateRef.current.shuffle()
        return
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [])

  if (!item) {
    return (
      <div className="mx-auto flex max-w-xl flex-col items-center justify-center gap-4 py-16 text-center">
        <CheckCircle2Icon className="size-16 text-success" />
        <h3 className="font-heading text-2xl font-bold">
          Xuất sắc! Bạn đã thuộc tất cả từ trong chủ đề này.
        </h3>
        <p className="text-sm text-muted-foreground">
          Bạn có thể ôn lại toàn bộ từ vựng hoặc thử sức ở chế độ Trắc nghiệm.
        </p>
        <Button
          onClick={() => {
            setUnlearnedOnly(false)
            setIndex(0)
          }}
        >
          <RotateCcwIcon className="mr-1.5 size-4" />
          Xem lại tất cả 200 từ
        </Button>
      </div>
    )
  }

  const isCurrentLearned = learned.has(item.term)

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col items-center gap-5 py-2">
      {/* Top Filter and Progress Stats */}
      <div className="flex w-full items-center justify-between px-2 text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <Button
            variant={unlearnedOnly ? "secondary" : "outline"}
            size="sm"
            onClick={() => setUnlearnedOnly(!unlearnedOnly)}
            className="h-8 gap-1.5 text-xs font-medium cursor-pointer"
          >
            <FilterIcon className="size-3.5" />
            {unlearnedOnly
              ? `Chỉ học từ chưa thuộc (${items.length})`
              : `Tất cả từ (${allItems.length})`}
          </Button>
          {unlearnedOnly && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setUnlearnedOnly(false)}
              className="h-8 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
            >
              Hiện tất cả
            </Button>
          )}
        </div>

        <div className="flex items-center gap-3">
          <span>
            Thẻ:{" "}
            <strong className="text-foreground">
              {currentIndex + 1}
            </strong>{" "}
            / {order.length}
          </span>
          <span className="rounded-full bg-success/10 px-2.5 py-0.5 font-medium text-success">
            Đã thuộc: {learned.size}/{allItems.length}
          </span>
        </div>
      </div>

      {/* Main Flashcard Container: Centered, Large, Generous padding, Zero CLS */}
      <button
        type="button"
        onClick={() => setFlipped((f) => !f)}
        aria-label="Lật thẻ từ vựng"
        aria-pressed={flipped}
        className="group w-full cursor-pointer rounded-2xl text-left transition-transform focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <Card
          className={cn(
            "relative flex min-h-[380px] sm:min-h-[420px] w-full flex-col justify-between border-border/80 bg-card p-6 sm:p-10 transition-all hover:border-primary/50 hover:shadow-md",
            isCurrentLearned && "border-success/40 bg-success/[0.02]"
          )}
        >
          {/* Top Status Bar of Card */}
          <div className="flex items-center justify-between">
            <Badge
              variant="secondary"
              className="px-2.5 py-1 font-mono text-[11px] font-semibold tracking-wide"
            >
              {LABEL_TEXT[item.label]}
            </Badge>

            <div className="flex items-center gap-2">
              {isCurrentLearned && (
                <span className="flex items-center gap-1 rounded-md bg-success/10 px-2 py-0.5 text-xs font-medium text-success">
                  <CheckCircle2Icon className="size-3.5" /> Đã thuộc
                </span>
              )}
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
                className="size-9 rounded-full text-muted-foreground hover:bg-primary/10 hover:text-primary cursor-pointer"
              >
                <Volume2Icon className="size-4" />
              </Button>
            </div>
          </div>

          {/* Center Content: Term (Front) vs Meaning & Example (Back) */}
          <CardContent
            className="flex flex-1 flex-col items-center justify-center p-0 text-center"
            aria-live="polite"
          >
            {flipped ? (
              <div className="flex flex-col items-center justify-center gap-4 py-4 animate-in fade-in-50 duration-200">
                <p className="text-xs font-mono font-medium text-primary">
                  {item.term} {item.ipa ? `· /${item.ipa}/` : ""}
                </p>
                <h3 className="font-heading text-2xl font-bold leading-snug text-foreground sm:text-3xl lg:text-4xl max-w-2xl">
                  {item.meaning}
                </h3>
                {item.example && (
                  <div className="mt-3 max-w-2xl rounded-2xl border border-border/80 bg-muted/40 p-4 sm:p-5 text-sm sm:text-base leading-relaxed text-muted-foreground">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70 mb-1">
                      Ví dụ ngữ cảnh IELTS:
                    </p>
                    <p className="italic font-medium text-foreground">
                      "{item.example}"
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center gap-3 py-6 animate-in fade-in-50 duration-200">
                <h2 className="font-heading text-4xl font-bold tracking-tight text-foreground sm:text-5xl lg:text-6xl">
                  {item.term}
                </h2>
                {item.ipa && (
                  <div className="mt-1 flex items-center justify-center gap-1.5 font-mono text-base font-medium text-primary sm:text-lg">
                    <span>/{item.ipa}/</span>
                  </div>
                )}
                <span className="mt-6 inline-flex items-center gap-1.5 text-xs text-muted-foreground/70">
                  Nhấn chuột hoặc <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px]">Space</kbd> để lật xem nghĩa
                </span>
              </div>
            )}
          </CardContent>

          {/* Bottom Card Footer hint */}
          <div className="flex items-center justify-between text-[11px] text-muted-foreground/60 border-t border-border/40 pt-3">
            <span>{flipped ? "Mặt sau: Nghĩa & Ví dụ" : "Mặt trước: Thuật ngữ"}</span>
            <span>engstack IELTS Vocabulary</span>
          </div>
        </Card>
      </button>

      {/* Progress Line */}
      <Progress
        value={((currentIndex + 1) / order.length) * 100}
        className="w-full"
      />

      {/* Bottom Main Action Controls */}
      <div className="flex flex-wrap items-center justify-center gap-2.5">
        <Button
          variant="outline"
          size="lg"
          onClick={() => move(-1)}
          aria-label="Thẻ trước"
          className="h-11 px-5 cursor-pointer rounded-xl font-medium"
        >
          <ArrowLeftIcon className="mr-1.5 size-4" />
          Trước
        </Button>

        <Button
          variant={isCurrentLearned ? "default" : "outline"}
          size="lg"
          onClick={markLearned}
          className={cn(
            "h-11 px-6 cursor-pointer rounded-xl font-medium transition-all",
            isCurrentLearned &&
              "bg-success text-success-foreground hover:bg-success/90"
          )}
        >
          <BookmarkCheckIcon className="mr-2 size-4" />
          {isCurrentLearned ? "Đã thuộc" : "Đánh dấu đã thuộc"}
          <kbd
            className={cn(
              "ml-2 rounded px-1.5 py-0.5 font-mono text-[10px]",
              isCurrentLearned
                ? "bg-success-foreground/20 text-success-foreground"
                : "bg-muted text-muted-foreground"
            )}
          >
            M
          </kbd>
        </Button>

        <Button
          variant="outline"
          size="lg"
          onClick={shuffle}
          aria-label="Xáo trộn thứ tự"
          className="h-11 px-4 cursor-pointer rounded-xl font-medium"
          title="Xáo trộn danh sách thẻ (Phím S)"
        >
          <ShuffleIcon className="mr-1.5 size-4" />
          Xáo
        </Button>

        <Button
          variant="outline"
          size="lg"
          onClick={() => move(1)}
          aria-label="Thẻ tiếp theo"
          className="h-11 px-5 cursor-pointer rounded-xl font-medium"
        >
          Sau
          <ArrowRightIcon className="ml-1.5 size-4" />
        </Button>
      </div>

      {/* Desktop Keyboard Hints Toolbar */}
      <div className="flex flex-wrap items-center justify-center gap-3 text-xs text-muted-foreground pt-1">
        <span className="flex items-center gap-1">
          <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[11px] font-semibold text-foreground">
            Space
          </kbd>{" "}
          lật thẻ
        </span>
        <span>·</span>
        <span className="flex items-center gap-1">
          <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[11px] font-semibold text-foreground">
            ←
          </kbd>
          <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[11px] font-semibold text-foreground">
            →
          </kbd>{" "}
          chuyển thẻ
        </span>
        <span>·</span>
        <span className="flex items-center gap-1">
          <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[11px] font-semibold text-foreground">
            M
          </kbd>{" "}
          đã thuộc
        </span>
        <span>·</span>
        <span className="flex items-center gap-1">
          <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[11px] font-semibold text-foreground">
            A
          </kbd>{" "}
          phát âm
        </span>
      </div>
    </div>
  )
}
