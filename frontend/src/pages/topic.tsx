import { useEffect, useRef, useState } from "react"
import { Link, useParams, useSearchParams } from "react-router-dom"
import {
  ArrowLeftIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  LinkIcon,
  RefreshCwIcon,
  SparklesIcon,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs"
import { LearnMode } from "@/components/modes/learn-mode"
import { MatchMode } from "@/components/modes/match-mode"
import { QuizMode } from "@/components/modes/quiz-mode"
import { WordList } from "@/components/modes/word-list"
import { WriteMode } from "@/components/modes/write-mode"
import { ACCENT_BG, ACCENT_CLASS } from "@/lib/vocab"
import { useTopic, useTopicSummaries } from "@/lib/content"
import { useLearned, useProgressReady } from "@/lib/progress"
import { useAuth } from "@/lib/auth"
import {
  newSessionEventId,
  postSessionEvent,
  savePosition,
} from "@/lib/history"

function CopyLinkButton() {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      // clipboard denied
    }
  }

  return (
    <Button
      variant="outline"
      size="sm"
      className="w-fit cursor-pointer text-xs"
      onClick={copy}
    >
      {copied ? (
        <CheckIcon className="size-3.5" data-icon="inline-start" />
      ) : (
        <LinkIcon className="size-3.5" data-icon="inline-start" />
      )}
      {copied ? "Đã chép liên kết" : "Chép liên kết"}
    </Button>
  )
}

export function TopicPage() {
  // Remount khi đổi topic: tránh kế thừa mode/item/điểm học của topic cũ.
  const { topicId = "" } = useParams()
  const { data: topic, error, notFound, loading, retry } = useTopic(topicId)
  const { data: summaries } = useTopicSummaries()
  const learned = useLearned(topicId).size
  const progressReady = useProgressReady()

  // Focus mode / Collapsed header state (persisted in localStorage for convenience)
  const [focusMode, setFocusMode] = useState<boolean>(() => {
    if (typeof window === "undefined") return true
    const saved = localStorage.getItem("engstack.focus_mode")
    return saved !== null ? saved === "true" : true
  })

  const [searchParams] = useSearchParams()
  const initialMode = searchParams.get("mode") ?? "learn"
  const initialItem = searchParams.get("item") ?? undefined
  const [activeTab, setActiveTab] = useState(initialMode)
  const lastItemRef = useRef<string | undefined>(initialItem)
  const { status: authStatus } = useAuth()

  // B10: lưu điểm học (server cho tài khoản / localStorage cho guest) và log
  // phiên chế độ. Item theo dõi qua LearnMode callback.
  useEffect(() => {
    if (!topic) return
    savePosition({
      topicId: topic.id,
      mode: activeTab,
      itemId: lastItemRef.current,
    })
  }, [topic, activeTab])

  useEffect(() => {
    if (!topic || authStatus !== "authenticated") return
    postSessionEvent("session_start", topic.id, activeTab, newSessionEventId())
    // End dùng id riêng — unique index (user_id, client_event_id) sẽ nuốt
    // event end nếu trùng id với start.
    return () => postSessionEvent("session_end", topic.id, activeTab, newSessionEventId())
  }, [topic, authStatus, activeTab])

  const onLearnItem = (itemId: string) => {
    lastItemRef.current = itemId
    if (topic) savePosition({ topicId: topic.id, mode: activeTab, itemId })
  }

  const toggleFocusMode = () => {
    setFocusMode((prev) => {
      const next = !prev
      localStorage.setItem("engstack.focus_mode", String(next))
      return next
    })
  }

  useEffect(() => {
    document.title = topic
      ? `${topic.title} — engstack`
      : "engstack — Từ vựng IELTS theo chủ đề"
    return () => {
      document.title = "engstack — Từ vựng IELTS theo chủ đề"
    }
  }, [topic])

  if (loading) {
    return (
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-16" aria-busy>
        <div className="h-24 animate-pulse rounded-2xl bg-muted" />
        <div className="h-10 w-full animate-pulse rounded-xl bg-muted" />
        <div className="h-[380px] animate-pulse rounded-2xl bg-muted" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="mx-auto flex max-w-6xl flex-col items-start gap-3 px-4 py-16">
        <div
          role="alert"
          className="flex flex-col items-start gap-3 rounded-xl border border-border bg-card p-5"
        >
          <p className="text-sm text-muted-foreground">{error}</p>
          <Button variant="outline" size="sm" onClick={retry} className="cursor-pointer">
            <RefreshCwIcon data-icon="inline-start" />
            Thử lại
          </Button>
        </div>
      </div>
    )
  }

  if (notFound || !topic) {
    return (
      <div className="mx-auto flex max-w-6xl flex-col items-start gap-4 px-4 py-16">
        <h1 className="font-heading text-2xl font-bold">Không tìm thấy chủ đề.</h1>
        <Button variant="outline" render={<Link to="/" />}>
          <ArrowLeftIcon data-icon="inline-start" />
          Về danh sách chủ đề
        </Button>
      </div>
    )
  }

  const relatedTopics = (summaries ?? []).filter((t) =>
    topic.related?.includes(t.id),
  )
  const progressPercent =
    progressReady && topic.items.length > 0
      ? (learned / topic.items.length) * 100
      : 0

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5 px-4 py-4 sm:py-6">
      {/* Collapsible / Focus Header */}
      {focusMode ? (
        /* Compact Header (Chế độ tập trung học) */
        <div className="flex flex-col gap-2 rounded-2xl border border-border/60 bg-card/60 p-3 sm:flex-row sm:items-center sm:justify-between sm:px-4">
          <div className="flex flex-wrap items-center gap-2.5">
            <Button
              variant="ghost"
              size="sm"
              className="-ml-1 h-8 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
              render={<Link to="/" />}
            >
              <ArrowLeftIcon className="size-3.5 mr-1" />
              Chủ đề
            </Button>
            <span className="text-border">/</span>
            <Badge
              variant="secondary"
              className={`${ACCENT_BG[topic.accent]} ${ACCENT_CLASS[topic.accent]} font-mono text-[11px] py-0 px-2`}
            >
              {topic.eyebrow}
            </Badge>
            <h1 className="font-heading text-lg font-bold text-foreground">
              {topic.title}
            </h1>
          </div>

          <div className="flex items-center justify-between gap-3 sm:justify-end">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <div className="w-24 sm:w-32">
                <Progress
                  value={progressPercent}
                  className="h-2"
                  aria-busy={!progressReady}
                />
              </div>
              <span className="font-medium whitespace-nowrap">
                {progressReady ? (
                  <span className="text-success font-semibold">{learned}</span>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
                /{topic.items.length} từ
              </span>
            </div>

            <Button
              variant="ghost"
              size="sm"
              onClick={toggleFocusMode}
              title="Mở rộng thông tin chủ đề"
              className="h-8 gap-1 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
            >
              <SparklesIcon className="size-3.5 text-primary" />
              <span className="hidden sm:inline">Chế độ tập trung</span>
              <ChevronDownIcon className="size-3.5 ml-0.5" />
            </Button>
          </div>
        </div>
      ) : (
        /* Expanded Header (Xem đầy đủ mô tả và liên kết) */
        <div className="flex flex-col gap-3 rounded-2xl border border-border/80 bg-card p-5 sm:p-6 transition-all">
          <div className="flex items-center justify-between">
            <Button
              variant="ghost"
              size="sm"
              className="-ml-2 w-fit text-xs text-muted-foreground hover:text-foreground cursor-pointer"
              render={<Link to="/" />}
            >
              <ArrowLeftIcon className="size-3.5 mr-1" />
              Tất cả chủ đề
            </Button>

            <Button
              variant="secondary"
              size="sm"
              onClick={toggleFocusMode}
              className="h-8 gap-1.5 text-xs font-medium cursor-pointer"
            >
              <ChevronUpIcon className="size-3.5" />
              Thu gọn (Bật tập trung)
            </Button>
          </div>

          <div className="flex flex-col gap-2">
            <Badge
              variant="secondary"
              className={`w-fit ${ACCENT_BG[topic.accent]} ${ACCENT_CLASS[topic.accent]} font-mono text-xs`}
            >
              {topic.eyebrow}
            </Badge>
            <h1 className="font-heading text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              {topic.title}
            </h1>
            <p className="max-w-2xl text-sm sm:text-base leading-relaxed text-muted-foreground">
              {topic.description}
            </p>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-border/60">
            <div className="flex max-w-sm flex-1 flex-col gap-1.5">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Tiến độ ghi nhớ</span>
                <span className="font-medium">
                  Đã thuộc {progressReady ? learned : "—"}/{topic.items.length} mục từ
                </span>
              </div>
              <Progress
                value={progressPercent}
                className="h-2"
                aria-busy={!progressReady}
              />
            </div>

            <div className="flex items-center gap-2">
              <CopyLinkButton />
            </div>
          </div>
        </div>
      )}

      {/* Main Study Deck Area */}
      <Tabs
        key={topic.id}
        value={activeTab}
        onValueChange={setActiveTab}
        className="flex flex-col gap-4"
      >
        <div className="flex justify-center">
          <TabsList className="flex max-w-full overflow-x-auto rounded-xl border border-border/70 bg-muted/60 p-1">
            <TabsTrigger value="learn" className="cursor-pointer px-4 text-sm">
              Học thẻ
            </TabsTrigger>
            <TabsTrigger value="quiz" className="cursor-pointer px-4 text-sm">
              Trắc nghiệm
            </TabsTrigger>
            <TabsTrigger value="write" className="cursor-pointer px-4 text-sm">
              Viết lại
            </TabsTrigger>
            <TabsTrigger value="match" className="cursor-pointer px-4 text-sm">
              Nối từ
            </TabsTrigger>
            <TabsTrigger value="list" className="cursor-pointer px-4 text-sm">
              Danh sách từ
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="learn" className="outline-none focus:outline-none">
          <LearnMode
            topic={topic}
            initialItemId={initialItem}
            onCurrentItemChange={onLearnItem}
          />
        </TabsContent>

        <TabsContent value="quiz" className="outline-none focus:outline-none">
          <QuizMode topic={topic} />
        </TabsContent>

        <TabsContent value="write" className="outline-none focus:outline-none">
          <WriteMode topic={topic} />
        </TabsContent>

        <TabsContent value="match" className="outline-none focus:outline-none">
          <MatchMode topic={topic} />
        </TabsContent>

        <TabsContent value="list" className="outline-none focus:outline-none">
          <WordList topic={topic} />
        </TabsContent>
      </Tabs>

      {/* Related Topics: Only shown when NOT in Focus Mode or in list mode */}
      {(!focusMode || activeTab === "list") && relatedTopics.length > 0 && (
        <section className="flex flex-col gap-3 pt-6 border-t border-border/60 animate-in fade-in-50">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Chủ đề liên quan gợi ý ôn luyện
          </h2>
          <div className="flex flex-wrap gap-2">
            {relatedTopics.slice(0, 6).map((t) => (
              <Button
                key={t.id}
                variant="outline"
                size="sm"
                className="cursor-pointer text-xs"
                render={<Link to={`/topic/${t.id}`} />}
              >
                {t.title}
              </Button>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
