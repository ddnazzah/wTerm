import { describe, expect, it } from 'vitest'
import type { AutopilotDecision } from '@shared/types'
import { buildSupervisorPrompt, CLAUDE_ARGS, supervisorEnv } from './supervisor'
import type { TranscriptView } from './transcript'

const view: TranscriptView = {
  prompts: ['Add CSV export to the report page', 'Push when done'],
  recent: ['assistant: Implemented export.', '[tool Bash] {"command":"pnpm test"}', '[result] 12 passed'],
  lastAssistant: 'Export works and tests pass. Want me to push the branch?',
}

describe('buildSupervisorPrompt', () => {
  it('puts every user prompt in, numbered, as the goal', () => {
    const prompt = buildSupervisorPrompt(view, [])

    expect(prompt).toContain('1. Add CSV export to the report page')
    expect(prompt).toContain('2. Push when done')
  })

  it('shows where the agent stopped and what it did recently', () => {
    const prompt = buildSupervisorPrompt(view, [])

    expect(prompt).toContain('Want me to push the branch?')
    expect(prompt).toContain('[result] 12 passed')
  })

  it('states the escalation list and the literal-authorisation exception', () => {
    const prompt = buildSupervisorPrompt(view, [])

    expect(prompt).toMatch(/force-push/)
    expect(prompt).toMatch(/authorised in their own prompts/)
    expect(prompt).toMatch(/does NOT allow a force-push or a push to main/)
  })

  it('tells the supervisor that questions addressed to the user are its to answer', () => {
    // Measured against a real session: without this, "ask me first" made the
    // supervisor hand back an ordinary recommend-yes question.
    const prompt = buildSupervisorPrompt(view, [])

    expect(prompt).toMatch(/You ARE the user's stand-in/)
    expect(prompt).toMatch(/never just because the agent asked/)
  })

  it('includes only the newest earlier decisions, so the prompt stays bounded', () => {
    const log: AutopilotDecision[] = Array.from({ length: 30 }, (_, i) => ({
      at: i,
      action: 'continue',
      reply: `reply-${i}`,
      summary: '',
    }))

    const prompt = buildSupervisorPrompt(view, log)

    expect(prompt).toContain('reply-29')
    expect(prompt).toContain('reply-20')
    expect(prompt).not.toContain('reply-19')
  })

  it('marks empty sections explicitly instead of leaving a dangling heading', () => {
    const prompt = buildSupervisorPrompt({ prompts: [], recent: [], lastAssistant: '' }, [])

    expect(prompt).toContain("## The user's prompts (the goal, oldest first)\n(none)")
  })
})

describe('supervisor process', () => {
  it('removes the terminal id so the supervisor can never supervise itself', () => {
    const env = supervisorEnv({ PATH: '/bin', WTERM_TERMINAL_ID: 't-1', HOME: '/h' })

    expect(env).toEqual({ PATH: '/bin', HOME: '/h' })
  })

  it('runs claude headless with no tools and no saved session', () => {
    expect(CLAUDE_ARGS).toContain('-p')
    expect(CLAUDE_ARGS).toContain(`--tools ''`)
    expect(CLAUDE_ARGS).toContain('--no-session-persistence')
    expect(CLAUDE_ARGS).toContain('--output-format json')
  })

  it('gives the supervisor no MCP tools either, since it reads untrusted text', () => {
    expect(CLAUDE_ARGS).toContain('--strict-mcp-config')
    expect(CLAUDE_ARGS).toContain(`--disallowedTools 'mcp__*'`)
    expect(CLAUDE_ARGS).toContain('--permission-mode default')
  })
})
