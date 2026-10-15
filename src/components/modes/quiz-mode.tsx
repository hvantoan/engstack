import { useEffect, useMemo, useRef, useState } from "react"
import {
  CheckCircle2Icon,
  RotateCcwIcon,
  Volume2Icon,
  XCircleIcon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import type { Topic, VocabItem } from "@/lib/vocab"
import { cn } from "@/lib/utils"
import { speakTerm } from "@/lib/speech"

type Question = {
  item: VocabItem
  options: string[]
}

function makeQuestion(items: VocabItem[], exclude: Set<string>): Question {
  const unseen = items.filter((i) => !exclude.has(i.term))
  const item =
    unseen.length > 0
      ? unseen[Math.floor(Math.random() * unseen.length)]
      : items[Math.floor(Math.random() * items.length)]
  const meaningPool = [
    ...new Set(
      items.filter((i) => i.term !== item.term).map((i) => i.meaning)
    ),
  ]
  const distractors = meaningPool.sort(() => Math.random() - 0.5).slice(0, 3)
  const options = [...distractors, item.meaning].sort(() => Math.random() - 0.5)
  return { item, options }
}

export function QuizMode({ topic }: { topic: Topic }) {
  const items = topic.items
  const [asked, setAsked] = useState<Set<string>>(new Set())
  const [question, setQuestion] = useState<Question>(() =>
    makeQuestion(items, new Set())
  )
  const [picked, setPicked] = useState<string | null>(null)
  const [score, setScore] = useState({ correct: 0, total: 0 })

  const done = score.total >= 10

  const pick = (option: string) => {
    if (picked) return
    setPicked(option)
    setScore((s) => ({
      correct: s.correct + (option === question.item.meaning ? 1 : 0),
      total: s.total + 1,
    }))
  }

  const next = () => {
    if (done) {
      setAsked(new Set())
      setScore({ correct: 0, total: 0 })
      setQuestion(makeQuestion(items, new Set()))
      setPicked(null)
      return
    }
    const seen = new Set(asked)
    seen.add(question.item.term)
    setAsked(seen)
    setQuestion(makeQuestion(items, seen))
    setPicked(null)
  }

  const stateRef = useRef({ next, pick, question, picked })
  useEffect(() => {
    stateRef.current = { next, pick, question, picked }
  })
  // Keyboard shortcut listener: 1-4 for options, Enter for next
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return

      // Handle numbers 1-4 to pick option
      const match = e.code.match(/^(?:Digit|Numpad)([1-9])$/)
      if (match) {
        const optionIndex = Number.parseInt(match[1], 10) - 1
        const { question: q, picked: p, pick: doPick } = stateRef.current
        if (optionIndex >= 0 && optionIndex < q.options.length) {
          e.preventDefault()
          if (!p) {
            doPick(q.options[optionIndex])
          }
        }
        return
      }

      // Handle Enter to advance to next question
      if (e.key === "Enter") {
        if (stateRef.current.picked !== null) {
          e.preventDefault()
          stateRef.current.next()
        }
        return
      }

      // Handle 'A' or 'P' to play audio
      if (e.key === "a" || e.key === "A" || e.key === "p" || e.key === "P") {
        e.preventDefault()
        speakTerm(stateRef.current.question.item.term)
        return
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [])

  const round = useMemo(() => `${score.total}/10`, [score])

  return (
    <Card className="mx-auto w-full max-w-3xl border-border/80 shadow-xs">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <Badge variant="secondary" className="font-medium text-xs">
            Trắc nghiệm · Chọn nghĩa phù hợp
          </Badge>
          <div className="flex items-center gap-3">
            <span className="text-xs font-semibold text-muted-foreground">
              Vòng: <span className="text-foreground">{round}</span>
            </span>
            <span className="rounded-md bg-success/10 px-2 py-0.5 text-xs font-medium text-success">
              Đúng: {score.correct}
            </span>
          </div>
        </div>

        <div className="flex items-center justify-between pt-2">
          <div>
            <CardTitle className="font-heading text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              {question.item.term}
            </CardTitle>
            {question.item.ipa && (
              <p className="mt-1 font-mono text-sm text-primary font-medium">
                /{question.item.ipa}/
              </p>
            )}
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => speakTerm(question.item.term)}
            title="Nghe phát âm (Phím A)"
            aria-label={`Nghe phát âm từ ${question.item.term}`}
            className="size-10 rounded-full text-muted-foreground hover:bg-primary/10 hover:text-primary"
          >
            <Volume2Icon className="size-5" />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="flex flex-col gap-3">
        <div className="grid gap-3 sm:grid-cols-2">
          {question.options.map((option, idx) => {
            const isCorrect = option === question.item.meaning
            const isPicked = option === picked
            return (
              <Button
                key={option}
                variant="outline"
                disabled={picked !== null}
                onClick={() => pick(option)}
                className={cn(
                  "group relative h-auto min-h-16 justify-start whitespace-normal px-4 py-3.5 text-left text-base transition-all rounded-xl cursor-pointer",
                  picked === null &&
                    "hover:border-primary/60 hover:bg-muted/40 hover:shadow-xs",
                  picked &&
                    isCorrect &&
                    "border-success bg-success/10 text-foreground font-medium ring-1 ring-success",
                  picked &&
                    isPicked &&
                    !isCorrect &&
                    "border-destructive bg-destructive/10 text-destructive font-medium"
                )}
              >
                <span
                  className={cn(
                    "mr-3 inline-flex size-6 shrink-0 items-center justify-center rounded-md border font-mono text-xs font-bold transition-colors",
                    picked === null &&
                      "border-border bg-muted/80 text-muted-foreground group-hover:border-primary/40 group-hover:text-primary",
                    picked &&
                      isCorrect &&
                      "border-success bg-success text-success-foreground",
                    picked &&
                      isPicked &&
                      !isCorrect &&
                      "border-destructive bg-destructive text-destructive-foreground"
                  )}
                >
                  {idx + 1}
                </span>
                <span className="flex-1 leading-snug">{option}</span>
                {picked && isCorrect && (
                  <CheckCircle2Icon className="ml-2 size-5 shrink-0 text-success" />
                )}
                {picked && isPicked && !isCorrect && (
                  <XCircleIcon className="ml-2 size-5 shrink-0 text-destructive" />
                )}
              </Button>
            )
          })}
        </div>

        {/* Ngữ cảnh câu ví dụ xuất hiện sau khi trả lời để học sinh hiểu sâu */}
        {picked !== null && question.item.example && (
          <div className="mt-2 rounded-xl border border-border/80 bg-muted/30 p-4 text-sm transition-all">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
              Ngữ cảnh thực tế:
            </p>
            <p className="leading-relaxed text-foreground font-medium">
              "{question.item.example}"
            </p>
          </div>
        )}
      </CardContent>

      <CardFooter className="flex flex-col gap-3 pt-2 sm:flex-row sm:items-center sm:justify-between border-t border-border/50">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {picked === null ? (
            <>
              <span className="flex items-center gap-1">
                <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[11px] font-semibold text-foreground">
                  1-4
                </kbd>{" "}
                chọn đáp án
              </span>
              <span>·</span>
              <span className="flex items-center gap-1">
                <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[11px] font-semibold text-foreground">
                  A
                </kbd>{" "}
                nghe phát âm
              </span>
            </>
          ) : (
            <p className="font-medium text-foreground">
              {done
                ? `Hoàn thành 10 câu! Đúng ${score.correct}/10.`
                : picked === question.item.meaning
                  ? "✓ Chính xác!"
                  : `✕ Chưa đúng. Nghĩa: ${question.item.meaning}`}
            </p>
          )}
        </div>

        {picked && (
          <Button
            onClick={next}
            className="w-full sm:w-auto font-medium cursor-pointer shadow-xs"
          >
            {done ? (
              <>
                <RotateCcwIcon className="mr-1.5 size-4" /> Làm lại vòng mới
              </>
            ) : (
              <>
                Câu tiếp theo
                <kbd className="ml-2 rounded bg-primary-foreground/20 px-1.5 py-0.5 font-mono text-[11px]">
                  Enter ↵
                </kbd>
              </>
            )}
          </Button>
        )}
      </CardFooter>
    </Card>
  )
}
