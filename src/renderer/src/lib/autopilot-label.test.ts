import { describe, expect, it } from 'vitest'
import type { AutopilotDecision, AutopilotSnapshot } from '@shared/types'
import { autopilotTooltip } from './autopilot-label'

const snap = (over: Partial<AutopilotSnapshot> = {}): AutopilotSnapshot => ({
  terminalId: 't1',
  enabled: true,
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

describe('autopilotTooltip', () => {
  it('says the session will wait when Autopilot is off', () => {
    expect(autopilotTooltip(snap({ enabled: false }))).toMatch(/^Autopilot off/)
  })

  it('treats a session with no state yet as off rather than guessing', () => {
    expect(autopilotTooltip(undefined)).toMatch(/^Autopilot off/)
  })

  it('counts replies with correct pluralisation', () => {
    expect(autopilotTooltip(snap({ continuations: 1 }))).toContain('1 reply sent')
    expect(autopilotTooltip(snap({ continuations: 3 }))).toContain('3 replies sent')
  })

  it('lists decisions newest first: the reply sent, or the summary for a stop', () => {
    const log = [
      decision('continue', 'Take option A', 'Chose A', 1),
      decision('done', '', 'Export shipped and pushed', 2),
    ]

    const lines = autopilotTooltip(snap({ log })).split('\n')

    expect(lines.slice(2)).toEqual(['• Goal reached: Export shipped and pushed', '• Replied: Take option A'])
  })

  it('shows why it handed back, not the empty reply', () => {
    const log = [decision('escalate', '', 'Not authorised to force-push')]

    expect(autopilotTooltip(snap({ log }))).toContain('• Handed back: Not authorised to force-push')
  })

  it('caps the list so the tooltip stays readable', () => {
    const log = Array.from({ length: 20 }, (_, i) => decision('continue', `r${i}`, '', i))

    const text = autopilotTooltip(snap({ log }))

    expect(text).toContain('r19')
    expect(text).toContain('r12')
    expect(text).not.toContain('r11')
  })
})
