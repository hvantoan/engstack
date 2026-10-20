/**
 * Content read-path qua API (`GET /topics`, `GET /topics/{id}`).
 *
 * `src/data/**` chỉ còn là seed cho backend; page không đọc JSON nữa.
 */
import { useCallback, useEffect, useState } from "react"

import { ApiError, request } from "./api"
import {
  ACCENTS,
  CEFR_LEVELS,
  PARTS_OF_SPEECH,
  TRACKS,
  WORD_LABELS,
  type AccentName,
  type CefrLevel,
  type ModuleItem,
  type PartOfSpeech,
  type Track,
  type WordLabel,
} from "./vocab-schema"

export type TopicSummary = {
  id: string
  track: Track
  title: string
  description: string
  eyebrow: string
  accent: AccentName
  level?: CefrLevel
  orderIndex: number
  related: string[]
  itemCount: number
}

export type TopicDetail = TopicSummary & { items: ModuleItem[] }

/** Tên cũ giữ nguyên cho consumer (`learn-mode`, `word-list`, ...). */
export type Topic = TopicDetail

export const CONTENT_ERROR = "Không tải được nội dung. Kiểm tra kết nối và thử lại."

const CONTENT_VERSION = import.meta.env.VITE_CONTENT_VERSION ?? "dev"

type ApiSummary = Omit<TopicSummary, "level" | "track" | "accent"> & {
  track: string
  accent: string
  level?: string | null
}

type ApiItem = Omit<ModuleItem, "track" | "label" | "pos" | "level"> & {
  track: string
  label: string
  pos: string[] | null
  level?: string | null
}

type ApiDetail = ApiSummary & { items: ApiItem[] }

const TRACK_SET = new Set<string>(TRACKS)
const ACCENT_SET = new Set<string>(ACCENTS)
const LABEL_SET = new Set<string>(WORD_LABELS)

/** Backend trả string; thu hẹp bằng membership thay vì `as` mù. */
function trackOf(value: string): Track {
  return TRACK_SET.has(value) ? (value as Track) : "ielts"
}

function accentOf(value: string): AccentName {
  return ACCENT_SET.has(value) ? (value as AccentName) : "blue"
}

function labelOf(value: string): WordLabel {
  return LABEL_SET.has(value) ? (value as WordLabel) : "word"
}

function partOfSpeech(p: string): PartOfSpeech | null {
  return (PARTS_OF_SPEECH as readonly string[]).includes(p) ? (p as PartOfSpeech) : null
}

function levelOf(value: string | null | undefined): CefrLevel | undefined {
  return value && (CEFR_LEVELS as readonly string[]).includes(value)
    ? (value as CefrLevel)
    : undefined
}

function toSummary(raw: ApiSummary): TopicSummary {
  return {
    id: raw.id,
    track: trackOf(raw.track),
    title: raw.title,
    description: raw.description,
    eyebrow: raw.eyebrow,
    accent: accentOf(raw.accent),
    level: levelOf(raw.level),
    orderIndex: raw.orderIndex,
    related: raw.related ?? [],
    itemCount: raw.itemCount,
  }
}

function toDetail(raw: ApiDetail): TopicDetail {
  return {
    ...toSummary(raw),
    items: (raw.items ?? []).map((item) => ({
      id: item.id,
      topicId: item.topicId,
      track: trackOf(item.track),
      term: item.term,
      ipa: item.ipa,
      label: labelOf(item.label),
      meaning: item.meaning,
      example: item.example,
      exampleVi: item.exampleVi,
      definition: item.definition,
      level: levelOf(item.level),
      pos: (item.pos ?? []).map(partOfSpeech).filter((p): p is PartOfSpeech => p !== null),
    })),
  }
}

export type Resource<T> = {
  data: T | null
  error: string | null
  notFound: boolean
  loading: boolean
  retry: () => void
}

const EMPTY_NOT_FOUND = {
  data: null,
  error: null,
  notFound: true,
  loading: false,
  retry: () => undefined,
} as const

function useResource<T>(
  key: string,
  load: (signal: AbortSignal) => Promise<T>,
): Resource<T> {
  const [attempt, setAttempt] = useState(0)
  const [state, setState] = useState<{
    key: string
    data: T | null
    error: string | null
    notFound: boolean
  }>({ key, data: null, error: null, notFound: false })

  useEffect(() => {
    if (!key) return
    const controller = new AbortController()
    load(controller.signal)
      .then((data) => setState({ key, data, error: null, notFound: false }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        const notFound = error instanceof ApiError && error.status === 404
        setState({ key, data: null, error: notFound ? null : CONTENT_ERROR, notFound })
      })
    return () => controller.abort()
  }, [key, attempt, load])

  // `key` đổi → không bao giờ render dữ liệu của topic trước đó.
  const current = state.key === key ? state : null
  const retry = useCallback(() => {
    setState({ key, data: null, error: null, notFound: false })
    setAttempt((n) => n + 1)
  }, [key])

  return {
    data: current?.data ?? null,
    error: current?.error ?? null,
    notFound: current?.notFound ?? false,
    loading: Boolean(key) && !current,
    retry,
  }
}

export function useTopicSummaries(): Resource<TopicSummary[]> {
  const load = useCallback(async (signal: AbortSignal) => {
    const list = await request<ApiSummary[]>(
      `/topics?v=${encodeURIComponent(CONTENT_VERSION)}`,
      { signal },
    )
    return list
      .map(toSummary)
      .sort((a, b) => a.orderIndex - b.orderIndex || a.id.localeCompare(b.id))
  }, [])

  return useResource("topics", load)
}

export function useTopic(id: string): Resource<TopicDetail> {
  const load = useCallback(
    async (signal: AbortSignal) =>
      toDetail(
        await request<ApiDetail>(`/topics/${encodeURIComponent(id)}`, {
          signal,
          // Revalidate qua ETag: list cache 24h không áp cho nội dung seed lại.
          cache: "no-cache",
        }),
      ),
    [id],
  )

  const resource = useResource(id, load)
  return id ? resource : { ...EMPTY_NOT_FOUND }
}
