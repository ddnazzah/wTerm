// Owns todos.json. The collector appends to suggestions.jsonl and never touches
// this file, so a user's tick cannot be overwritten by a background run.
//
// Deliberately separate from state.json: the mobile bridge broadcasts the whole
// AppState, and todos are not meant to reach the phone.

import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import type { CollectorStatus, Todo, TodoCardRef, TodoStatus } from '@shared/types'
import { applyEvents, parseSuggestions, pruneClosed } from './suggestions'

const NEWLINE = 0x0a

interface Persisted {
  todos: Todo[]
  /** Bytes of suggestions.jsonl already imported. */
  offset: number
}

function isCollectorStatus(value: unknown): value is CollectorStatus {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  return typeof (value as CollectorStatus).lastRunAt === 'string'
}

export class TodoStore {
  private data: Persisted = { todos: [], offset: 0 }
  /** Serializes file work so concurrent imports and clicks cannot interleave. */
  private queue: Promise<unknown> = Promise.resolve()

  constructor(private dir: string) {}

  private get todosPath(): string {
    return join(this.dir, 'todos.json')
  }

  private get suggestionsPath(): string {
    return join(this.dir, 'suggestions.jsonl')
  }

  private enqueue<T>(work: () => Promise<T>): Promise<T> {
    const run = this.queue.then(work)
    this.queue = run.catch(() => undefined)
    return run
  }

  async load(): Promise<void> {
    await fs.mkdir(this.dir, { recursive: true })
    let raw: string
    try {
      raw = await fs.readFile(this.todosPath, 'utf-8')
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return
      throw err
    }
    try {
      const parsed = JSON.parse(raw) as Persisted
      if (!Array.isArray(parsed.todos)) throw new Error('todos is not an array')
      this.data = { todos: parsed.todos, offset: Number(parsed.offset) || 0 }
    } catch (err) {
      // Keep the bad file for inspection. Offset 0 replays suggestions to recover
      // the list, though ticks made since the file went bad are lost.
      console.error('[todos] todos.json is corrupt, replaying suggestions:', err)
      await fs.rename(this.todosPath, `${this.todosPath}.corrupt`)
    }
  }

  private async save(): Promise<void> {
    const tmp = `${this.todosPath}.tmp`
    await fs.writeFile(tmp, JSON.stringify(this.data, null, 2), 'utf-8')
    await fs.rename(tmp, this.todosPath)
  }

  list(): Todo[] {
    return this.data.todos
  }

  get(id: string): Todo | undefined {
    return this.data.todos.find((t) => t.id === id)
  }

  /** Read new complete lines since the offset. A trailing partial line waits. */
  private async readNewBytes(): Promise<{ text: string; offset: number } | null> {
    let buffer: Buffer
    try {
      buffer = await fs.readFile(this.suggestionsPath)
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null
      throw err
    }
    // A smaller file was replaced. Ids make a full replay safe.
    const start = buffer.length < this.data.offset ? 0 : this.data.offset
    const end = buffer.lastIndexOf(NEWLINE) + 1
    if (end <= start) return null
    return { text: buffer.subarray(start, end).toString('utf-8'), offset: end }
  }

  /** Returns true when the visible list may have changed. */
  importSuggestions(): Promise<boolean> {
    return this.enqueue(async () => {
      const fresh = await this.readNewBytes()
      if (!fresh) return false
      const merged = applyEvents(
        this.data.todos,
        parseSuggestions(fresh.text),
        new Date().toISOString()
      )
      this.data = { todos: pruneClosed(merged, Date.now()), offset: fresh.offset }
      await this.save()
      return true
    })
  }

  private update(id: string, patch: (todo: Todo) => Todo): Promise<boolean> {
    return this.enqueue(async () => {
      if (!this.get(id)) return false
      const todos = this.data.todos.map((t) => (t.id === id ? patch(t) : t))
      this.data = { ...this.data, todos }
      await this.save()
      return true
    })
  }

  setStatus(id: string, status: TodoStatus): Promise<boolean> {
    return this.update(id, ({ closedAt: _closedAt, ...todo }) =>
      status === 'open'
        ? { ...todo, status }
        : { ...todo, status, closedAt: new Date().toISOString() }
    )
  }

  markSent(id: string, card: TodoCardRef): Promise<boolean> {
    return this.update(id, (todo) => ({ ...todo, card }))
  }

  setReminder(id: string, reminderId: string | undefined): Promise<boolean> {
    return this.update(id, ({ reminderId: _old, ...todo }) =>
      reminderId ? { ...todo, reminderId } : todo
    )
  }

  /** Null means the collector has not run yet, or left an unusable file. */
  async readCollectorStatus(): Promise<CollectorStatus | null> {
    try {
      const parsed: unknown = JSON.parse(await fs.readFile(join(this.dir, 'status.json'), 'utf-8'))
      return isCollectorStatus(parsed) ? parsed : null
    } catch {
      return null
    }
  }
}
