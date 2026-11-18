import { describe, expect, it } from 'vitest'
import type { AutopilotDecision, AutopilotSnapshot } from '@shared/types'
import { autopilotMode, autopilotSummary, decisionLine, MENU_DECISIONS, menuDecisions } from './autopilot-label'

const snap = (over: Partial<AutopilotSnapshot> = {}): AutopilotSnapshot => ({
  terminalId: 't1',
  enabled: true,
  deciding: false,
  continuations: 0,
  log: [],
  ...over,
})
const decision = (action: AutopilotDecision['action'], reply: string, summary: string, at = 0): AutopilotDecision => ({
  at,
  action,
  reply,
  summary,
})

describe('autopilotMode', () => {
  it('is off when Autopilot is off, even if a stale decision flag is set', () => {
    expect(autopilotMode(snap({ enabled: false, deciding: true }))).toBe('off')
  })

  it('treats a session with no state yet as off rather than guessing', () => {
    expect(autopilotMode(undefined)).toBe('off')
  })

  it('is deciding while the supervisor is choosing a reply', () => {
    expect(autopilotMode(snap({ deciding: true }))).toBe('deciding')
  })

  it('is on when enabled and idle', () => {
    expect(autopilotMode(snap())).toBe('on')
  })
})

describe('decisionLine', () => {
  it('shows the reply that was sent for a continue', () => {
    expect(decisionLine(decision('continue', 'Take option A', 'Chose A'))).toBe('Replied: Take option A')
  })

  it('shows why it stopped, not the empty reply, for a hand-back', () => {
    expect(decisionLine(decision('escalate', '', 'Not authorised to force-push'))).toBe(
      'Handed back: Not authorised to force-push'
    )
  })

  it('shows the report when the goal was reached', () => {
    expect(decisionLine(decision('done', '', 'Export shipped'))).toBe('Goal reached: Export shipped')
  })
})

describe('autopilotSummary', () => {
  it('says off for a session that will wait for the user', () => {
    expect(autopilotSummary(snap({ enabled: false }))).toBe('Autopilot off')
    expect(autopilotSummary(undefined)).toBe('Autopilot off')
  })

  it('says it is deciding while the supervisor runs', () => {
    expect(autopilotSummary(snap({ deciding: true }))).toBe('Autopilot deciding a reply')
  })

  it('counts replies with correct pluralisation', () => {
    expect(autopilotSummary(snap({ continuations: 1 }))).toBe('Autopilot on · 1 reply')
    expect(autopilotSummary(snap({ continuations: 3 }))).toBe('Autopilot on · 3 replies')
  })

  it('names the most recent decision', () => {
    const log = [decision('continue', 'old', '', 1), decision('continue', 'Run the tests', '', 2)]

    expect(autopilotSummary(snap({ continuations: 2, log }))).toBe(
      'Autopilot on · 2 replies · last: Replied: Run the tests'
    )
  })
})

describe('menuDecisions', () => {
  it('lists decisions newest first', () => {
    const log = [decision('continue', 'Take option A', 'Chose A', 1), decision('done', '', 'Export shipped', 2)]

    expect(menuDecisions(snap({ log }))).toEqual(['Goal reached: Export shipped', 'Replied: Take option A'])
  })

  it('caps the list so the menu stays short', () => {
    const log = Array.from({ length: 20 }, (_, i) => decision('continue', `r${i}`, '', i))

    const lines = menuDecisions(snap({ log }))

    expect(lines).toHaveLength(MENU_DECISIONS)
    expect(lines[0]).toBe('Replied: r19')
    expect(lines.at(-1)).toBe(`Replied: r${20 - MENU_DECISIONS}`)
  })

  it('is empty for a session with no state or no decisions', () => {
    expect(menuDecisions(undefined)).toEqual([])
    expect(menuDecisions(snap())).toEqual([])
  })
})
