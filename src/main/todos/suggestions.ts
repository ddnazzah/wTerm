// Pure parsing and merging for the collector's suggestions.jsonl.
//
// That file is built from model output derived from transcripts, so it is untrusted.
// `sessionId` matters most: it is interpolated into a shell command when a session
// is resumed, which is why it must be a strict UUID.

import { isAbsolute } from 'node:path'
import { TODO_BUCKETS, type Todo, type TodoBucket } from '@shared/types'

export const CLOSED_RETENTION_MS = 30 * 24 * 60 * 60 * 1000

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const TODO_ID = /^[a-f0-9]{16}$/
const MAX_TITLE_CHARS = 200
const MAX_DETAIL_CHARS = 1000
const MAX_BRANCH_CHARS = 250

export type SuggestionEvent = { type: 'add'; todo: Todo } | { type: 'resolve'; id: string }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function isBucket(value: unknown): value is TodoBucket {
  return TODO_BUCKETS.includes(value as TodoBucket)
}

function parseAdd(raw: Record<string, unknown>): SuggestionEvent | null {
  const id = str(raw.id)
  const title = str(raw.title).trim().slice(0, MAX_TITLE_CHARS)
  const sessionId = str(raw.sessionId)
  const cwd = str(raw.cwd)
  const createdAt = str(raw.createdAt)
  const { bucket } = raw

  if (!TODO_ID.test(id) || !title || !UUID.test(sessionId)) return null
  if (!isAbsolute(cwd) || !isBucket(bucket) || Number.isNaN(Date.parse(createdAt))) return null

  return {
    type: 'add',
    todo: {
      id,
      title,
      detail: str(raw.detail).trim().slice(0, MAX_DETAIL_CHARS),
      bucket,
      status: 'open',
      sessionId,
      cwd,
      branch: str(raw.branch).slice(0, MAX_BRANCH_CHARS),
      createdAt,
    },
  }
}

function parseLine(line: string): SuggestionEvent | null {
  let raw: unknown
  try {
    raw = JSON.parse(line)
  } catch {
    return null
  }
  if (!isRecord(raw)) return null
  if (raw.type === 'add') return parseAdd(raw)
  if (raw.type === 'resolve' && TODO_ID.test(str(raw.id))) return { type: 'resolve', id: str(raw.id) }
  return null
}

export function parseSuggestions(text: string): SuggestionEvent[] {
  return text
    .split('\n')
    .filter((line) => line.trim())
    .map(parseLine)
    .filter((event): event is SuggestionEvent => event !== null)
}

/**
 * Merge events into the list. Known ids are never re-added, so replaying the file
 * cannot reopen a todo the user closed. A resolve only closes an open todo.
 */
export function applyEvents(todos: Todo[], events: SuggestionEvent[], nowIso: string): Todo[] {
  return events.reduce<Todo[]>((current, event) => {
    if (event.type === 'add') {
      return current.some((t) => t.id === event.todo.id) ? current : [...current, event.todo]
    }
    return current.map((t) =>
      t.id === event.id && t.status === 'open' ? { ...t, status: 'done', closedAt: nowIso } : t
    )
  }, todos)
}

export function pruneClosed(todos: Todo[], nowMs: number): Todo[] {
  return todos.filter((t) => {
    if (t.status === 'open' || !t.closedAt) return true
    return nowMs - Date.parse(t.closedAt) < CLOSED_RETENTION_MS
  })
}
