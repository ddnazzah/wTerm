import { describe, expect, test, vi } from 'vitest'
import type { Todo } from '@shared/types'
import {
  createReminderSync,
  dueArgs,
  friendlyReminderError,
  planReminderSync,
  reminderBody,
  type ReminderClient,
  type ReminderStore,
} from './reminders'

const todo = (patch: Partial<Todo> = {}): Todo => ({
  id: 'aaaaaaaaaaaaaaaa',
  title: 'Decide on FCM',
  detail: 'OneSignal renews on 12 November.',
  bucket: 'future',
  dueDate: '2026-11-10',
  status: 'open',
  sessionId: '11111111-1111-4111-8111-111111111111',
  cwd: '/repo',
  branch: 'main',
  createdAt: '2026-11-03T00:00:00.000Z',
  ...patch,
})

function fakes(initial: Todo[], client: Partial<ReminderClient> = {}) {
  let todos = initial
  const store: ReminderStore = {
    list: () => todos,
    setReminder: async (id, reminderId) => {
      todos = todos.map((t) => {
        if (t.id !== id) return t
        const { reminderId: _old, ...rest } = t
        return reminderId ? { ...rest, reminderId } : rest
      })
      return true
    },
  }
  const reminders: ReminderClient = {
    create: vi.fn(async () => 'x-apple-reminder://1'),
    complete: vi.fn(async () => undefined),
    ...client,
  }
  return { store, reminders, current: () => todos }
}

describe('planReminderSync', () => {
  test('creates a reminder only for an open dated todo that has none', () => {
    const dated = todo()
    const plan = planReminderSync([
      dated,
      todo({ id: 'b', dueDate: undefined }),
      todo({ id: 'c', status: 'done' }),
      todo({ id: 'd', reminderId: 'r' }),
    ])
    expect(plan).toEqual({ create: [dated], complete: [] })
  })

  test('completes the reminder of a todo that was ticked or dismissed', () => {
    const done = todo({ status: 'done', reminderId: 'r1' })
    const dismissed = todo({ id: 'b', status: 'dismissed', reminderId: 'r2' })
    expect(planReminderSync([done, dismissed]).complete).toEqual([done, dismissed])
  })
})

describe('reminder fields', () => {
  test('the body says why and where it came from', () => {
    expect(reminderBody(todo())).toBe('OneSignal renews on 12 November.\n\nFrom wTerm: /repo')
  })

  test('the alert is at 9am on the due day', () => {
    expect(dueArgs('2026-11-10')).toEqual(['2026', '11', '10', '9'])
  })
})

describe('friendlyReminderError', () => {
  test('points at the setting when macOS refuses permission', () => {
    const message = friendlyReminderError(
      new Error('Not authorized to send Apple events to Reminders. (-1743)')
    )
    expect(message).toContain('Privacy & Security > Automation')
  })

  test('keeps the cause for any other failure', () => {
    expect(friendlyReminderError(new Error('boom'))).toBe('Could not update Apple Reminders: boom')
  })
})

describe('createReminderSync', () => {
  test('stores the new reminder so the next run does not create a second', async () => {
    const { store, reminders, current } = fakes([todo()])
    const sync = createReminderSync(store, reminders, vi.fn())
    await sync.run()
    await sync.run()
    expect(reminders.create).toHaveBeenCalledTimes(1)
    expect(current()[0].reminderId).toBe('x-apple-reminder://1')
  })

  test('completing forgets the reminder, so reopening the todo makes a new one', async () => {
    const { store, reminders, current } = fakes([todo({ status: 'done', reminderId: 'r1' })])
    const sync = createReminderSync(store, reminders, vi.fn())
    await sync.run()
    expect(reminders.complete).toHaveBeenCalledWith('r1')
    expect(current()[0].reminderId).toBeUndefined()
  })

  test('overlapping runs do not create twice', async () => {
    let finish: (id: string) => void = () => undefined
    const create = vi.fn(() => new Promise<string>((resolve) => (finish = resolve)))
    const { store, reminders } = fakes([todo()], { create })
    const sync = createReminderSync(store, reminders, vi.fn())
    const first = sync.run()
    const second = sync.run()
    await vi.waitFor(() => expect(create).toHaveBeenCalledTimes(1))
    finish('r1')
    await Promise.all([first, second])
    expect(create).toHaveBeenCalledTimes(1)
  })

  test('a failure is reported once, stops the run and clears after a good run', async () => {
    const create = vi
      .fn<ReminderClient['create']>()
      .mockRejectedValueOnce(new Error('(-1743)'))
      .mockRejectedValueOnce(new Error('(-1743)'))
      .mockResolvedValue('r1')
    const { store, reminders } = fakes([todo(), todo({ id: 'b' })], { create })
    const onErrorChanged = vi.fn()
    const sync = createReminderSync(store, reminders, onErrorChanged)

    await sync.run()
    expect(create).toHaveBeenCalledTimes(1)
    expect(sync.error()).toContain('Automation')
    await sync.run()
    expect(onErrorChanged).toHaveBeenCalledTimes(1)

    await sync.run()
    expect(sync.error()).toBeNull()
    expect(onErrorChanged).toHaveBeenCalledTimes(2)
  })
})
