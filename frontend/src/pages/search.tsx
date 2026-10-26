import { useEffect, useState } from "react"
import { Link, useSearchParams } from "react-router-dom"
import { ChevronLeftIcon, ChevronRightIcon, SearchIcon, Volume2Icon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { labelText } from "@/lib/vocab"
import { speakTerm } from "@/lib/speech"
import { searchItems, type SearchResponse } from "@/lib/history"
import { CEFR_LEVELS, TRACKS, type CefrLevel, type Track } from "@/lib/vocab-schema"
import { TRACK_LABEL } from "@/lib/vocab"

const PER_PAGE = 20

export function SearchPage() {
  const [params, setParams] = useSearchParams()
  const q = params.get("q") ?? ""
  const track = (params.get("track") ?? "") as Track | ""
  const level = (params.get("level") ?? "") as CefrLevel | ""
  const page = Math.max(1, Number(params.get("page") ?? "1") || 1)

  const [data, setData] = useState<SearchResponse | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false
    searchItems({ q, track, level, page, perPage: PER_PAGE })
      .then((res) => {
        if (cancelled) return
        setData(res)
        setError(false)
      })
      .catch(() => {
        if (!cancelled) setError(true)
      })
    return () => {
      cancelled = true
    }
  }, [q, track, level, page])

  const setFilter = (key: string, value: string) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    next.delete("page")
    setParams(next, { replace: true })
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PER_PAGE)) : 1

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-5 px-4 py-8">
      <div className="flex flex-col gap-3">
        <h1 className="font-heading text-2xl font-bold">Tìm kiếm</h1>
        <form
          className="flex flex-col gap-2 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault()
            const input = e.currentTarget.querySelector("input")
            setFilter("q", input?.value.trim() ?? "")
          }}
        >
          <input
            type="search"
            defaultValue={q}
            placeholder="Từ vựng hoặc nghĩa tiếng Việt…"
            aria-label="Tìm từ vựng"
            className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <Button type="submit" className="cursor-pointer">
            <SearchIcon data-icon="inline-start" />
            Tìm
          </Button>
        </form>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <select
            aria-label="Lọc theo track"
            value={track}
            onChange={(e) => setFilter("track", e.target.value)}
            className="h-9 cursor-pointer rounded-md border border-border bg-background px-2 text-sm"
          >
            <option value="">Mọi track</option>
            {TRACKS.map((t) => (
              <option key={t} value={t}>
                {TRACK_LABEL[t] ?? t}
              </option>
            ))}
          </select>
          <select
            aria-label="Lọc theo cấp độ"
            value={level}
            onChange={(e) => setFilter("level", e.target.value)}
            className="h-9 cursor-pointer rounded-md border border-border bg-background px-2 text-sm"
          >
            <option value="">Mọi cấp độ</option>
            {CEFR_LEVELS.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
          {data && (
            <span className="text-xs text-muted-foreground">
              {data.total} kết quả{q ? ` cho "${q}"` : ""}
            </span>
          )}
        </div>
      </div>

      {error && (
        <p className="text-sm text-destructive" role="alert">
          Không tải được kết quả. Kiểm tra kết nối và thử lại.
        </p>
      )}

      {!data && !error && (
        <div className="flex flex-col gap-2" aria-busy>
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl bg-muted" />
          ))}
        </div>
      )}

      {data && data.items.length === 0 && (
        <p className="py-10 text-center text-sm text-muted-foreground">
          Không có từ nào khớp. Thử từ khoá khác hoặc bỏ bớt bộ lọc.
        </p>
      )}

      {data && data.items.length > 0 && (
        <ul className="flex flex-col gap-2">
          {data.items.map((item) => (
            <li key={item.id}>
              <Link
                to={`/topic/${item.topicId}?item=${encodeURIComponent(item.id)}`}
                className="flex flex-col gap-1 rounded-xl border border-border bg-card p-3 transition-shadow hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:flex-row sm:items-center sm:gap-3"
              >
                <div className="flex min-w-48 items-baseline gap-2">
                  <span className="font-heading text-base font-semibold text-foreground">
                    {item.term}
                  </span>
                  {item.ipa && (
                    <span className="font-mono text-xs text-primary">/{item.ipa}/</span>
                  )}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      speakTerm(item.term)
                    }}
                    aria-label={`Nghe phát âm ${item.term}`}
                    className="cursor-pointer rounded-full p-1 text-muted-foreground hover:bg-primary/10 hover:text-primary"
                  >
                    <Volume2Icon className="size-3.5" />
                  </button>
                </div>
                <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
                  {item.meaning}
                </span>
                <span className="flex items-center gap-1.5">
                  <Badge variant="secondary" className="font-mono text-[10px]">
                    {labelText(item)}
                  </Badge>
                  {item.level && (
                    <Badge variant="outline" className="text-[10px]">
                      {item.level}
                    </Badge>
                  )}
                  <span className="text-xs text-muted-foreground">{item.topicTitle}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {data && totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 pt-2 text-sm">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setFilter("page", String(page - 1))}
            className="cursor-pointer"
          >
            <ChevronLeftIcon data-icon="inline-start" />
            Trước
          </Button>
          <span className="text-xs text-muted-foreground">
            Trang {data.page} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setFilter("page", String(page + 1))}
            className="cursor-pointer"
          >
            Tiếp
            <ChevronRightIcon data-icon="inline-end" />
          </Button>
        </div>
      )}
    </div>
  )
}
