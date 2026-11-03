import { beforeEach, describe, expect, test, vi } from 'vitest'
import { IPC, type SendTodoResult, type Todo } from '@shared/types'
import type { TodoStore } from '../todos/store'
import { registerTodosIpc } from './todos'

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, (event: unknown, ...args: unknown[]) => unknown>(),
  createCard: vi.fn(() => ({ number: 7 })),
}))

vi.mock('electron', () => ({
  ipcMain: { handle: (channel: string, handler: never) => mocks.handlers.set(channel, handler) },
}))
vi.mock('../board/store', () => ({ createCard: mocks.createCard }))
vi.mock('../board/worktree', () => ({ mainRepoPath: async () => null }))
vi.mock('../store/state', () => ({
  getState: () => ({ projects: [{ id: 'app', path: '/repo', terminals: [] }] }),
}))

const todo = { id: 'a', title: 'T', detail: '', sessionId: 's', cwd: '/repo' } as Todo

function register(current: Todo) {
  let stored = current
  const store = {
    get: () => stored,
    list: () => [stored],
    readCollectorStatus: async () => null,
    markSent: async (_id: string, card: Todo['card']) => {
      stored = { ...stored, card }
      return true
    },
  } as unknown as TodoStore
  const notifyChanged = vi.fn()
  registerTodosIpc(store, notifyChanged, vi.fn(), () => 'Reminders refused')
  const send = () => mocks.handlers.get(IPC.todos.sendToBoard)?.({}, 'a') as Promise<SendTodoResult>
  return { send, notifyChanged }
}

describe('todos snapshot', () => {
  test('tells the tab why reminders are failing', async () => {
    register(todo)
    const snapshot = await mocks.handlers.get(IPC.todos.snapshot)?.({})
    expect(snapshot).toEqual({ todos: [todo], collector: null, remindersError: 'Reminders refused' })
  })
})

describe('todos sendToBoard', () => {
  beforeEach(() => {
    mocks.handlers.clear()
    mocks.createCard.mockClear()
  })

  test('a double-click creates one card and both clicks succeed', async () => {
    const { send, notifyChanged } = register(todo)
    const results = await Promise.all([send(), send()])
    expect(mocks.createCard).toHaveBeenCalledTimes(1)
    expect(results).toEqual([{ ok: true }, { ok: true }])
    expect(notifyChanged).toHaveBeenCalledTimes(1)
  })

  test('a later click reports the card that already exists', async () => {
    const { send } = register(todo)
    await send()
    expect(await send()).toEqual({ ok: false, error: 'Already on the board as #7' })
    expect(mocks.createCard).toHaveBeenCalledTimes(1)
  })

  test('carries the due date onto the card', async () => {
    const { send } = register({ ...todo, dueDate: '2026-11-10' })
    await send()
    expect(mocks.createCard).toHaveBeenCalledWith(
      expect.objectContaining({ body: expect.stringContaining('Due 2026-11-10.') })
    )
  })

  test('always files the card in Backlog', async () => {
    const { send } = register(todo)
    await send()
    expect(mocks.createCard).toHaveBeenCalledWith(expect.objectContaining({ status: 'backlog' }))
  })
})
