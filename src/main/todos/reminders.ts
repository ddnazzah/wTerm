// Mirrors dated todos into Apple Reminders, so macOS alerts on the day even with
// wTerm closed. One way only: wTerm decides, and ticking a reminder changes no todo.
//
// `reminderId` on a todo means "a live reminder should exist". It is set once and
// never recreated, so a reminder the user deletes stays deleted.

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { Todo } from '@shared/types'

const run = promisify(execFile)

export const REMINDERS_LIST = 'wTerm'

const ALERT_HOUR = 9
/** Long enough to answer the macOS permission prompt on the first run. */
const OSASCRIPT_TIMEOUT_MS = 3 * 60 * 1000
const NOT_AUTHORIZED = '-1743'

// Todo text derives from transcripts, so it only ever reaches these scripts as argv.
// Interpolating it would let a crafted title run AppleScript.
const CREATE_SCRIPT = `on run argv
  set {listName, theTitle, theBody, y, m, d, h} to argv
  set alertAt to current date
  set day of alertAt to 1
  set year of alertAt to y as integer
  set month of alertAt to m as integer
  set day of alertAt to d as integer
  set time of alertAt to (h as integer) * hours
  tell application "Reminders"
    if not (exists list listName) then make new list with properties {name:listName}
    set created to make new reminder at end of list listName with properties {name:theTitle, body:theBody, due date:alertAt, remind me date:alertAt}
    return id of created
  end tell
end run`

const COMPLETE_SCRIPT = `on run argv
  set theId to item 1 of argv
  tell application "Reminders"
    set matches to (reminders whose id is theId)
    if (count of matches) > 0 then set completed of item 1 of matches to true
  end tell
end run`

export interface ReminderClient {
  /** Returns the new reminder's id. */
  create(todo: Todo): Promise<string>
  /** A reminder the user already deleted is not an error. */
  complete(reminderId: string): Promise<void>
}

export interface ReminderStore {
  list(): Todo[]
  setReminder(id: string, reminderId: string | undefined): Promise<boolean>
}

export interface ReminderSync {
  run(): Promise<void>
  error(): string | null
}

export function planReminderSync(todos: Todo[]): { create: Todo[]; complete: Todo[] } {
  return {
    create: todos.filter((t) => t.status === 'open' && t.dueDate && !t.reminderId),
    complete: todos.filter((t) => t.status !== 'open' && t.reminderId),
  }
}

export function reminderBody(todo: Todo): string {
  return [todo.detail, `From wTerm: ${todo.cwd}`].filter(Boolean).join('\n\n')
}

export function dueArgs(dueDate: string): string[] {
  const [year, month, day] = dueDate.split('-').map(Number)
  return [year, month, day, ALERT_HOUR].map(String)
}

export function friendlyReminderError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err)
  if (message.includes(NOT_AUTHORIZED)) {
    return 'wTerm is not allowed to use Reminders. Allow it in System Settings > Privacy & Security > Automation.'
  }
  return `Could not update Apple Reminders: ${message}`
}

export function osascriptReminderClient(listName: string): ReminderClient {
  const osascript = async (script: string, args: string[]): Promise<string> => {
    const { stdout } = await run('osascript', ['-e', script, ...args], {
      timeout: OSASCRIPT_TIMEOUT_MS,
    })
    return stdout.trim()
  }
  return {
    create: (todo) =>
      osascript(CREATE_SCRIPT, [
        listName,
        todo.title,
        reminderBody(todo),
        ...dueArgs(todo.dueDate ?? ''),
      ]),
    complete: async (reminderId) => {
      await osascript(COMPLETE_SCRIPT, [reminderId])
    },
  }
}

async function applyPlan(store: ReminderStore, client: ReminderClient): Promise<void> {
  const { create, complete } = planReminderSync(store.list())
  for (const todo of complete) {
    await client.complete(todo.reminderId ?? '')
    await store.setReminder(todo.id, undefined)
  }
  for (const todo of create) {
    await store.setReminder(todo.id, await client.create(todo))
  }
}

/**
 * Passes run one at a time, because two together would both see a todo with no
 * reminder and each create one. The first failure ends a pass: when macOS refuses
 * permission, every remaining call would fail the same way.
 */
export function createReminderSync(
  store: ReminderStore,
  client: ReminderClient,
  onErrorChanged: () => void
): ReminderSync {
  let queue: Promise<void> = Promise.resolve()
  let lastError: string | null = null

  const pass = async (): Promise<void> => {
    let nextError: string | null = null
    try {
      await applyPlan(store, client)
    } catch (err) {
      nextError = friendlyReminderError(err)
      console.error('[todos] reminder sync failed:', err)
    }
    if (nextError === lastError) return
    lastError = nextError
    onErrorChanged()
  }

  return {
    run: () => {
      queue = queue.then(pass)
      return queue
    },
    error: () => lastError,
  }
}
