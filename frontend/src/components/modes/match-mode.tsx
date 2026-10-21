import { useEffect, useRef, useState } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import type { Topic } from "@/lib/vocab"
import { cn } from "@/lib/utils"

const PAIRS = 6

type Tile = {
  key: string
  text: string
  matchId: string
  kind: "term" | "meaning"
}

function shuffled<T>(arr: T[]): T[] {
  const next = [...arr]
  for (let i = next.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[next[i], next[j]] = [next[j], next[i]]
  }
  return next
}

function makeTiles(topic: Topic, round: number): Tile[] {
  // Rounds walk the topic in authored order; rotate the window on retry to
  // reject samples whose meanings collide — identical meaning tiles make a
  // round a coin flip; bounded retries, then accept best effort.
  const all = topic.items
  const start = (round * PAIRS) % Math.max(1, all.length)
  let items: Topic["items"] = []
  for (let attempt = 0; attempt < 10; attempt++) {
    const offset = (start + attempt) % Math.max(1, all.length)
    items = Array.from(
      { length: Math.min(PAIRS, all.length) },
      (_, k) => all[(offset + k) % all.length]
    )
    if (new Set(items.map((i) => i.meaning)).size === items.length) break
  }
  const flat: Tile[] = items.flatMap((item, i) => [
    { key: `t-${round}-${i}`, text: item.term, matchId: `${round}-${i}`, kind: "term" },
    { key: `m-${round}-${i}`, text: item.meaning, matchId: `${round}-${i}`, kind: "meaning" },
  ])
  return shuffled(flat)
}

export function MatchMode({ topic }: { topic: Topic }) {
  const [round, setRound] = useState(0)
  const [tiles, setTiles] = useState<Tile[]>(() => makeTiles(topic, 0))
  const [selected, setSelected] = useState<Tile | null>(null)
  const [matched, setMatched] = useState<Set<string>>(new Set())
  const [wrong, setWrong] = useState<Set<string>>(new Set())
  const wrongTimer = useRef<number | undefined>(undefined)

  useEffect(() => {
    return () => clearTimeout(wrongTimer.current)
  }, [])

  const click = (tile: Tile) => {
    if (matched.has(tile.key)) return
    if (!selected) {
      setSelected(tile)
      return
    }
    if (selected.key === tile.key) {
      setSelected(null)
      return
    }
    if (selected.matchId === tile.matchId && selected.kind !== tile.kind) {
      setMatched((m) => new Set(m).add(selected.key).add(tile.key))
      setSelected(null)
    } else {
      setWrong(new Set([selected.key, tile.key]))
      setSelected(null)
      clearTimeout(wrongTimer.current)
      wrongTimer.current = setTimeout(() => setWrong(new Set()), 500)
    }
  }

  const allDone = matched.size === tiles.length
  return (
    <Card className="mx-auto w-full max-w-3xl">
      <CardHeader>
        <div className="flex items-center justify-between">
          <Badge variant="secondary" className="w-fit">
            Nối từ với nghĩa
          </Badge>
          <span className="text-sm text-muted-foreground">
            {matched.size / 2}/{PAIRS} cặp
          </span>
        </div>
        <CardTitle className="text-sm font-normal text-muted-foreground">
          Chạm vào một mục từ tiếng Anh rồi chạm vào nghĩa tiếng Việt tương ứng.
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {tiles.map((tile) => {
            const isMatched = matched.has(tile.key)
            const isSelected = selected?.key === tile.key
            const isWrong = wrong.has(tile.key)
            return (
              <button
                key={tile.key}
                disabled={isMatched}
                aria-pressed={isSelected}
                onClick={() => click(tile)}
                className={cn(
                  "min-h-16 rounded-lg border p-3 text-left text-sm leading-snug transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                  tile.kind === "meaning" && "text-muted-foreground",
                  isMatched && "border-success/40 bg-success/10 opacity-60",
                  isSelected && "border-primary bg-primary/10",
                  isWrong && "border-destructive bg-destructive/10"
                )}
              >
                {tile.text}
              </button>
            )
          })}
        </div>
      </CardContent>
      <CardFooter className="justify-between">
        <p className="text-sm text-muted-foreground">
          {allDone ? "Hoàn thành! Chơi lượt mới." : "Chọn một cặp phù hợp."}
        </p>
        <Button
          variant="outline"
          onClick={() => {
            const next = round + 1
            setRound(next)
            setTiles(makeTiles(topic, next))
            setSelected(null)
            setMatched(new Set())
          }}
        >
          Lượt mới
        </Button>
      </CardFooter>
    </Card>
  )
}
