import type { Verdict } from './verdict'

// Hard limits applied to the supervisor's verdict before wTerm acts on it.
//
// The supervisor is trusted to judge *what* to say, never *how long* to keep
// going. These rules are what make "keep working while I'm away" safe to leave
// unattended: a bounded number of replies per goal, and an immediate stop the
// moment the loop stops making progress.

export interface PilotState {
  /** Replies sent since the user last typed a prompt. */
  continuations: number
  /** The last reply sent, to catch the supervisor repeating itself. */
  lastReply: string | null
  /** What the agent said at the previous stop, to catch a session going nowhere. */
  lastAssistant: string | null
}

export const INITIAL_PILOT_STATE: PilotState = {
  continuations: 0,
  lastReply: null,
  lastAssistant: null,
}

/** Replies per goal before Autopilot hands back to the user regardless. */
export const MAX_CONTINUATIONS = 25

export interface PolicyResult {
  verdict: Verdict
  state: PilotState
}

/** A policy stop has no question for the user, only the reason it stopped. */
const escalate = (summary: string): Verdict => ({ action: 'escalate', reply: '', summary })

export function applyPolicy(
  state: PilotState,
  verdict: Verdict,
  lastAssistant: string,
  max: number = MAX_CONTINUATIONS
): PolicyResult {
  const seen = { ...state, lastAssistant }
  if (verdict.action !== 'continue') return { verdict, state: seen }

  if (state.continuations >= max) {
    return { verdict: escalate(`Autopilot stopped after ${max} replies without reaching the goal`), state: seen }
  }
  if (state.lastReply !== null && verdict.reply === state.lastReply) {
    return { verdict: escalate(`Autopilot was about to repeat itself ("${verdict.reply}")`), state: seen }
  }
  if (state.continuations > 0 && state.lastAssistant === lastAssistant) {
    return { verdict: escalate('The session stopped on the same message again — no progress'), state: seen }
  }
  return {
    verdict,
    state: { continuations: state.continuations + 1, lastReply: verdict.reply, lastAssistant },
  }
}
