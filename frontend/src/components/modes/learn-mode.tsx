import { useCallback, useEffect, useMemo, useRef, useState } from "react"
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
import { Progress } from "@/components/ui/progress"
import { labelText, type Topic } from "@/lib/vocab"
import { toggleLearned, useLearned } from "@/lib/progress"
import { speakTerm } from "@/lib/speech"
import { cn } from "@/lib/utils"

export function LearnMode({
  topic,
  initialItemId,
  onCurrentItemChange,
}: {
  topic: Topic
  /** B10 resume: mở thẳng tới item đã học dở. */
  initialItemId?: string
  onCurrentItemChange?: (itemId: string) => void
}) {
  const allItems = topic.items
  const [unlearnedOnly, setUnlearnedOnly] = useState(false)
  const learned = useLearned(topic.id)

  // Filter items based on user choice (all or unlearned only)
  const items = useMemo(() => {
    if (!unlearnedOnly) return allItems
    const unlearned = allItems.filter((i) => !learned.has(i.id))
    return unlearned.length > 0 ? unlearned : allItems
  }, [allItems, learned, unlearnedOnly])

  const [index, setIndex] = useState(() => {
    const i = initialItemId ? items.findIndex((it) => it.id === initialItemId) : -1
    return i >= 0 ? i : 0
  })
  const [order, setOrder] = useState<number[]>(() => items.map((_, i) => i))
  const [flipped, setFlipped] = useState(false)
  const [direction, setDirection] = useState<"next" | "prev" | "none">("none")
  const [animKey, setAnimKey] = useState(0)
  const [speaking, setSpeaking] = useState(false)

  // Chức năng tự động phát âm khi lật hoặc qua từ mới (mặc định Bật, lưu vào localStorage)
  const [autoPlay, setAutoPlay] = useState<boolean>(() => {
    if (typeof window === "undefined") return true
    const saved = localStorage.getItem("engstack.autoplay_audio")
    return saved !== null ? saved === "true" : true
  })

  const toggleAutoPlay = () => {
    setAutoPlay((prev) => {
      const next = !prev
      localStorage.setItem("engstack.autoplay_audio", String(next))
      return next
    })
  }

  // Reset order when items change (e.g. toggling unlearned filter)
  const [prevItems, setPrevItems] = useState(items)
  if (items !== prevItems) {
    setPrevItems(items)
    setOrder(items.map((_, i) => i))
    setIndex(0)
    setFlipped(false)
    setDirection("none")
    setAnimKey((k) => k + 1)
  }

  const currentIndex = Math.min(index, Math.max(0, order.length - 1))
  const item = items[order[currentIndex]]

  // Báo item hiện tại lên parent để lưu điểm tiếp tục học.
  useEffect(() => {
    if (item) onCurrentItemChange?.(item.id)
  }, [item, onCurrentItemChange])

  const playAudio = useCallback((term: string) => {
    setSpeaking(true)
    speakTerm(term)
    window.setTimeout(() => setSpeaking(false), 900)
  }, [])

  // Tự động phát âm thanh qua Web Speech API khi lật thẻ hoặc khi qua từ mới
  const isFirstMount = useRef(true)
  useEffect(() => {
    if (isFirstMount.current) {
      isFirstMount.current = false
      return
    }
    if (autoPlay && item) {
      speakTerm(item.term)
    }
  }, [item, flipped, autoPlay])

  const move = useCallback((delta: number) => {
    if (order.length <= 1) return
    setDirection(delta > 0 ? "next" : "prev")
    setFlipped(false)
    setAnimKey((k) => k + 1)
    setIndex((i) => (i + delta + order.length) % order.length)
  }, [order.length])

  const shuffle = useCallback(() => {
    const next = [...order]
    for (let i = next.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[next[i], next[j]] = [next[j], next[i]]
    }
    setDirection("none")
    setAnimKey((k) => k + 1)
    setOrder(next)
    setIndex(0)
    setFlipped(false)
  }, [order])

  const [justMarked, setJustMarked] = useState(false)

  const markLearned = useCallback(() => {
    const currentItem = items[order[currentIndex]]
    if (currentItem) {
      toggleLearned(topic.id, currentItem.id)
      setJustMarked(true)
      window.setTimeout(() => setJustMarked(false), 700)
    }
  }, [items, order, currentIndex, topic.id])

  const stateRef = useRef({ move, shuffle, markLearned, item, playAudio })
  useEffect(() => {
    stateRef.current = { move, shuffle, markLearned, item, playAudio }
  }, [move, shuffle, markLearned, item, playAudio])

  // Window-level keyboard shortcuts for ergonomic desktop learning
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      const tag = target?.tagName
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target?.isContentEditable) return

      // Don't intercept browser shortcuts like Ctrl+M / Cmd+M
      if (e.ctrlKey || e.metaKey || e.altKey) return

      const keyLower = e.key ? e.key.toLowerCase() : ""
      const code = e.code || ""
      const keyCode = e.keyCode || e.which || 0

      // M: Đánh dấu đã thuộc / Chưa thuộc (bắt trọn cả khi có gõ tiếng Việt IME hay Process key)
      if (keyLower === "m" || code === "KeyM" || keyCode === 77) {
        e.preventDefault()
        stateRef.current.markLearned()
        return
      }

      // Space or Enter: lật thẻ
      if (
        keyLower === " " ||
        keyLower === "spacebar" ||
        keyLower === "enter" ||
        code === "Space" ||
        code === "Enter" ||
        code === "NumpadEnter" ||
        keyCode === 32 ||
        keyCode === 13
      ) {
        e.preventDefault()
        setFlipped((f) => !f)
        return
      }

      // ArrowRight or ArrowDown: sang thẻ tiếp theo
      if (
        keyLower === "arrowright" ||
        keyLower === "arrowdown" ||
        code === "ArrowRight" ||
        code === "ArrowDown" ||
        keyCode === 39 ||
        keyCode === 40
      ) {
        e.preventDefault()
        stateRef.current.move(1)
        return
      }

      // ArrowLeft or ArrowUp: về thẻ trước
      if (
        keyLower === "arrowleft" ||
        keyLower === "arrowup" ||
        code === "ArrowLeft" ||
        code === "ArrowUp" ||
        keyCode === 37 ||
        keyCode === 38
      ) {
        e.preventDefault()
        stateRef.current.move(-1)
        return
      }

      // A / P: Phát âm từ vựng
      if (
        keyLower === "a" ||
        keyLower === "p" ||
        code === "KeyA" ||
        code === "KeyP" ||
        keyCode === 65 ||
        keyCode === 80
      ) {
        e.preventDefault()
        if (stateRef.current.item) stateRef.current.playAudio(stateRef.current.item.term)
        return
      }

      // S: Xáo trộn danh sách thẻ
      if (keyLower === "s" || code === "KeyS" || keyCode === 83) {
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
      <div className="mx-auto flex max-w-xl flex-col items-center justify-center gap-4 py-12 text-center">
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
          className="cursor-pointer"
        >
          <RotateCcwIcon className="mr-1.5 size-4" />
          Xem lại tất cả {allItems.length} từ
        </Button>
      </div>
    )
  }

  const isCurrentLearned = learned.has(item.id)

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col items-center justify-between gap-3 py-1">
      {/* Top Filter, Auto-play toggle and Progress Stats */}
      <div className="flex w-full items-center justify-between px-1 text-xs text-muted-foreground">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant={unlearnedOnly ? "secondary" : "outline"}
            size="sm"
            onClick={() => setUnlearnedOnly(!unlearnedOnly)}
            className="h-8 gap-1.5 text-xs font-medium cursor-pointer outline-none focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            <FilterIcon className="size-3.5" />
            {unlearnedOnly
              ? `Chưa thuộc (${items.length})`
              : `Tất cả (${allItems.length})`}
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

          {/* Nút bật/tắt tự động phát âm khi lật hoặc qua từ mới */}
          <Button
            variant={autoPlay ? "secondary" : "outline"}
            size="sm"
            onClick={toggleAutoPlay}
            title="Bật/Tắt tự động phát âm khi lật hoặc qua từ mới"
            className={cn(
              "h-8 gap-1.5 text-xs font-medium cursor-pointer outline-none focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 transition-colors",
              autoPlay && "border-primary/40 bg-primary/10 text-primary font-semibold hover:bg-primary/20"
            )}
          >
            <Volume2Icon className={cn("size-3.5", autoPlay && "text-primary")} />
            <span>Tự phát: {autoPlay ? "Bật" : "Tắt"}</span>
          </Button>
        </div>

        <div className="flex items-center gap-3">
          <span className="font-medium text-foreground text-sm">
            {currentIndex + 1}
            <span className="text-muted-foreground font-normal"> / {order.length}</span>
          </span>
          <span className="rounded-full bg-success/10 px-2.5 py-0.5 text-xs font-semibold text-success">
            Đã thuộc: {learned.size}/{allItems.length}
          </span>
        </div>
      </div>

      {/* Main 3D Flashcard Container: Large, Ergonomic, High Readability */}
      <div
        key={`${item.id}-${animKey}`}
        className={cn(
          "perspective-1000 w-full",
          direction === "next" && "animate-in fade-in-40 slide-in-from-right-8 duration-300",
          direction === "prev" && "animate-in fade-in-40 slide-in-from-left-8 duration-300",
          direction === "none" && "animate-in fade-in-50 zoom-in-95 duration-250"
        )}
      >
        <div
          role="region"
          aria-label={flipped ? "Mặt sau thẻ từ vựng" : "Mặt trước thẻ từ vựng"}
          onClick={() => setFlipped((f) => !f)}
          className={cn(
            "transform-style-3d relative w-full h-[400px] sm:h-[450px] md:h-[480px] lg:h-[500px] cursor-pointer select-none transition-transform duration-500 ease-out",
            "outline-none focus:outline-none focus-visible:outline-none ring-0 focus:ring-0 active:outline-none",
            flipped && "rotate-y-180"
          )}
        >
          {/* FRONT FACE */}
          <div
            className={cn(
              "backface-hidden absolute inset-0 flex flex-col justify-between rounded-3xl border border-border/80 bg-card p-6 sm:p-8 lg:p-10 shadow-sm hover:border-primary/40 transition-colors",
              isCurrentLearned && "border-success/40 bg-success/[0.02]"
            )}
          >
            {/* Front Header */}
            <div className="flex items-center justify-between">
              <Badge
                variant="secondary"
                className="px-3 py-1 font-mono text-xs font-semibold tracking-wide"
              >
                {labelText(item)}
              </Badge>

              <div className="flex items-center gap-2">
                {isCurrentLearned && (
                  <span
                    className={cn(
                      "flex items-center gap-1.5 rounded-md bg-success/10 px-2.5 py-1 text-xs font-medium text-success transition-transform",
                      justMarked && "scale-110"
                    )}
                  >
                    <CheckCircle2Icon className="size-4" /> Đã thuộc
                  </span>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={(e) => {
                    e.stopPropagation()
                    playAudio(item.term)
                  }}
                  title="Nghe phát âm (Phím A)"
                  aria-label={`Nghe phát âm ${item.term}`}
                  className={cn(
                    "size-10 rounded-full text-muted-foreground hover:bg-primary/10 hover:text-primary cursor-pointer outline-none focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 transition-all active:scale-95",
                    speaking && "text-primary bg-primary/10 scale-105"
                  )}
                >
                  <Volume2Icon
                    className={cn("size-5 transition-transform", speaking && "animate-pulse text-primary")}
                  />
                </Button>
              </div>
            </div>

            {/* Front Center Content: Massive, Highly Legible Typography */}
            <div className="flex flex-1 flex-col items-center justify-center text-center py-4">
              <h2 className="font-heading text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-bold tracking-tight text-foreground leading-none">
                {item.term}
              </h2>
              {item.ipa && (
                <div className="mt-3 sm:mt-4 flex items-center justify-center gap-2 font-mono text-lg sm:text-xl md:text-2xl font-medium text-primary">
                  <span>/{item.ipa}/</span>
                </div>
              )}
              <div className="mt-8 flex items-center gap-2 text-xs sm:text-sm text-muted-foreground/75">
                <span>Nhấn thẻ hoặc nhấn phím</span>
                <kbd className="rounded-md border border-border bg-muted/80 px-2 py-0.5 font-mono text-xs font-semibold text-foreground">
                  Space
                </kbd>
                <span>để xem nghĩa ↵</span>
              </div>
            </div>

            {/* Front Footer */}
            <div className="flex items-center justify-between border-t border-border/40 pt-3 text-xs text-muted-foreground/60">
              <span>Mặt trước · Thuật ngữ tiếng Anh</span>
              <span className="font-medium">
                Thẻ {currentIndex + 1} / {order.length}
              </span>
            </div>
          </div>

          {/* BACK FACE */}
          <div
            className={cn(
              "backface-hidden rotate-y-180 absolute inset-0 flex flex-col justify-between rounded-3xl border border-border/80 bg-card p-6 sm:p-8 lg:p-10 shadow-sm hover:border-primary/40 transition-colors overflow-y-auto",
              isCurrentLearned && "border-success/40 bg-success/[0.02]"
            )}
          >
            {/* Back Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Badge
                  variant="secondary"
                  className="px-3 py-1 font-mono text-xs font-semibold tracking-wide"
                >
                  {labelText(item)}
                </Badge>
                <span className="font-mono text-sm font-semibold text-primary">
                  {item.term} {item.ipa ? `· /${item.ipa}/` : ""}
                </span>
              </div>

              <div className="flex items-center gap-2">
                {isCurrentLearned && (
                  <span
                    className={cn(
                      "flex items-center gap-1.5 rounded-md bg-success/10 px-2.5 py-1 text-xs font-medium text-success transition-transform",
                      justMarked && "scale-110"
                    )}
                  >
                    <CheckCircle2Icon className="size-4" /> Đã thuộc
                  </span>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={(e) => {
                    e.stopPropagation()
                    playAudio(item.term)
                  }}
                  title="Nghe phát âm (Phím A)"
                  aria-label={`Nghe phát âm ${item.term}`}
                  className={cn(
                    "size-10 rounded-full text-muted-foreground hover:bg-primary/10 hover:text-primary cursor-pointer outline-none focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 transition-all active:scale-95",
                    speaking && "text-primary bg-primary/10 scale-105"
                  )}
                >
                  <Volume2Icon
                    className={cn("size-5 transition-transform", speaking && "animate-pulse text-primary")}
                  />
                </Button>
              </div>
            </div>

            {/* Back Center Content: Clear hierarchy for easy reading */}
            <div className="flex flex-1 flex-col items-center justify-center text-center py-2 gap-3 sm:gap-4">
              <h3 className="font-heading text-3xl sm:text-4xl md:text-5xl font-bold leading-snug text-foreground max-w-2xl">
                {item.meaning}
              </h3>
              {item.definition && (
                <p className="max-w-2xl text-xs sm:text-sm md:text-base leading-relaxed text-muted-foreground">
                  <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground/75 font-semibold">
                    Định nghĩa EN ·{" "}
                  </span>
                  {item.definition}
                </p>
              )}
              {item.example && (
                <div className="w-full max-w-2xl rounded-2xl border border-border/70 bg-muted/40 p-4 sm:p-5 text-left text-sm sm:text-base">
                  <p className="font-semibold text-[11px] uppercase tracking-wider text-muted-foreground/75 mb-1">
                    {item.track === "oxford" ? "Ví dụ ngữ cảnh:" : "Ví dụ IELTS:"}
                  </p>
                  <p className="italic font-medium text-foreground leading-relaxed text-base sm:text-lg">
                    "{item.example}"
                  </p>
                  {item.exampleVi && (
                    <p className="mt-2 border-t border-border/50 pt-2 not-italic text-xs sm:text-sm text-muted-foreground">
                      {item.exampleVi}
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Back Footer */}
            <div className="flex items-center justify-between border-t border-border/40 pt-3 text-xs text-muted-foreground/60">
              <span>Mặt sau · Nghĩa & Ngữ cảnh thực tế</span>
              <span>Nhấn thẻ để lật lại mặt trước ↵</span>
            </div>
          </div>
        </div>
      </div>

      {/* Progress Line */}
      <div className="w-full max-w-4xl">
        <Progress
          value={((currentIndex + 1) / order.length) * 100}
          className="h-2 w-full rounded-full"
        />
      </div>

      {/* Bottom Main Action Controls */}
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Button
          variant="outline"
          size="lg"
          onClick={() => move(-1)}
          aria-label="Thẻ trước"
          className="h-11 px-5 cursor-pointer rounded-xl font-medium outline-none focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 active:scale-95 transition-transform"
        >
          <ArrowLeftIcon className="mr-1.5 size-4" />
          Trước
        </Button>

        <Button
          variant={isCurrentLearned ? "default" : "outline"}
          size="lg"
          onClick={markLearned}
          className={cn(
            "h-11 px-6 cursor-pointer rounded-xl font-medium transition-all outline-none focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 active:scale-95",
            isCurrentLearned &&
              "bg-success text-success-foreground hover:bg-success/90 border-success",
            justMarked && "scale-105 shadow-sm"
          )}
        >
          <BookmarkCheckIcon className="mr-2 size-4" />
          {isCurrentLearned ? "Đã thuộc" : "Đánh dấu đã thuộc"}
          <kbd
            className={cn(
              "ml-2 rounded px-1.5 py-0.5 font-mono text-[11px]",
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
          className="h-11 px-4 cursor-pointer rounded-xl font-medium outline-none focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 active:scale-95 transition-transform"
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
          className="h-11 px-5 cursor-pointer rounded-xl font-medium outline-none focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 active:scale-95 transition-transform"
        >
          Sau
          <ArrowRightIcon className="ml-1.5 size-4" />
        </Button>
      </div>

      {/* Desktop Keyboard Hints Toolbar */}
      <div className="flex flex-wrap items-center justify-center gap-3 text-xs text-muted-foreground/75 pb-0.5">
        <span className="flex items-center gap-1">
          <kbd className="rounded border border-border bg-muted/70 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-foreground">
            Space
          </kbd>{" "}
          lật thẻ
        </span>
        <span>·</span>
        <span className="flex items-center gap-1">
          <kbd className="rounded border border-border bg-muted/70 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-foreground">
            ←
          </kbd>
          <kbd className="rounded border border-border bg-muted/70 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-foreground">
            →
          </kbd>{" "}
          chuyển thẻ
        </span>
        <span>·</span>
        <span className="flex items-center gap-1">
          <kbd className="rounded border border-border bg-muted/70 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-foreground">
            M
          </kbd>{" "}
          đã thuộc
        </span>
        <span>·</span>
        <span className="flex items-center gap-1">
          <kbd className="rounded border border-border bg-muted/70 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-foreground">
            A
          </kbd>{" "}
          phát âm
        </span>
        <span>·</span>
        <span className="flex items-center gap-1">
          <kbd className="rounded border border-border bg-muted/70 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-foreground">
            S
          </kbd>{" "}
          xáo
        </span>
      </div>
    </div>
  )
}
