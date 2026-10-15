import { Link } from "react-router-dom"
import { ArrowRightIcon } from "lucide-react"

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
import {
  ACCENT_BG,
  ACCENT_CLASS,
  topics,
} from "@/lib/vocab"
import { useLearned } from "@/lib/progress"

function TopicProgress({ topicId, total }: { topicId: string; total: number }) {
  const learned = useLearned(topicId).size
  return (
    <>
      <Progress value={(learned / total) * 100} />
      <span className="text-xs text-muted-foreground">
        {total} mục từ · đã thuộc {learned}
      </span>
    </>
  )
}

export function HomePage() {
  const total = topics.reduce((n, t) => n + t.items.length, 0)

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-12 px-4 py-10">
      <section className="flex flex-col gap-6 py-8" aria-labelledby="hero-title">
        <Badge variant="secondary" className="w-fit uppercase tracking-wide">
          ForumFlash · IELTS Vocabulary
        </Badge>
        <h1
          id="hero-title"
          className="max-w-3xl font-heading text-4xl leading-tight sm:text-5xl"
        >
          Thư viện từ, collocation và idiom cho{" "}
          <em className="not-italic text-primary">20 chủ đề IELTS</em>.
        </h1>
        <p className="max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
          Mỗi mục từ đủ ngắn để ghi nhớ và đủ rõ để đưa vào câu, kèm phiên âm và
          ví dụ thật.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <Button size="lg" nativeButton={false} render={<a href="#topics" />}>
            Bắt đầu học
            <ArrowRightIcon data-icon="inline-end" />
          </Button>
          <Button
            size="lg"
            variant="outline"
            nativeButton={false}
            render={<Link to={`/topic/${topics[0]?.id ?? ""}`} />}
          >
            Học chủ đề đầu tiên
          </Button>
        </div>
        <dl className="grid max-w-xl grid-cols-3 gap-4 pt-4">
          <div>
            <dt className="sr-only">Số chủ đề</dt>
            <dd className="font-heading text-3xl">{topics.length}</dd>
            <dd className="text-xs text-muted-foreground">chủ đề IELTS</dd>
          </div>
          <div>
            <dt className="sr-only">Số mục từ</dt>
            <dd className="font-heading text-3xl">
              {total.toLocaleString("vi-VN")}
            </dd>
            <dd className="text-xs text-muted-foreground">mục từ</dd>
          </div>
          <div>
            <dt className="sr-only">Trình độ</dt>
            <dd className="font-heading text-3xl">B2–C1</dd>
            <dd className="text-xs text-muted-foreground">trình độ mục tiêu</dd>
          </div>
        </dl>
      </section>

      <section className="flex flex-col gap-4" id="topics">
        <div className="flex items-baseline gap-3">
          <span className="font-heading text-lg">{topics.length}</span>
          <h2 className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            Danh mục chủ đề · 200 mục từ mỗi chủ đề
          </h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {topics.map((topic, i) => (
              <Link key={topic.id} to={`/topic/${topic.id}`} className="group rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
                <Card className="h-full transition-shadow hover:shadow-md">
                  <CardHeader>
                    <div className="flex items-center justify-between gap-2">
                      <Badge
                        variant="secondary"
                        className={`${ACCENT_BG[topic.accent]} ${ACCENT_CLASS[topic.accent]} font-mono text-xs`}
                      >
                        {String(i + 1).padStart(2, "0")} · {topic.eyebrow}
                      </Badge>
                      <ArrowRightIcon className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                    </div>
                    <CardTitle className="font-heading text-lg">
                      {topic.title}
                    </CardTitle>
                    <CardDescription className="line-clamp-2">
                      {topic.description}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-2">
                    <TopicProgress topicId={topic.id} total={topic.items.length} />
                  </CardContent>
                </Card>
              </Link>
          ))}
        </div>
      </section>
    </div>
  )
}
