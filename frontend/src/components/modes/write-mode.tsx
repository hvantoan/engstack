import { useState } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import type { Topic, VocabItem } from "@/lib/vocab"

function normalize(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[.,!?;:'"()]/g, "")
}

export function WriteMode({ topic }: { topic: Topic }) {
  const items = topic.items
  const [item, setItem] = useState<VocabItem>(
    () => items[Math.floor(Math.random() * items.length)]
  )
  const [value, setValue] = useState("")
  const [result, setResult] = useState<"idle" | "correct" | "wrong">("idle")

  const check = () => {
    if (!value.trim() || result !== "idle") return
    setResult(normalize(value) === normalize(item.term) ? "correct" : "wrong")
  }

  const next = () => {
    let nextItem = items[Math.floor(Math.random() * items.length)]
    while (nextItem.term === item.term && items.length > 1) {
      nextItem = items[Math.floor(Math.random() * items.length)]
    }
    setItem(nextItem)
    setValue("")
    setResult("idle")
  }

  return (
    <Card className="mx-auto w-full max-w-2xl">
      <CardHeader>
        <Badge variant="secondary" className="w-fit">
          Viết lại mục từ
        </Badge>
        <CardTitle className="font-heading text-2xl">{item.meaning}</CardTitle>
        {item.example && (
          <div className="space-y-1">
            <p className="text-sm leading-relaxed text-muted-foreground">
              {item.example}
            </p>
            {item.exampleVi && (
              <p className="text-xs leading-relaxed text-muted-foreground/80">
                {item.exampleVi}
              </p>
            )}
          </div>
        )}
      </CardHeader>
      <CardContent>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            check()
          }}
          className="flex gap-2"
        >
          <Input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Gõ lại mục từ tiếng Anh…"
            aria-label="Viết lại mục từ tiếng Anh"
            autoFocus
          />
          <Button type="submit" disabled={result !== "idle" || !value.trim()}>
            Kiểm tra
          </Button>
        </form>
        {result === "correct" && (
          <p className="pt-3 text-sm font-medium text-success">
            Chính xác — {item.term}
            {item.ipa ? ` /${item.ipa}/` : ""}
          </p>
        )}
        {result === "wrong" && (
          <p className="pt-3 text-sm font-medium text-destructive">
            Chưa đúng. Đáp án: <span className="font-heading">{item.term}</span>
            {item.ipa ? ` /${item.ipa}/` : ""}
          </p>
        )}
      </CardContent>
      <CardFooter className="justify-end">
        <Button variant="outline" onClick={next}>
          Từ tiếp theo
        </Button>
      </CardFooter>
    </Card>
  )
}
