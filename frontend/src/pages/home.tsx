import { Link } from "react-router-dom"
import { ArrowRightIcon, RefreshCwIcon } from "lucide-react"

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
import { useLearned, useProgressReady } from "@/lib/progress"

function TopicProgress({ topicId, total }: { topicId: string; total: number }) {
  const learned = useLearned(topicId).size
  const ready = useProgressReady()
  return (
    <>
      <Progress
        value={ready && total > 0 ? (learned / total) * 100 : 0}
        aria-busy={!ready}
      />
      <span className="text-xs text-muted-foreground">
        {total} mục từ · đã thuộc {ready ? learned : "—"}
      </span>
    </>
  )
}

function TopicCard({ topic, index }: { topic: TopicSummary; index: number }) {
  return (
    <Link
      to={`/topic/${topic.id}`}
      className="group rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      <Card className="h-full transition-shadow hover:shadow-md">
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <Badge
              variant="secondary"
              className={`${ACCENT_BG[topic.accent]} ${ACCENT_CLASS[topic.accent]} font-mono text-xs`}
            >
              {String(index + 1).padStart(2, "0")} · {topic.eyebrow}
            </Badge>
            <ArrowRightIcon className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
          </div>
          <CardTitle className="font-heading text-lg">{topic.title}</CardTitle>
          <CardDescription className="line-clamp-2">
            {topic.description}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <TopicProgress topicId={topic.id} total={topic.itemCount} />
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

  if (loading) {
    return (
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-24" aria-busy>
        <div className="h-8 w-2/3 animate-pulse rounded-md bg-muted" />
        <div className="h-4 w-1/2 animate-pulse rounded-md bg-muted" />
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }, (_, index) => (
            <div key={index} className="h-40 animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
      </div>
    )
  }

  if (error && !topics) {
    return (
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-24">
        <h1 className="font-heading text-2xl font-bold">Thư viện từ vựng</h1>
        <ContentError message={error} onRetry={retry} />
      </div>
    )
  }

  const list = topics ?? []
  const total = list.reduce((count, topic) => count + topic.itemCount, 0)
  const tracks = [...new Set(list.map((topic) => topic.track))]

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-12 px-4 py-10">
      <section className="flex flex-col gap-6 py-8" aria-labelledby="hero-title">
        <Badge variant="secondary" className="w-fit uppercase tracking-wide">
          engstack · IELTS &amp; Oxford Vocabulary
        </Badge>
        <h1
          id="hero-title"
          className="max-w-3xl font-heading text-4xl leading-tight sm:text-5xl"
        >
          Thư viện từ, collocation và idiom cho{" "}
          <em className="not-italic text-primary">IELTS</em> và{" "}
          <em className="not-italic text-primary">Oxford 3000</em>.
        </h1>
        <p className="max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
          Mỗi mục từ đủ ngắn để ghi nhớ và đủ rõ để đưa vào câu, kèm phiên âm, ví
          dụ thật và nghĩa tiếng Việt.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <Button size="lg" nativeButton={false} render={<a href="#topics" />}>
            Bắt đầu học
            <ArrowRightIcon data-icon="inline-end" />
          </Button>
          {list[0] && (
            <Button
              size="lg"
              variant="outline"
              nativeButton={false}
              render={<Link to={`/topic/${list[0].id}`} />}
            >
              Học module đầu tiên
            </Button>
          )}
        </div>
        <dl className="grid max-w-xl grid-cols-3 gap-4 pt-4">
          <div>
            <dt className="sr-only">Số track</dt>
            <dd className="font-heading text-3xl">{tracks.length}</dd>
            <dd className="text-xs text-muted-foreground">track từ vựng</dd>
          </div>
          <div>
            <dt className="sr-only">Số module</dt>
            <dd className="font-heading text-3xl">{list.length}</dd>
            <dd className="text-xs text-muted-foreground">module</dd>
          </div>
          <div>
            <dt className="sr-only">Số mục từ</dt>
            <dd className="font-heading text-3xl">
              {total.toLocaleString("vi-VN")}
            </dd>
            <dd className="text-xs text-muted-foreground">mục từ</dd>
          </div>
        </dl>
      </section>

      {error && (
        <ContentError message={error} onRetry={retry} />
      )}

      <div className="flex flex-col gap-10" id="topics">
        {tracks.map((track) => {
          const modules = list.filter((topic) => topic.track === track)
          return (
            <section key={track} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <div className="flex items-baseline gap-3">
                  <span className="font-heading text-lg">{modules.length}</span>
                  <h2 className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                    {TRACK_LABEL[track] ?? track}
                  </h2>
                </div>
                {TRACK_DESCRIPTION[track] && (
                  <p className="text-sm text-muted-foreground">
                    {TRACK_DESCRIPTION[track]}
                  </p>
                )}
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {modules.map((topic, index) => (
                  <TopicCard key={topic.id} topic={topic} index={index} />
                ))}
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}
