import { describe, expect, test } from 'vitest'
import { HOME_PROJECT_ID, type Project, type TerminalRecord } from './types'
import { findProjectForPath, planSessionOpen } from './todo-session'

const SESSION = '11111111-1111-4111-8111-111111111111'

const project = (id: string, path: string, terminals: Partial<TerminalRecord>[] = []): Project => ({
  id,
  name: id,
  path,
  color: '#fff',
  terminals: terminals as TerminalRecord[],
})
const home: Project = { ...project(HOME_PROJECT_ID, '/Users/me'), isDefault: true }

describe('findProjectForPath', () => {
  test('matches the project root and folders inside it', () => {
    const app = project('app', '/Users/me/app')
    expect(findProjectForPath([home, app], '/Users/me/app')).toBe(app)
    expect(findProjectForPath([home, app], '/Users/me/app/.claude/worktrees/x')).toBe(app)
  })

  test('does not match a sibling that only shares a name prefix', () => {
    expect(findProjectForPath([project('app', '/Users/me/app')], '/Users/me/app-two')).toBeUndefined()
  })

  test('prefers the most specific of nested projects', () => {
    const outer = project('outer', '/Users/me/work')
    const inner = project('inner', '/Users/me/work/inner')
    expect(findProjectForPath([outer, inner], '/Users/me/work/inner/src')).toBe(inner)
  })

  test('never matches Home, which contains everything', () => {
    expect(findProjectForPath([home], '/Users/me/anything')).toBeUndefined()
  })
})

describe('planSessionOpen', () => {
  const target = { sessionId: SESSION, cwd: '/Users/me/app/src' }

  test('resumes rather than focus a tab where Claude has since exited', () => {
    const app = project('app', '/Users/me/app', [{ id: 't1', claudeSessionId: SESSION }])
    expect(planSessionOpen([home, app], target, '')).toMatchObject({ kind: 'create', cwd: 'src' })
  })

  test('resumes rather than focus an owned tab running something other than Claude', () => {
    const app = project('app', '/Users/me/app', [
      { id: 't1', claudeSessionId: SESSION, agent: { command: 'aider', cwd: '/x' } },
    ])
    expect(planSessionOpen([home, app], target, '')).toMatchObject({ kind: 'create' })
  })

  test('resumes rather than focus an owned tab now on a different session', () => {
    const app = project('app', '/Users/me/app', [
      {
        id: 't1',
        claudeSessionId: SESSION,
        agent: { command: 'claude', cwd: '/x', sessionId: 'other' },
      },
    ])
    expect(planSessionOpen([home, app], target, '')).toMatchObject({ kind: 'create' })
  })

  test('focuses a tab that owns the session while Claude runs in it', () => {
    const app = project('app', '/Users/me/app', [
      { id: 't1', claudeSessionId: SESSION, agent: { command: 'claude', cwd: '/x' } },
    ])
    expect(planSessionOpen([home, app], target, '')).toEqual({
      kind: 'focus',
      projectId: 'app',
      terminalId: 't1',
    })
  })

  test('focuses a tab whose captured agent is on the session', () => {
    const app = project('app', '/Users/me/app', [
      { id: 't2', agent: { sessionId: SESSION } } as Partial<TerminalRecord>,
    ])
    expect(planSessionOpen([home, app], target, '')).toMatchObject({ kind: 'focus', terminalId: 't2' })
  })

  test('resumes in the owning project, in the original folder', () => {
    const app = project('app', '/Users/me/app')
    expect(planSessionOpen([home, app], target, '')).toEqual({
      kind: 'create',
      projectId: 'app',
      cwd: 'src',
      sessionId: SESSION,
      startupCommand: `claude --resume ${SESSION}`,
    })
  })

  test('keeps flags from the configured startup command', () => {
    const app = project('app', '/Users/me/app')
    const plan = planSessionOpen([home, app], target, 'claude --dangerously-skip-permissions')
    expect(plan).toMatchObject({
      startupCommand: `claude --dangerously-skip-permissions --resume ${SESSION}`,
    })
  })

  test('a folder at the project root has no relative cwd', () => {
    const app = project('app', '/Users/me/app')
    const plan = planSessionOpen([home, app], { sessionId: SESSION, cwd: '/Users/me/app' }, '')
    expect(plan).toMatchObject({ kind: 'create', projectId: 'app', cwd: undefined })
  })

  test('falls back to Home so a sibling worktree resumes in its real folder', () => {
    const app = project('app', '/Users/me/app')
    const plan = planSessionOpen([home, app], { sessionId: SESSION, cwd: '/Users/me/app-wt' }, '')
    expect(plan).toMatchObject({ kind: 'create', projectId: HOME_PROJECT_ID, cwd: 'app-wt' })
  })

  test('returns null for a folder no workspace can contain', () => {
    expect(planSessionOpen([home], { sessionId: SESSION, cwd: '/opt/elsewhere' }, '')).toBeNull()
  })
})
