import { describe, expect, it, vi } from 'vitest'
import { Autopilot, type AutopilotDeps, type AutopilotSnapshot } from './autopilot'
import type { AgentHookEvent, AgentHookMessage } from '../agent/hook-event'
import type { TranscriptView } from './transcript'

const TERM = 'term-1'

const view = (lastAssistant: string): TranscriptView => ({
  prompts: ['Ship the export button, push when done'],
  recent: [`assistant: ${lastAssistant}`],
  lastAssistant,
})

/** What `claude -p --output-format json` prints for a given verdict. */
const cli = (verdict: Record<string, unknown>): string =>
  JSON.stringify({ type: 'result', is_error: false, result: JSON.stringify(verdict) })

const msg = (event: AgentHookEvent, transcriptPath: string | null = '/t/s.jsonl'): AgentHookMessage => ({
  terminalId: TERM,
  sessionId: 's',
  transcriptPath,
  event,
})
const stop = (): AgentHookMessage => msg({ kind: 'turnDone' })

interface Harness {
  pilot: Autopilot
  applied: AgentHookEvent[]
  snapshots: AutopilotSnapshot[]
  decide: ReturnType<typeof vi.fn>
}

function harness(opts: { outputs?: string[]; said?: string[]; defaultOn?: boolean; max?: number } = {}): Harness {
  const outputs = [...(opts.outputs ?? [])]
  const said = [...(opts.said ?? ['Done step. Next?'])]
  const applied: AgentHookEvent[] = []
  const snapshots: AutopilotSnapshot[] = []
  const decide = vi.fn(async () => {
    const next = outputs.shift()
    if (next === undefined) throw new Error('no scripted output')
    return next
  })
  const deps: AutopilotDeps = {
    decide,
    read: async () => view(said.length > 1 ? (said.shift() as string) : said[0]),
    apply: (_id, event) => applied.push(event),
    changed: (s) => snapshots.push(s),
    now: () => 1000,
    maxContinuations: opts.max,
  }
  return { pilot: new Autopilot(deps, opts.defaultOn ?? true), applied, snapshots, decide }
}

describe('Autopilot — a stop on an enabled session', () => {
  it('answers with a block decision carrying the supervisor\'s reply', async () => {
    const h = harness({ outputs: [cli({ action: 'continue', reply: 'Take option A.', summary: 'Chose A' })] })

    const reply = await h.pilot.handle(stop())

    expect(JSON.parse(reply as string)).toEqual({ decision: 'block', reason: 'Take option A.' })
  })

  it('keeps the session looking busy while it continues — no attention, no notification', async () => {
    const h = harness({ outputs: [cli({ action: 'continue', reply: 'Go on', summary: 's' })] })

    await h.pilot.handle(stop())

    expect(h.applied).toEqual([])
  })

  it('lets the session stop and raises the report when the goal is reached', async () => {
    const h = harness({ outputs: [cli({ action: 'done', reply: '', summary: 'Export shipped; 12 tests pass; pushed.' })] })

    const reply = await h.pilot.handle(stop())

    expect(reply).toBeNull()
    expect(h.applied).toEqual([{ kind: 'turnDone', detail: 'Goal reached: Export shipped; 12 tests pass; pushed.' }])
  })

  it('stops and hands the exact question back when it escalates', async () => {
    const h = harness({
      outputs: [cli({ action: 'escalate', reply: 'Force-push over main?', summary: 'Not authorised' })],
    })

    const reply = await h.pilot.handle(stop())

    expect(reply).toBeNull()
    expect(h.applied).toEqual([{ kind: 'turnDone', detail: 'Autopilot needs you: Force-push over main?' }])
  })

  it('escalates when the supervisor returns garbage', async () => {
    const h = harness({ outputs: ['not json at all'] })

    expect(await h.pilot.handle(stop())).toBeNull()
    expect(h.applied[0]).toMatchObject({ kind: 'turnDone' })
    expect((h.applied[0] as { detail: string }).detail).toMatch(/^Autopilot needs you: .*could not decide/)
  })

  it('escalates when the supervisor process fails or times out', async () => {
    const h = harness({ outputs: [] }) // decide() rejects

    expect(await h.pilot.handle(stop())).toBeNull()
    expect((h.applied[0] as { detail: string }).detail).toContain('no scripted output')
  })

  it('escalates when the transcript cannot be found', async () => {
    const h = harness({ outputs: [cli({ action: 'continue', reply: 'x', summary: 's' })] })

    expect(await h.pilot.handle(msg({ kind: 'turnDone' }, null))).toBeNull()
    expect(h.decide).not.toHaveBeenCalled()
    expect(h.applied[0]).toMatchObject({ kind: 'turnDone' })
  })

  it('records every decision, so the user can see what was chosen for them', async () => {
    const h = harness({
      outputs: [
        cli({ action: 'continue', reply: 'Take A', summary: 'Chose A' }),
        cli({ action: 'done', reply: '', summary: 'Shipped' }),
      ],
      said: ['A or B?', 'All done'],
    })

    await h.pilot.handle(stop())
    await h.pilot.handle(stop())

    const snap = h.pilot.snapshot(TERM)
    expect(snap.log.map((d) => [d.action, d.reply || d.summary])).toEqual([
      ['continue', 'Take A'],
      ['done', 'Shipped'],
    ])
    expect(h.snapshots.at(-1)).toEqual(snap)
  })

  it('hands back once the reply cap is reached', async () => {
    const outputs = [1, 2, 3].map((i) => cli({ action: 'continue', reply: `step ${i}`, summary: 's' }))
    const h = harness({ outputs, said: ['one', 'two', 'three'], max: 2 })

    expect(await h.pilot.handle(stop())).not.toBeNull()
    expect(await h.pilot.handle(stop())).not.toBeNull()
    expect(await h.pilot.handle(stop())).toBeNull()
    expect((h.applied[0] as { detail: string }).detail).toContain('2 replies')
  })
})

describe('Autopilot — sessions it must leave alone', () => {
  it('passes a stop straight through when Autopilot is off for that session', () => {
    const h = harness({ defaultOn: true })
    h.pilot.setEnabled(TERM, false)

    const reply = h.pilot.handle(stop())

    expect(reply).toBeUndefined()
    expect(h.applied).toEqual([{ kind: 'turnDone' }])
    expect(h.decide).not.toHaveBeenCalled()
  })

  it('follows the default for sessions with no explicit choice', () => {
    const h = harness({ defaultOn: false })

    expect(h.pilot.handle(stop())).toBeUndefined()
    h.pilot.setDefault(true)
    expect(h.pilot.isEnabled(TERM)).toBe(true)
  })

  it('applies non-Stop events immediately and never holds them', () => {
    const h = harness()

    expect(h.pilot.handle(msg({ kind: 'needsInput', message: 'permission' }))).toBeUndefined()
    expect(h.applied).toEqual([{ kind: 'needsInput', message: 'permission' }])
  })
})

describe('Autopilot — decisions overtaken while the supervisor thinks', () => {
  /** A supervisor whose answer the test releases by hand. */
  function gated(): { h: Harness; release: (out: string, call?: number) => void } {
    const resolvers: ((out: string) => void)[] = []
    const h = harness()
    h.decide.mockImplementation(() => new Promise<string>((r) => resolvers.push(r)))
    // Releases the given call (default: the most recent one).
    return { h, release: (out, call = resolvers.length - 1) => resolvers[call](out) }
  }
  const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0))

  it('drops a decision that lands after the user typed a new prompt', async () => {
    const { h, release } = gated()
    const pending = h.pilot.handle(stop())
    await tick()

    h.pilot.handle(msg({ kind: 'promptSubmitted' }))
    release(cli({ action: 'done', reply: '', summary: 'stale' }))

    expect(await pending).toBeNull()
    expect(h.applied).toEqual([{ kind: 'promptSubmitted' }]) // no "Goal reached" mid-turn
    expect(h.pilot.snapshot(TERM).log).toEqual([])
  })

  it('lets the session stop normally when Autopilot is switched off mid-decision', async () => {
    const { h, release } = gated()
    const pending = h.pilot.handle(stop())
    await tick()

    h.pilot.setEnabled(TERM, false)
    release(cli({ action: 'continue', reply: 'keep going', summary: 's' }))

    expect(await pending).toBeNull()
    expect(h.applied).toEqual([{ kind: 'turnDone' }])
  })

  it('counts only the newest of two overlapping stops', async () => {
    const { h, release } = gated()
    const first = h.pilot.handle(stop())
    await tick()
    const second = h.pilot.handle(stop())
    await tick()

    release(cli({ action: 'continue', reply: 'late', summary: 's' }), 0)
    release(cli({ action: 'continue', reply: 'fresh', summary: 's' }), 1)

    expect(await first).toBeNull()
    expect(JSON.parse((await second) as string).reason).toBe('fresh')
    expect(h.pilot.snapshot(TERM).continuations).toBe(1)
  })

  it('reports deciding while the supervisor thinks, and clears it when it answers', async () => {
    const { h, release } = gated()
    const pending = h.pilot.handle(stop())
    await tick()

    expect(h.snapshots.at(-1)?.deciding).toBe(true)
    expect(h.pilot.snapshot(TERM).deciding).toBe(true)

    release(cli({ action: 'continue', reply: 'go', summary: 's' }))
    await pending

    expect(h.snapshots.at(-1)?.deciding).toBe(false)
    expect(h.pilot.snapshot(TERM).deciding).toBe(false)
  })

  it('stops reporting deciding the moment the user types over a pending decision', async () => {
    const { h, release } = gated()
    const pending = h.pilot.handle(stop())
    await tick()

    h.pilot.handle(msg({ kind: 'promptSubmitted' }))

    expect(h.snapshots.at(-1)?.deciding).toBe(false)
    release(cli({ action: 'done', reply: '', summary: 'stale' }))
    await pending
    expect(h.pilot.snapshot(TERM).deciding).toBe(false)
  })

  it('clears deciding when switched off mid-decision', async () => {
    const { h, release } = gated()
    const pending = h.pilot.handle(stop())
    await tick()
    h.pilot.setEnabled(TERM, false)

    release(cli({ action: 'continue', reply: 'keep going', summary: 's' }))
    await pending

    expect(h.snapshots.at(-1)).toMatchObject({ enabled: false, deciding: false })
  })

  it('keeps deciding on while the newer of two overlapping stops is still out', async () => {
    const { h, release } = gated()
    const first = h.pilot.handle(stop())
    await tick()
    const second = h.pilot.handle(stop())
    await tick()

    release(cli({ action: 'continue', reply: 'late', summary: 's' }), 0)
    await first

    expect(h.pilot.snapshot(TERM).deciding).toBe(true)
    release(cli({ action: 'continue', reply: 'fresh', summary: 's' }), 1)
    await second
    expect(h.pilot.snapshot(TERM).deciding).toBe(false)
  })

  it('forgets a closed terminal entirely', async () => {
    const h = harness({ defaultOn: true })
    h.pilot.setEnabled(TERM, false)

    h.pilot.forget(TERM)

    expect(h.pilot.isEnabled(TERM)).toBe(true)
  })
})

describe('Autopilot — the user taking the wheel', () => {
  it('resets the reply counter when the user types a new prompt', async () => {
    const outputs = [1, 2, 3].map((i) => cli({ action: 'continue', reply: `step ${i}`, summary: 's' }))
    const h = harness({ outputs, said: ['one', 'two', 'three'], max: 1 })

    await h.pilot.handle(stop())
    h.pilot.handle(msg({ kind: 'promptSubmitted' }))
    const reply = await h.pilot.handle(stop())

    expect(reply).not.toBeNull()
    expect(h.pilot.snapshot(TERM).continuations).toBe(1)
  })

  it('reports enabled state and counts in its snapshot', () => {
    const h = harness({ defaultOn: true })

    h.pilot.setEnabled(TERM, false)

    expect(h.snapshots.at(-1)).toEqual({ terminalId: TERM, enabled: false, deciding: false, continuations: 0, log: [] })
  })

  it('keeps the report when a session ends, but resets its counters', async () => {
    // A headless or quickly-exited session ends right after its last Stop; the
    // log is the user's report and must survive that.
    const h = harness({ outputs: [cli({ action: 'continue', reply: 'x', summary: 's' })] })
    await h.pilot.handle(stop())

    h.pilot.handle(msg({ kind: 'sessionEnd' }))

    expect(h.pilot.snapshot(TERM).continuations).toBe(0)
    expect(h.pilot.snapshot(TERM).log.map((d) => d.reply)).toEqual(['x'])
  })
})
