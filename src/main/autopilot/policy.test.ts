import { describe, expect, it } from 'vitest'
import { applyPolicy, INITIAL_PILOT_STATE, type PilotState } from './policy'
import type { Verdict } from './verdict'

const go = (reply: string): Verdict => ({ action: 'continue', reply, summary: `sent: ${reply}` })

describe('applyPolicy', () => {
  it('passes a first continue through and counts it', () => {
    const { verdict, state } = applyPolicy(INITIAL_PILOT_STATE, go('Take A'), 'A or B?')

    expect(verdict.action).toBe('continue')
    expect(state).toEqual({ continuations: 1, lastReply: 'Take A', lastAssistant: 'A or B?' })
  })

  it('lets a session make steady progress across many stops', () => {
    let state: PilotState = INITIAL_PILOT_STATE
    for (let i = 0; i < 5; i += 1) {
      const result = applyPolicy(state, go(`step ${i}`), `finished ${i}, next?`)
      expect(result.verdict.action).toBe('continue')
      state = result.state
    }
    expect(state.continuations).toBe(5)
  })

  it('escalates once the reply cap is reached', () => {
    const state: PilotState = { continuations: 3, lastReply: 'r', lastAssistant: 'a' }

    const { verdict } = applyPolicy(state, go('one more'), 'b', 3)

    expect(verdict.action).toBe('escalate')
    expect(verdict.summary).toContain('3 replies')
  })

  it('escalates instead of sending the same reply twice in a row', () => {
    const state: PilotState = { continuations: 1, lastReply: 'Continue', lastAssistant: 'x' }

    const { verdict } = applyPolicy(state, go('Continue'), 'y')

    expect(verdict.action).toBe('escalate')
    expect(verdict.reply).toBe('')
    expect(verdict.summary).toContain('repeat itself ("Continue")')
  })

  it('escalates when the agent stops on the identical message after a reply', () => {
    const state: PilotState = { continuations: 1, lastReply: 'Do A', lastAssistant: 'Stuck: tests fail' }

    const { verdict } = applyPolicy(state, go('Try B'), 'Stuck: tests fail')

    expect(verdict.action).toBe('escalate')
    expect(verdict.summary).toContain('no progress')
  })

  it('does not call it "no progress" when the agent ended on tool calls with no words', () => {
    const state: PilotState = { continuations: 1, lastReply: 'Do A', lastAssistant: '' }

    expect(applyPolicy(state, go('Do B'), '').verdict.action).toBe('continue')
  })

  it('passes done and escalate verdicts through untouched, recording what was seen', () => {
    const done: Verdict = { action: 'done', reply: '', summary: 'Shipped' }

    const result = applyPolicy({ ...INITIAL_PILOT_STATE, continuations: 99 }, done, 'All green')

    expect(result.verdict).toBe(done)
    expect(result.state.lastAssistant).toBe('All green')
    expect(result.state.continuations).toBe(99)
  })

  it('never mutates the state it was given', () => {
    const state: PilotState = { continuations: 0, lastReply: null, lastAssistant: null }
    const frozen = Object.freeze({ ...state })

    applyPolicy(frozen, go('x'), 'y')

    expect(frozen).toEqual(state)
  })
})
