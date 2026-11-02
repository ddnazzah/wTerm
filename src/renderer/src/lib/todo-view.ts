// Display rules for the Todos tab. Pure so they can be tested without rendering.

import type { CollectorStatus, Todo, TodoBucket } from '@shared/types'

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

/** A Tomorrow todo becomes Now once the local day it was created on has passed. */
export function effectiveBucket(todo: Todo, now: Date): TodoBucket {
  if (todo.bucket !== 'tomorrow') return todo.bucket
  const isLaterDay = startOfLocalDay(now) > startOfLocalDay(new Date(todo.createdAt))
  return isLaterDay ? 'now' : 'tomorrow'
}

const byNewest = (a: Todo, b: Todo): number => b.createdAt.localeCompare(a.createdAt)

export function groupTodos(todos: Todo[], now: Date): TodoGroups {
  const open = todos.filter((t) => t.status === 'open')
  const inBucket = (bucket: TodoBucket): Todo[] =>
    open.filter((t) => effectiveBucket(t, now) === bucket).sort(byNewest)
  return {
    now: inBucket('now'),
    tomorrow: inBucket('tomorrow'),
    future: inBucket('future'),
    done: todos.filter((t) => t.status === 'done').sort(byNewest),
  }
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
