// Runs against a real temp directory: the file boundary (partial lines, torn state,
// atomic saves) is what this store exists to get right.

import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { TodoStore } from './store'

const SESSION = '11111111-1111-4111-8111-111111111111'
const ID_A = 'aaaaaaaaaaaaaaaa'
const ID_B = 'bbbbbbbbbbbbbbbb'

let dir: string

const add = (id: string, title = 'Approve PR'): string =>
  `${JSON.stringify({
    type: 'add',
    id,
    title,
    detail: 'Why',
    bucket: 'now',
    sessionId: SESSION,
    cwd: '/repo',
    branch: 'main',
    createdAt: new Date().toISOString(),
  })}\n`

const appendSuggestions = (text: string): Promise<void> =>
  fs.appendFile(join(dir, 'suggestions.jsonl'), text)

async function openStore(): Promise<TodoStore> {
  const store = new TodoStore(dir)
  await store.load()
  return store
}

beforeEach(async () => {
  dir = await fs.mkdtemp(join(tmpdir(), 'wterm-todos-'))
})

afterEach(() => fs.rm(dir, { recursive: true, force: true }))

describe('TodoStore', () => {
  test('starts empty when nothing has been collected', async () => {
    const store = await openStore()
    expect(await store.importSuggestions()).toBe(false)
    expect(store.list()).toEqual([])
  })

  test('imports suggestions and reports the change', async () => {
    await appendSuggestions(add(ID_A))
    const store = await openStore()
    expect(await store.importSuggestions()).toBe(true)
    expect(store.list().map((t) => t.id)).toEqual([ID_A])
  })

  test('a second import with no new bytes changes nothing', async () => {
    await appendSuggestions(add(ID_A))
    const store = await openStore()
    await store.importSuggestions()
    expect(await store.importSuggestions()).toBe(false)
  })

  test('holds a partial trailing line until it is complete', async () => {
    const full = add(ID_A)
    await appendSuggestions(full.slice(0, 20))
    const store = await openStore()
    expect(await store.importSuggestions()).toBe(false)

    await appendSuggestions(full.slice(20))
    expect(await store.importSuggestions()).toBe(true)
    expect(store.list()).toHaveLength(1)
  })

  test('persists todos and the offset across a restart', async () => {
    await appendSuggestions(add(ID_A))
    const first = await openStore()
    await first.importSuggestions()
    await first.setStatus(ID_A, 'done')

    await appendSuggestions(add(ID_B))
    const second = await openStore()
    await second.importSuggestions()
    expect(second.get(ID_A)?.status).toBe('done')
    expect(second.get(ID_B)?.status).toBe('open')
  })

  test('re-reads safely when the suggestions file is replaced by a smaller one', async () => {
    await appendSuggestions(add(ID_A) + add(ID_B))
    const store = await openStore()
    await store.importSuggestions()
    await store.setStatus(ID_A, 'dismissed')

    await fs.writeFile(join(dir, 'suggestions.jsonl'), add(ID_A))
    await store.importSuggestions()
    expect(store.get(ID_A)?.status).toBe('dismissed')
  })

  test('setStatus stamps closedAt, and reopening clears it', async () => {
    await appendSuggestions(add(ID_A))
    const store = await openStore()
    await store.importSuggestions()

    await store.setStatus(ID_A, 'done')
    expect(store.get(ID_A)?.closedAt).toBeTruthy()

    await store.setStatus(ID_A, 'open')
    expect(store.get(ID_A)?.status).toBe('open')
    expect(store.get(ID_A)?.closedAt).toBeUndefined()
  })

  test('setStatus on an unknown id is a no-op', async () => {
    const store = await openStore()
    expect(await store.setStatus(ID_A, 'done')).toBe(false)
  })

  test('recovers from a corrupt todos file by keeping it aside and replaying', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    await appendSuggestions(add(ID_A))
    await fs.writeFile(join(dir, 'todos.json'), '{ not json')

    const store = await openStore()
    await store.importSuggestions()

    expect(store.list().map((t) => t.id)).toEqual([ID_A])
    expect(await fs.readFile(join(dir, 'todos.json.corrupt'), 'utf-8')).toBe('{ not json')
    consoleError.mockRestore()
  })

  test('markSent records the card on the todo', async () => {
    await appendSuggestions(add(ID_A))
    const store = await openStore()
    await store.importSuggestions()
    await store.markSent(ID_A, { projectId: 'p1', number: 7 })
    expect(store.get(ID_A)?.card).toEqual({ projectId: 'p1', number: 7 })
  })

  test('concurrent imports apply each suggestion once', async () => {
    await appendSuggestions(add(ID_A) + add(ID_B))
    const store = await openStore()
    await Promise.all([store.importSuggestions(), store.importSuggestions()])
    expect(store.list()).toHaveLength(2)
  })
})

describe('TodoStore.readCollectorStatus', () => {
  test('is null before the collector has ever run', async () => {
    const store = await openStore()
    expect(await store.readCollectorStatus()).toBeNull()
  })

  test('returns what the collector wrote', async () => {
    const status = { lastRunAt: 'a', lastSuccessAt: 'b', lastError: 'boom' }
    await fs.writeFile(join(dir, 'status.json'), JSON.stringify(status))
    const store = await openStore()
    expect(await store.readCollectorStatus()).toEqual(status)
  })

  test('is null for an unusable status file rather than throwing', async () => {
    await fs.writeFile(join(dir, 'status.json'), '[1,2]')
    const store = await openStore()
    expect(await store.readCollectorStatus()).toBeNull()
  })

  test('records and clears a reminder across a reload', async () => {
    await appendSuggestions(add(ID_A))
    const store = await openStore()
    await store.importSuggestions()

    await store.setReminder(ID_A, 'x-apple-reminder://1')
    expect((await openStore()).get(ID_A)?.reminderId).toBe('x-apple-reminder://1')

    await store.setReminder(ID_A, undefined)
    expect((await openStore()).get(ID_A)).not.toHaveProperty('reminderId')
  })
})
