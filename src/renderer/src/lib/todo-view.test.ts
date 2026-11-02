import { describe, expect, test } from 'vitest'
import type { CollectorStatus, Todo } from '@shared/types'
import { STALE_AFTER_MS, collectorWarning, effectiveBucket, groupTodos, projectLabel } from './todo-view'

const at = (iso: string): Date => new Date(iso)

const todo = (overrides: Partial<Todo> = {}): Todo => ({
  id: 'a',
  title: 'T',
  detail: '',
  bucket: 'now',
  status: 'open',
  sessionId: 's',
  cwd: '/repo',
  branch: 'main',
  createdAt: '2026-11-02T10:00:00',
  ...overrides,
})

describe('effectiveBucket', () => {
  test('a tomorrow todo stays in Tomorrow on the day it was created', () => {
    expect(effectiveBucket(todo({ bucket: 'tomorrow' }), at('2026-11-02T23:59:00'))).toBe('tomorrow')
  })

  test('a tomorrow todo moves to Now from the next local day', () => {
    expect(effectiveBucket(todo({ bucket: 'tomorrow' }), at('2026-11-03T00:01:00'))).toBe('now')
  })

  test('now and future todos never move', () => {
    const later = at('2027-01-01T00:00:00')
    expect(effectiveBucket(todo({ bucket: 'now' }), later)).toBe('now')
    expect(effectiveBucket(todo({ bucket: 'future' }), later)).toBe('future')
  })
})

describe('groupTodos', () => {
  const now = at('2026-11-03T09:00:00')

  test('sorts open todos into buckets, newest first, and rolled-over ones into Now', () => {
    const groups = groupTodos(
      [
        todo({ id: 'old-now', createdAt: '2026-11-01T10:00:00' }),
        todo({ id: 'new-now', createdAt: '2026-11-03T08:00:00' }),
        todo({ id: 'rolled', bucket: 'tomorrow', createdAt: '2026-11-02T10:00:00' }),
        todo({ id: 'tmrw', bucket: 'tomorrow', createdAt: '2026-11-03T08:00:00' }),
        todo({ id: 'fut', bucket: 'future' }),
      ],
      now
    )
    expect(groups.now.map((t) => t.id)).toEqual(['new-now', 'rolled', 'old-now'])
    expect(groups.tomorrow.map((t) => t.id)).toEqual(['tmrw'])
    expect(groups.future.map((t) => t.id)).toEqual(['fut'])
  })

  test('done todos are listed apart, and dismissed todos are hidden', () => {
    const groups = groupTodos(
      [todo({ id: 'd', status: 'done', closedAt: 'x' }), todo({ id: 'x', status: 'dismissed' })],
      now
    )
    expect(groups.done.map((t) => t.id)).toEqual(['d'])
    expect(groups.now).toEqual([])
  })
})

describe('projectLabel', () => {
  test('names the repo, not the worktree folder', () => {
    expect(projectLabel('/Users/me/app/.claude/worktrees/feature')).toBe('app')
  })

  test('uses the last folder otherwise', () => {
    expect(projectLabel('/Users/me/app/')).toBe('app')
  })
})

describe('collectorWarning', () => {
  const now = at('2026-11-02T12:00:00.000Z')
  const status = (overrides: Partial<CollectorStatus>): CollectorStatus => ({
    lastRunAt: now.toISOString(),
    lastSuccessAt: now.toISOString(),
    lastError: null,
    ...overrides,
  })

  test('says so when the collector has never run', () => {
    expect(collectorWarning(null, now)).toMatch(/has not run/)
  })

  test('is silent for a healthy recent run', () => {
    expect(collectorWarning(status({}), now)).toBeNull()
  })

  test('surfaces the last error', () => {
    expect(collectorWarning(status({ lastError: 'auth expired' }), now)).toContain('auth expired')
  })

  test('warns when the last success is old even with no error', () => {
    const lastSuccessAt = new Date(now.getTime() - STALE_AFTER_MS - 1000).toISOString()
    expect(collectorWarning(status({ lastSuccessAt }), now)).toMatch(/may be out of date/)
  })
})
