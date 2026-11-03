// Display rules for the Todos tab. Pure so they can be tested without rendering.

import type { CollectorStatus, Todo, TodoBucket } from '@shared/types'
import { TODOS_TAB_PATH } from './tab-uri'

/** The collector runs every 30 minutes, so this is several missed runs. */
export const STALE_AFTER_MS = 3 * 60 * 60 * 1000

const WORKTREE_SUFFIX = /\/\.claude\/worktrees\/[^/]+\/?$/

export interface TodoGroups {
  now: Todo[]
  tomorrow: Todo[]
  future: Todo[]
  done: Todo[]
}

function startOfLocalDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}

function dayKey(date: Date): string {
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function nextDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1)
}

function bucketForDate(dueDate: string, now: Date): TodoBucket {
  if (dueDate <= dayKey(now)) return 'now'
  return dueDate === dayKey(nextDay(now)) ? 'tomorrow' : 'future'
}

/**
 * A due date decides where a todo sits, so it moves up by itself as the day nears.
 * Without one, a Tomorrow todo becomes Now once the day it was created on has passed.
 */
export function effectiveBucket(todo: Todo, now: Date): TodoBucket {
  if (todo.dueDate) return bucketForDate(todo.dueDate, now)
  if (todo.bucket !== 'tomorrow') return todo.bucket
  const isLaterDay = startOfLocalDay(now) > startOfLocalDay(new Date(todo.createdAt))
  return isLaterDay ? 'now' : 'tomorrow'
}

const byNewest = (a: Todo, b: Todo): number => b.createdAt.localeCompare(a.createdAt)

/** Soonest date first, then undated todos, newest first. */
function byDueThenNewest(a: Todo, b: Todo): number {
  if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate) || byNewest(a, b)
  if (a.dueDate) return -1
  if (b.dueDate) return 1
  return byNewest(a, b)
}

/** How a due date reads on a row: Overdue, today, tomorrow, or the date itself. */
export function dueLabel(dueDate: string, now: Date): string {
  const today = dayKey(now)
  if (dueDate === today) return 'Due today'
  if (dueDate === dayKey(nextDay(now))) return 'Due tomorrow'
  const [year, month, day] = dueDate.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  const options: Intl.DateTimeFormatOptions = {
    month: 'short',
    day: 'numeric',
    ...(year === now.getFullYear() ? {} : { year: 'numeric' }),
  }
  const text = date.toLocaleDateString('en-US', options)
  return dueDate < today ? `Overdue, ${text}` : `Due ${text}`
}

export function groupTodos(todos: Todo[], now: Date): TodoGroups {
  const open = todos.filter((t) => t.status === 'open')
  const inBucket = (bucket: TodoBucket): Todo[] =>
    open.filter((t) => effectiveBucket(t, now) === bucket).sort(byDueThenNewest)
  return {
    now: inBucket('now'),
    tomorrow: inBucket('tomorrow'),
    future: inBucket('future'),
    done: todos.filter((t) => t.status === 'done').sort(byNewest),
  }
}

/**
 * Would the project's other tabs still hide its terminal once Todos closes? Only the
 * docked view shows the two side by side, and it keeps those tabs open.
 */
export function coversTerminal(
  openFiles: { projectId: string; path: string }[],
  projectId: string,
  viewMode: string
): boolean {
  if (viewMode === 'docked') return false
  return openFiles.some((file) => file.projectId === projectId && file.path !== TODOS_TAB_PATH)
}

export function projectLabel(cwd: string): string {
  const root = cwd.replace(WORKTREE_SUFFIX, '').replace(/\/+$/, '')
  return root.split('/').pop() || cwd
}

/** Why the list might be incomplete, or null when collection looks healthy. */
export function collectorWarning(status: CollectorStatus | null, now: Date): string | null {
  if (!status) return 'The background collector has not run yet. Run `pnpm todos:install` to start it.'
  if (status.lastError) return `The last collection failed: ${status.lastError}`
  const lastSuccess = status.lastSuccessAt ? Date.parse(status.lastSuccessAt) : 0
  if (now.getTime() - lastSuccess > STALE_AFTER_MS) {
    return 'This list may be out of date: the collector has not succeeded recently.'
  }
  return null
}
