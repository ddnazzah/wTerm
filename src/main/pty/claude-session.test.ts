import { describe, expect, it } from 'vitest'
import { buildResumeCommand, isClaudeLaunch, withSessionId } from './claude-session'

describe('isClaudeLaunch', () => {
  it('matches claude as the program', () => {
    expect(isClaudeLaunch('claude')).toBe(true)
    expect(isClaudeLaunch('  claude --dangerously-skip-permissions ')).toBe(true)
  })

  it('rejects non-claude / empty commands', () => {
    expect(isClaudeLaunch(undefined)).toBe(false)
    expect(isClaudeLaunch('')).toBe(false)
    expect(isClaudeLaunch('npm run dev')).toBe(false)
    // Must be the program, not just a substring.
    expect(isClaudeLaunch('echo claude')).toBe(false)
    expect(isClaudeLaunch('claudette')).toBe(false)
  })
})

describe('withSessionId', () => {
  it('appends a generated session id', () => {
    expect(withSessionId('claude', 'abc')).toBe('claude --session-id abc')
    expect(withSessionId('claude --dangerously-skip-permissions', 'abc')).toBe(
      'claude --dangerously-skip-permissions --session-id abc'
    )
  })

  it('leaves the command alone when the user pins a session', () => {
    expect(withSessionId('claude --resume xyz', 'abc')).toBe('claude --resume xyz')
    expect(withSessionId('claude --session-id fixed', 'abc')).toBe('claude --session-id fixed')
    expect(withSessionId('claude -c', 'abc')).toBe('claude -c')
    expect(withSessionId('claude --continue', 'abc')).toBe('claude --continue')
  })

  it('does not touch non-claude commands', () => {
    expect(withSessionId('npm run dev', 'abc')).toBe('npm run dev')
  })
})

describe('buildResumeCommand', () => {
  it('appends --resume preserving other flags', () => {
    expect(buildResumeCommand('claude', 'id1')).toBe('claude --resume id1')
    expect(buildResumeCommand('claude --dangerously-skip-permissions', 'id1')).toBe(
      'claude --dangerously-skip-permissions --resume id1'
    )
  })

  it('strips any pre-existing session-pinning flags', () => {
    expect(buildResumeCommand('claude --session-id old', 'id1')).toBe('claude --resume id1')
    expect(buildResumeCommand('claude --resume other', 'id1')).toBe('claude --resume id1')
    expect(buildResumeCommand('claude -r other --model opus', 'id1')).toBe(
      'claude --model opus --resume id1'
    )
    expect(buildResumeCommand('claude --continue --verbose', 'id1')).toBe(
      'claude --verbose --resume id1'
    )
  })

  it('falls back to bare claude when the command is missing or changed', () => {
    expect(buildResumeCommand(undefined, 'id1')).toBe('claude --resume id1')
    expect(buildResumeCommand('', 'id1')).toBe('claude --resume id1')
    expect(buildResumeCommand('npm run dev', 'id1')).toBe('claude --resume id1')
  })
})
