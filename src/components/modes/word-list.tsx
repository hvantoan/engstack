import { useState } from "react"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { labelText, type Topic } from "@/lib/vocab"

export function WordList({ topic }: { topic: Topic }) {
  const [query, setQuery] = useState("")

  const q = query.trim().toLowerCase()
  const filtered = q
    ? topic.items.filter(
        (item) =>
          item.term.toLowerCase().includes(q) ||
          item.meaning.toLowerCase().includes(q) ||
          (item.example && item.example.toLowerCase().includes(q)) ||
          (item.exampleVi && item.exampleVi.toLowerCase().includes(q))
      )
    : topic.items

  return (
    <div className="flex flex-col gap-4">
      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={`Tìm trong ${topic.items.length} mục từ…`}
        aria-label="Tìm mục từ"
        className="max-w-md"
      />
      <ScrollArea className="h-[32rem]">
        <div className="grid gap-3 pr-4 sm:grid-cols-2">
          {filtered.map((item) => (
            <Card key={item.id} className="py-4">
              <CardContent className="flex flex-col gap-1.5 px-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-heading font-medium">{item.term}</p>
                    {item.ipa && (
                      <p className="font-mono text-xs text-muted-foreground">
                        /{item.ipa}/
                      </p>
                    )}
                  </div>
                  <Badge variant="secondary" className="shrink-0 text-[10px]">
                    {labelText(item)}
                  </Badge>
                </div>
                <p className="text-sm">{item.meaning}</p>
                {item.example && (
                  <div className="space-y-0.5 pt-0.5">
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      {item.example}
                    </p>
                    {item.exampleVi && (
                      <p className="text-[11px] leading-relaxed text-muted-foreground/80">
                        {item.exampleVi}
                      </p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
          {filtered.length === 0 && (
            <p className="col-span-2 py-8 text-center text-sm text-muted-foreground">
              Không tìm thấy “{query}”.
            </p>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
