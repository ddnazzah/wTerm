import { describe, expect, test } from 'vitest'
import type { Todo } from '@shared/types'
import { CLOSED_RETENTION_MS, applyEvents, parseSuggestions, pruneClosed } from './suggestions'

const SESSION = '11111111-1111-4111-8111-111111111111'
const NOW = '2026-11-02T12:00:00.000Z'

const addEvent = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  type: 'add',
  id: 'aaaaaaaaaaaaaaaa',
  title: 'Approve PR',
  detail: 'Waiting on you',
  bucket: 'now',
  sessionId: SESSION,
  cwd: '/repo',
  branch: 'main',
  createdAt: NOW,
  ...overrides,
})

const line = (event: unknown): string => `${JSON.stringify(event)}\n`

const openTodo = (overrides: Partial<Todo> = {}): Todo => ({
  id: 'aaaaaaaaaaaaaaaa',
  title: 'Approve PR',
  detail: '',
  bucket: 'now',
  status: 'open',
  sessionId: SESSION,
  cwd: '/repo',
  branch: 'main',
  createdAt: NOW,
  ...overrides,
})

describe('parseSuggestions', () => {
  test('parses add and resolve events', () => {
    const events = parseSuggestions(line(addEvent()) + line({ type: 'resolve', id: 'bbbbbbbbbbbbbbbb' }))
    expect(events.map((e) => e.type)).toEqual(['add', 'resolve'])
  })

  test('skips malformed lines and keeps the rest', () => {
    const events = parseSuggestions(`not json\n${line(addEvent())}{"type":\n`)
    expect(events).toHaveLength(1)
  })

  test.each([
    ['a session id that could inject a shell command', { sessionId: 'x; rm -rf ~' }],
    ['a relative cwd', { cwd: 'repo' }],
    ['an unknown bucket', { bucket: 'someday' }],
    ['an empty title', { title: '  ' }],
    ['a malformed id', { id: '../../etc' }],
    ['an unparseable date', { createdAt: 'yesterday' }],
    ['a non-string title', { title: 42 }],
  ])('rejects %s', (_name, overrides) => {
    expect(parseSuggestions(line(addEvent(overrides)))).toEqual([])
  })

  test('rejects an unknown event type and a resolve with a bad id', () => {
    expect(parseSuggestions(line({ type: 'wipe' }) + line({ type: 'resolve', id: 'no' }))).toEqual([])
  })

  test('clamps oversized text from the file', () => {
    const [event] = parseSuggestions(line(addEvent({ title: 'x'.repeat(5000) })))
    expect(event.type === 'add' && event.todo.title.length).toBeLessThanOrEqual(200)
  })

  test('a new todo starts open', () => {
    const [event] = parseSuggestions(line(addEvent()))
    expect(event.type === 'add' && event.todo.status).toBe('open')
  })
})

describe('applyEvents', () => {
  const add = parseSuggestions(line(addEvent()))

  test('adds a new todo', () => {
    expect(applyEvents([], add, NOW).map((t) => t.id)).toEqual(['aaaaaaaaaaaaaaaa'])
  })

  test('replaying an add never reopens a todo the user closed', () => {
    const done = openTodo({ status: 'done', closedAt: NOW })
    expect(applyEvents([done], add, NOW)).toEqual([done])
  })

  test('resolve closes an open todo and stamps it', () => {
    const [todo] = applyEvents([openTodo()], [{ type: 'resolve', id: 'aaaaaaaaaaaaaaaa' }], NOW)
    expect(todo).toMatchObject({ status: 'done', closedAt: NOW })
  })

  test('resolve does not turn a dismissed todo into a done one', () => {
    const dismissed = openTodo({ status: 'dismissed', closedAt: 'earlier' })
    expect(applyEvents([dismissed], [{ type: 'resolve', id: dismissed.id }], NOW)).toEqual([dismissed])
  })

  test('resolve for an unknown id is ignored', () => {
    expect(applyEvents([], [{ type: 'resolve', id: 'cccccccccccccccc' }], NOW)).toEqual([])
  })

  test('an add and resolve in one batch end closed', () => {
    const events = [...add, { type: 'resolve' as const, id: 'aaaaaaaaaaaaaaaa' }]
    expect(applyEvents([], events, NOW)[0].status).toBe('done')
  })

  test('does not mutate its input', () => {
    const todos = [openTodo()]
    applyEvents(todos, [{ type: 'resolve', id: todos[0].id }], NOW)
    expect(todos[0].status).toBe('open')
  })
})

describe('pruneClosed', () => {
  const nowMs = Date.parse(NOW)
  const closedAgo = (ms: number): Todo =>
    openTodo({ status: 'done', closedAt: new Date(nowMs - ms).toISOString() })

  test('removes closed todos past retention and keeps recent ones', () => {
    const recent = closedAgo(CLOSED_RETENTION_MS - 1000)
    expect(pruneClosed([closedAgo(CLOSED_RETENTION_MS + 1000), recent], nowMs)).toEqual([recent])
  })

  test('never removes an open todo however old', () => {
    const old = openTodo({ createdAt: '2020-01-01T00:00:00.000Z' })
    expect(pruneClosed([old], nowMs)).toEqual([old])
  })
})
