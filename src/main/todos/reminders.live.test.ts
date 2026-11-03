// Talks to the real Reminders app, so it only runs when asked:
//   WTERM_REMINDERS_LIVE=1 pnpm vitest run src/main/todos/reminders.live.test.ts
// It works in its own throwaway list and deletes that list afterwards.

import { execFileSync } from 'node:child_process'
import { afterAll, describe, expect, test } from 'vitest'
import type { Todo } from '@shared/types'
import { osascriptReminderClient } from './reminders'

const LIST = 'wTerm live test'
const HOSTILE_TITLE = 'Quote " end tell\ndisplay dialog "pwned" -- \\ title'

function ask(script: string): string {
  return execFileSync('osascript', ['-e', script], { encoding: 'utf-8' }).trim()
}

const inList = (expression: string): string =>
  ask(`tell application "Reminders" to get ${expression} of first reminder of list "${LIST}"`)

const todo: Todo = {
  id: 'aaaaaaaaaaaaaaaa',
  title: HOSTILE_TITLE,
  detail: 'Why',
  bucket: 'future',
  dueDate: '2030-02-28',
  status: 'open',
  sessionId: '11111111-1111-4111-8111-111111111111',
  cwd: '/repo',
  branch: 'main',
  createdAt: '2026-11-03T00:00:00.000Z',
}

describe.runIf(process.env.WTERM_REMINDERS_LIVE === '1')('Apple Reminders', () => {
  afterAll(() => {
    ask(`tell application "Reminders" to delete list "${LIST}"`)
  })

  test('creates, dates and completes a reminder, keeping a hostile title as plain text', async () => {
    const client = osascriptReminderClient(LIST)

    const id = await client.create(todo)
    expect(id).toMatch(/^x-apple-reminder:/)
    expect(inList('name')).toBe(HOSTILE_TITLE)
    expect(inList('body')).toBe('Why\n\nFrom wTerm: /repo')

    const alert = ask(`tell application "Reminders" to set alertAt to remind me date of first reminder of list "${LIST}"
return {year of alertAt, (month of alertAt) as integer, day of alertAt, (time of alertAt) div hours}`)
    expect(alert).toBe('2030, 2, 28, 9')
    expect(inList('completed')).toBe('false')

    await client.complete(id)
    expect(inList('completed')).toBe('true')
    await expect(client.complete('x-apple-reminder://gone')).resolves.toBeUndefined()
  }, 60_000)
})
