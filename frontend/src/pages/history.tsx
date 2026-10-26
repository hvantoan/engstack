import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import {
  BookOpenIcon,
  CheckCircle2Icon,
  Clock3Icon,
  HistoryIcon,
  RotateCcwIcon,
  XCircleIcon,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { GoogleLoginButton } from "@/components/google-login-button"
import { useAuth } from "@/lib/auth"
import { fetchHistory, type HistoryItem } from "@/lib/history"
import { useTopicSummaries } from "@/lib/content"

const MODE_LABEL: Record<string, string> = {
  learn: "Học từ",
  quiz: "Trắc nghiệm",
  write: "Viết",
  match: "Ghép cặp",
  list: "Danh sách",
  review: "Ôn tập",
}

const RATING_LABEL: Record<number, string> = {
  1: "Chưa thuộc",
  2: "Khó",
  3: "Thuộc",
  4: "Dễ",
}

const RATING_KNOWN_NUM = 3

function describe(item: HistoryItem, topicTitle: (id: string) => string): {
  icon: typeof CheckCircle2Icon
  text: string
  tone: "default" | "success" | "destructive"
} {
  const topic = topicTitle(item.topicId)
  switch (item.kind) {
    case "review":
      return item.rating === RATING_KNOWN_NUM
        ? {
            icon: CheckCircle2Icon,
            text: `Nhớ lại: ${item.term ?? item.itemId} — thuộc (${topic})`,
            tone: "success",
          }
        : {
            icon: RotateCcwIcon,
            text: `Nhớ lại: ${item.term ?? item.itemId} — ${RATING_LABEL[item.rating ?? 0] ?? "chưa thuộc"} (${topic})`,
            tone: "destructive",
          }
    case "learn":
      return {
        icon: CheckCircle2Icon,
        text: `Đã đánh dấu thuộc: ${item.term ?? item.itemId} (${topic})`,
        tone: "success",
      }
    case "unlearn":
      return {
        icon: XCircleIcon,
        text: `Bỏ đánh dấu thuộc: ${item.term ?? item.itemId} (${topic})`,
        tone: "default",
      }
    case "session_start":
      return {
        icon: BookOpenIcon,
        text: `Bắt đầu phiên ${MODE_LABEL[item.mode ?? ""] ?? item.mode ?? "học"} — ${topic}`,
        tone: "default",
      }
    case "session_end":
      return {
        icon: BookOpenIcon,
        text: `Kết thúc phiên ${MODE_LABEL[item.mode ?? ""] ?? item.mode ?? "học"} — ${topic}`,
        tone: "default",
      }
    default:
      return { icon: Clock3Icon, text: topic, tone: "default" }
  }
}

function formatAt(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  return d.toLocaleString("vi-VN", {
    day: "numeric",
    month: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export function HistoryPage() {
  const { status } = useAuth()
  const { data: topics } = useTopicSummaries()
  const [items, setItems] = useState<HistoryItem[] | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (status !== "authenticated") return
    let cancelled = false
    fetchHistory(80)
      .then((res) => {
        if (!cancelled) setItems(res.items)
      })
      .catch(() => {
        if (!cancelled) setError(true)
      })
    return () => {
      cancelled = true
    }
  }, [status])

  if (status === "loading") {
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-3 px-4 py-16" aria-busy>
        <div className="h-8 w-1/3 animate-pulse rounded-md bg-muted" />
        <div className="h-40 animate-pulse rounded-xl bg-muted" />
      </div>
    )
  }

  if (status === "guest") {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-4 px-4 py-24 text-center">
        <Badge variant="secondary" className="w-fit uppercase tracking-wide">
          Hoạt động
        </Badge>
        <h1 className="font-heading text-2xl font-bold">Lịch sử cần tài khoản</h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Timeline học tập được lưu trên tài khoản để đồng bộ giữa các thiết bị.
        </p>
        <GoogleLoginButton />
      </div>
    )
  }

  const topicTitle = (id: string) => topics?.find((t) => t.id === id)?.title ?? id

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 py-8">
      <div className="flex items-center gap-2">
        <HistoryIcon className="size-5 text-primary" aria-hidden />
        <h1 className="font-heading text-2xl font-bold">Hoạt động gần đây</h1>
      </div>
      <p className="text-sm text-muted-foreground">
        "Đã đánh dấu" là bạn tự gắn cờ thuộc; "Nhớ lại" là kết quả ôn tập giãn
        cách — hai tín hiệu khác nhau về mức nhớ.
      </p>

      {error && (
        <p className="text-sm text-destructive" role="alert">
          Không tải được lịch sử. Kiểm tra kết nối và thử lại.
        </p>
      )}
      {!items && !error && (
        <div className="flex flex-col gap-2" aria-busy>
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="h-12 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      )}
      {items && items.length === 0 && (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <p className="text-sm text-muted-foreground">
            Chưa có hoạt động nào — học một module hoặc ôn tập để bắt đầu.
          </p>
          <Button nativeButton={false} render={<Link to="/" />} className="cursor-pointer">
            Về thư viện
          </Button>
        </div>
      )}
      {items && items.length > 0 && (
        <ul className="flex flex-col">
          {items.map((item, i) => {
            const { icon: Icon, text, tone } = describe(item, topicTitle)
            return (
              <li
                key={`${item.at}-${i}`}
                className="flex items-start gap-3 border-b border-border/60 py-2.5 last:border-0"
              >
                <Icon
                  className={`mt-0.5 size-4 shrink-0 ${
                    tone === "success"
                      ? "text-success"
                      : tone === "destructive"
                        ? "text-destructive"
                        : "text-muted-foreground"
                  }`}
                  aria-hidden
                />
                <span className="min-w-0 flex-1 text-sm text-foreground">{text}</span>
                <time className="shrink-0 text-xs text-muted-foreground">
                  {formatAt(item.at)}
                </time>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
