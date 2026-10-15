import { useState } from "react"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { LABEL_TEXT, type Topic } from "@/lib/vocab"

export function WordList({ topic }: { topic: Topic }) {
  const [query, setQuery] = useState("")

  const filtered = query.trim()
    ? topic.items.filter(
        (item) =>
          item.term.toLowerCase().includes(query.toLowerCase()) ||
          item.meaning.toLowerCase().includes(query.toLowerCase())
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
            <Card key={item.term} className="py-4">
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
                    {LABEL_TEXT[item.label]}
                  </Badge>
                </div>
                <p className="text-sm">{item.meaning}</p>
                {item.example && (
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    {item.example}
                  </p>
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
