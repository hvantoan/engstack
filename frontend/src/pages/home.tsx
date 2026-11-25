import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import {
  ArrowRightIcon,
  BookOpenIcon,
  CheckCircle2Icon,
  Clock3Icon,
  PlayIcon,
  RefreshCwIcon,
  SearchIcon,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { useTopicSummaries, type TopicSummary } from "@/lib/content"
import {
  ACCENT_BG,
  ACCENT_CLASS,
  TRACK_DESCRIPTION,
  TRACK_LABEL,
} from "@/lib/vocab"
import { useLearnedMap, useProgressReady } from "@/lib/progress"
import { fetchPosition, type Position } from "@/lib/history"
import { useAuth } from "@/lib/auth"
import { useReviewSummary } from "@/lib/review"

const MODE_LABEL: Record<string, string> = {
  learn: "Học từ",
  quiz: "Trắc nghiệm",
  write: "Viết",
  match: "Ghép cặp",
  list: "Danh sách",
}

function useContinuePosition(status: string) {
  const [result, setResult] = useState<{
    status: string
    position: Position | null
  } | null>(null)

  useEffect(() => {
    if (status === "loading") return
    let cancelled = false
    fetchPosition()
      .then((position) => {
        if (!cancelled) setResult({ status, position })
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [status])

  return result?.status === status ? result.position : null
}

function topicHref(topicId: string, position?: Position | null) {
  if (!position || position.topicId !== topicId) return `/topic/${topicId}`
  const params = new URLSearchParams()
  if (position.mode) params.set("mode", position.mode)
  if (position.itemId) params.set("item", position.itemId)
  const query = params.toString()
  return `/topic/${topicId}${query ? `?${query}` : ""}`
}

function percentOf(learned: number, total: number) {
  if (total <= 0) return 0
  return Math.min(100, Math.round((learned / total) * 100))
}

function formatNextDue(value?: string | null) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleString("vi-VN", {
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function Stat({
  label,
  value,
  detail,
}: {
  label: string
  value: string | number
  detail: string
}) {
  return (
    <div className="rounded-xl border border-border bg-background/80 p-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 font-heading text-2xl leading-none">{value}</dd>
      <dd className="mt-1 text-xs text-muted-foreground">{detail}</dd>
    </div>
  )
}

function TopicProgress({
  learned,
  total,
  ready,
}: {
  learned: number
  total: number
  ready: boolean
}) {
  const percent = ready ? percentOf(learned, total) : 0
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>
          {ready ? `${learned}/${total} đã thuộc` : "Đang tải tiến độ…"}
        </span>
        <span className="font-medium text-foreground">
          {ready ? `${percent}%` : "—"}
        </span>
      </div>
      <Progress value={percent} aria-busy={!ready} />
    </div>
  )
}

function TopicCard({
  topic,
  index,
  learned,
  ready,
}: {
  topic: TopicSummary
  index: number
  learned: number
  ready: boolean
}) {
  const done = learned >= topic.itemCount && topic.itemCount > 0
  const cta = done ? "Ôn lại" : learned > 0 ? "Tiếp tục" : "Bắt đầu"

  return (
    <Link
      to={`/topic/${topic.id}`}
      className="group cursor-pointer rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      aria-label={`${cta} chủ đề ${topic.title}`}
    >
      <Card className="h-full transition-shadow hover:shadow-md">
        <CardHeader className="gap-3">
          <div className="flex items-center justify-between gap-2">
            <Badge
              variant="secondary"
              className={`${ACCENT_BG[topic.accent]} ${ACCENT_CLASS[topic.accent]} font-mono text-xs`}
            >
              {String(index + 1).padStart(2, "0")} · {topic.eyebrow}
            </Badge>
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              {done && (
                <CheckCircle2Icon
                  className="size-3.5 text-success"
                  aria-hidden
                />
              )}
              {topic.itemCount} mục
            </span>
          </div>
          <CardTitle className="font-heading text-lg">{topic.title}</CardTitle>
          <CardDescription className="line-clamp-2 min-h-10">
            {topic.description}
          </CardDescription>
        </CardHeader>
        <CardContent className="mt-auto flex flex-col gap-3">
          <TopicProgress
            learned={learned}
            total={topic.itemCount}
            ready={ready}
          />
          <div className="flex items-center justify-between text-sm font-medium text-primary">
            <span>{cta}</span>
            <ArrowRightIcon
              className="size-4 transition-transform group-hover:translate-x-0.5"
              aria-hidden
            />
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}

function ContentError({
  message,
  onRetry,
}: {
  message: string
  onRetry: () => void
}) {
  return (
    <div
      role="alert"
      className="flex flex-col items-start gap-3 rounded-xl border border-border bg-card p-5"
    >
      <p className="text-sm text-muted-foreground">{message}</p>
      <Button
        variant="outline"
        size="sm"
        onClick={onRetry}
        className="cursor-pointer"
      >
        <RefreshCwIcon data-icon="inline-start" />
        Thử lại
      </Button>
    </div>
  )
}

export function HomePage() {
  const { data: topics, error, loading, retry } = useTopicSummaries()
  const { status, user } = useAuth()
  const position = useContinuePosition(status)
  const learnedMap = useLearnedMap()
  const ready = useProgressReady()
  const reviewSummary = useReviewSummary()

  if (loading) {
    return (
      <div
        className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-10"
        aria-busy
      >
        <div className="h-40 animate-pulse rounded-2xl bg-muted" />
        <div className="grid gap-4 md:grid-cols-2">
          <div className="h-52 animate-pulse rounded-xl bg-muted" />
          <div className="h-52 animate-pulse rounded-xl bg-muted" />
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }, (_, index) => (
            <div
              key={index}
              className="h-44 animate-pulse rounded-xl bg-muted"
            />
          ))}
        </div>
      </div>
    )
  }

  if (error && !topics) {
    return (
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-24">
        <h1 className="font-heading text-2xl font-bold">Bảng học hôm nay</h1>
        <ContentError message={error} onRetry={retry} />
      </div>
    )
  }

  const list = topics ?? []
  const learnedByTopic = new Map(
    list.map((topic) => [
      topic.id,
      Math.min(learnedMap[topic.id]?.length ?? 0, topic.itemCount),
    ])
  )
  const total = list.reduce((count, topic) => count + topic.itemCount, 0)
  const learnedTotal = list.reduce(
    (count, topic) => count + (learnedByTopic.get(topic.id) ?? 0),
    0
  )
  const completionPercent = percentOf(learnedTotal, total)
  const tracks = [...new Set(list.map((topic) => topic.track))]
  const positionTopic = position
    ? list.find((topic) => topic.id === position.topicId)
    : undefined
  const incompleteTopic = list.find(
    (topic) => (learnedByTopic.get(topic.id) ?? 0) < topic.itemCount
  )
  const nextTopic = incompleteTopic ?? list[0]
  const continueTopic = positionTopic ?? nextTopic
  const activePosition = positionTopic ? position : null
  const continueLearned = continueTopic
    ? (learnedByTopic.get(continueTopic.id) ?? 0)
    : 0
  const continueDone = continueTopic
    ? continueLearned >= continueTopic.itemCount && continueTopic.itemCount > 0
    : false
  const firstName = user?.name?.trim().split(/\s+/)[0]
  const dueCount = reviewSummary?.dueCount ?? 0
  const nextDue = formatNextDue(reviewSummary?.nextDueAt)

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-6 sm:py-8">
      <section
        className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]"
        aria-labelledby="dashboard-title"
      >
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
          <Badge variant="secondary" className="w-fit tracking-wide uppercase">
            Bảng học hôm nay
          </Badge>
          <h1
            id="dashboard-title"
            className="mt-4 font-heading text-3xl leading-tight sm:text-4xl"
          >
            {firstName
              ? `Chào ${firstName}, hôm nay học gì?`
              : "Hôm nay học gì?"}
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
            Chọn một việc nhỏ cho hôm nay: tiếp tục đúng điểm đang học, ôn thẻ
            đến hạn, hoặc mở một chủ đề mới.
          </p>
          <dl className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-3 sm:gap-3">
            <Stat
              label="Đã thuộc"
              value={ready ? learnedTotal.toLocaleString("vi-VN") : "—"}
              detail={`trên ${total.toLocaleString("vi-VN")} mục`}
            />
            <Stat
              label="Hoàn thành"
              value={ready ? `${completionPercent}%` : "—"}
              detail="toàn bộ thư viện"
            />
            <Stat
              label="Chủ đề"
              value={list.length}
              detail={`${tracks.length} nhóm nội dung`}
            />
          </dl>
        </div>

        <Card className="border-primary/25 bg-primary/5">
          <CardHeader>
            <Badge variant="secondary" className="w-fit">
              Lộ trình hôm nay
            </Badge>
            <CardTitle className="font-heading text-2xl">
              {ready ? `${completionPercent}%` : "Đang tải…"}
            </CardTitle>
            <CardDescription>
              Tiến độ tổng của bạn trong thư viện engstack.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <Progress
              value={ready ? completionPercent : 0}
              aria-busy={!ready}
              aria-label="Tiến độ tổng"
            />
            <div className="grid gap-2 text-sm">
              <span className="flex items-center gap-2 text-muted-foreground">
                <PlayIcon className="size-4 text-primary" aria-hidden />
                {incompleteTopic
                  ? "Học chủ đề tiếp theo chưa hoàn thành"
                  : "Ôn lại chủ đề để giữ nhịp nhớ"}
              </span>
              <span className="flex items-center gap-2 text-muted-foreground">
                <Clock3Icon className="size-4 text-primary" aria-hidden />
                Ôn các thẻ đến hạn trước khi học thêm
              </span>
            </div>
          </CardContent>
        </Card>
      </section>

      <section
        className="grid gap-4 md:grid-cols-2"
        aria-label="Hành động học tập"
      >
        <Card className="border-primary/35 bg-primary/5">
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <Badge className="w-fit">Ưu tiên 1</Badge>
              <span className="flex size-10 items-center justify-center rounded-full bg-primary text-primary-foreground">
                <PlayIcon className="size-4" aria-hidden />
              </span>
            </div>
            <CardTitle className="font-heading text-xl">
              {positionTopic
                ? "Tiếp tục đúng điểm đang học"
                : incompleteTopic
                  ? "Học chủ đề tiếp theo"
                  : "Ôn lại chủ đề"}
            </CardTitle>
            <CardDescription>
              {positionTopic
                ? `${positionTopic.title}${position?.mode ? ` · ${MODE_LABEL[position.mode] ?? position.mode}` : ""}`
                : continueTopic
                  ? `${continueTopic.title} · ${incompleteTopic ? "chưa hoàn thành" : "ôn lại"}`
                  : "Chọn một chủ đề để bắt đầu"}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {continueTopic && (
              <>
                <TopicProgress
                  learned={continueLearned}
                  total={continueTopic.itemCount}
                  ready={ready}
                />
                <Button
                  size="lg"
                  nativeButton={false}
                  render={
                    <Link to={topicHref(continueTopic.id, activePosition)} />
                  }
                  className="w-full cursor-pointer"
                >
                  {positionTopic
                    ? "Tiếp tục học"
                    : continueDone
                      ? "Ôn lại chủ đề"
                      : continueLearned > 0
                        ? "Tiếp tục chủ đề"
                        : "Bắt đầu học"}
                  <ArrowRightIcon data-icon="inline-end" />
                </Button>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <Badge variant="secondary" className="w-fit">
                Ưu tiên 2
              </Badge>
              <span className="flex size-10 items-center justify-center rounded-full bg-secondary text-secondary-foreground">
                <Clock3Icon className="size-4" aria-hidden />
              </span>
            </div>
            <CardTitle className="font-heading text-xl">Ôn hôm nay</CardTitle>
            <CardDescription>
              {status === "authenticated"
                ? reviewSummary
                  ? dueCount > 0
                    ? `${dueCount} thẻ đang đến hạn. Ôn ngay để giữ nhịp nhớ.`
                    : nextDue
                      ? `Chưa có thẻ đến hạn. Đợt tiếp theo: ${nextDue}.`
                      : "Chưa có thẻ đến hạn hôm nay."
                  : "Đang kiểm tra hàng đợi ôn…"
                : "Đăng nhập để đồng bộ lịch ôn giãn cách trên nhiều thiết bị."}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="rounded-xl border border-border bg-background p-4">
              <p className="text-xs text-muted-foreground">Thẻ đến hạn</p>
              <p className="mt-1 font-heading text-3xl">
                {status === "authenticated"
                  ? reviewSummary
                    ? dueCount
                    : "—"
                  : "—"}
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                size="lg"
                variant={
                  status === "authenticated" && dueCount > 0
                    ? "default"
                    : "outline"
                }
                nativeButton={false}
                render={<Link to="/review" />}
                className="flex-1 cursor-pointer"
              >
                {status === "authenticated" && dueCount > 0
                  ? "Ôn ngay"
                  : "Mở ôn hôm nay"}
                <ArrowRightIcon data-icon="inline-end" />
              </Button>
              <Button
                size="lg"
                variant="ghost"
                nativeButton={false}
                render={<Link to="/search" />}
                className="cursor-pointer text-muted-foreground"
              >
                <SearchIcon data-icon="inline-start" />
                Tra từ
              </Button>
            </div>
          </CardContent>
        </Card>
      </section>

      {error && <ContentError message={error} onRetry={retry} />}

      <section
        className="flex flex-col gap-6"
        id="topics"
        aria-labelledby="library-title"
      >
        <div className="flex flex-wrap items-end justify-between gap-3 border-t border-border pt-6">
          <div>
            <div className="flex items-center gap-2">
              <BookOpenIcon className="size-4 text-primary" aria-hidden />
              <h2 id="library-title" className="font-heading text-2xl">
                Thư viện học
              </h2>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Chọn chủ đề theo nhóm; chủ đề nào đang học dở sẽ hiện “Tiếp tục”.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            nativeButton={false}
            render={<Link to="/search" />}
            className="cursor-pointer"
          >
            <SearchIcon data-icon="inline-start" />
            Tìm trong toàn bộ từ vựng
          </Button>
        </div>

        <div className="flex flex-col gap-8">
          {tracks.map((track) => {
            const modules = list.filter((topic) => topic.track === track)
            return (
              <section key={track} className="flex flex-col gap-4">
                <div className="flex flex-col gap-1">
                  <div className="flex items-baseline gap-3">
                    <span className="font-heading text-lg">
                      {modules.length}
                    </span>
                    <h3 className="text-xs font-medium tracking-widest text-muted-foreground uppercase">
                      {TRACK_LABEL[track] ?? track}
                    </h3>
                  </div>
                  {TRACK_DESCRIPTION[track] && (
                    <p className="text-sm text-muted-foreground">
                      {TRACK_DESCRIPTION[track]}
                    </p>
                  )}
                </div>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {modules.map((topic, index) => (
                    <TopicCard
                      key={topic.id}
                      topic={topic}
                      index={index}
                      learned={learnedByTopic.get(topic.id) ?? 0}
                      ready={ready}
                    />
                  ))}
                </div>
              </section>
            )
          })}
        </div>
      </section>
    </div>
  )
}
