// Uses real temp folders, because the bug lives in what Claude leaves on disk: a session
// file naming the conversation a process is really in, and that conversation's transcript.

import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import type { TerminalRecord } from '@shared/types'
import {
  capturedAgent,
  findClaudePids,
  parseProcessTable,
  syncTabSessions,
  withLiveSession,
  type TrackedTab,
} from './claude-session-track'

const OLD = 'aaaaaaaa-1111-4111-8111-111111111111'
const REAL = 'bbbbbbbb-2222-4222-8222-222222222222'
const CWD = '/work/app'
const PROCESS_TABLE = `
  100     1 /bin/zsh
  200   100 claude --dangerously-skip-permissions --resume ${OLD}
  300   200 claude -p subagent
  400   100 /usr/bin/git status
  500     1 claude --resume someone-else
`

const AGENT = { command: `claude --resume ${OLD}`, cwd: CWD, sessionId: OLD }
const record = (patch: Partial<TerminalRecord> = {}): TerminalRecord =>
  ({ id: 't1', name: 'T', shell: 'zsh', agent: AGENT, ...patch }) as TerminalRecord

let config: string

async function writeLive(pid: number, sessionId: string, cwd = CWD): Promise<void> {
  await fs.mkdir(join(config, 'sessions'), { recursive: true })
  await fs.writeFile(join(config, 'sessions', `${pid}.json`), JSON.stringify({ pid, sessionId, cwd }))
}

async function writeTranscript(cwd: string, sessionId: string, type = 'assistant'): Promise<void> {
  const dir = join(config, 'projects', cwd.replace(/[^A-Za-z0-9]/g, '-'))
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(join(dir, `${sessionId}.jsonl`), `${JSON.stringify({ type, sessionId })}\n`)
}

async function sync(tab: TrackedTab = { projectId: 'p', terminal: record(), rootPid: 100 }) {
  const updates: TerminalRecord[] = []
  await syncTabSessions({
    tabs: [tab],
    processTable: PROCESS_TABLE,
    configDir: config,
    update: (_projectId, next) => updates.push(next),
  })
  return updates
}

beforeEach(async () => {
  config = await fs.mkdtemp(join(tmpdir(), 'wterm-track-'))
})

afterEach(() => fs.rm(config, { recursive: true, force: true }))

describe('findClaudePids', () => {
  test('finds Claude under the tab, nearest first, and nothing outside it', () => {
    expect(findClaudePids(parseProcessTable(PROCESS_TABLE), 100)).toEqual([200, 300])
  })

  test('survives a process table with a cycle, and never counts the tab’s own shell', () => {
    expect(findClaudePids(parseProcessTable('1 2 claude\n2 1 claude'), 1)).toEqual([2])
  })
})

describe('withLiveSession', () => {
  test('moves the sniffed id', () => {
    expect(withLiveSession(record(), REAL).agent?.sessionId).toBe(REAL)
  })

  test('moves an owned id too, because restore prefers it', () => {
    expect(withLiveSession(record({ claudeSessionId: OLD }), REAL).claudeSessionId).toBe(REAL)
  })

  test('does not invent an owned id for a tab that had none', () => {
    expect(withLiveSession(record(), REAL)).not.toHaveProperty('claudeSessionId')
  })

  test('replaces an old resume folder', () => {
    const next = withLiveSession(record({ resumeCwd: '/old' }), REAL)
    expect(next).not.toHaveProperty('resumeCwd')
    expect(withLiveSession(record(), REAL, '/new').resumeCwd).toBe('/new')
  })
})

describe('capturedAgent', () => {
  test('a repeat capture of the same launch keeps the session the tab moved to', () => {
    const current = { ...AGENT, sessionId: REAL }
    expect(capturedAgent(current, { command: AGENT.command, cwd: CWD }).sessionId).toBe(REAL)
  })

  test('a new launch uses the id it names', () => {
    const current = { ...AGENT, sessionId: REAL }
    const next = capturedAgent(current, { command: `claude --resume ${OLD} -c`, cwd: CWD })
    expect(next.sessionId).toBe(OLD)
  })

  test('a new launch that names no id forgets the old one', () => {
    expect(capturedAgent(AGENT, { command: 'claude', cwd: CWD })).toEqual({ command: 'claude', cwd: CWD })
  })
})

describe('syncTabSessions', () => {
  test('saves the conversation Claude is really in after /clear or /resume', async () => {
    await writeLive(200, REAL)
    await writeTranscript(CWD, REAL)
    const [next] = await sync()
    expect(next.agent?.sessionId).toBe(REAL)
  })

  test('changes nothing when the record is already right', async () => {
    await writeLive(200, OLD)
    await writeTranscript(CWD, OLD)
    expect(await sync()).toEqual([])
  })

  test('uses the tab’s own Claude, not a subagent beneath it', async () => {
    await writeLive(300, 'cccccccc-3333-4333-8333-333333333333')
    await writeLive(200, OLD)
    expect(await sync()).toEqual([])
  })

  test('waits for a first reply, so a just-cleared session cannot break the next resume', async () => {
    await writeLive(200, REAL)
    await writeTranscript(CWD, REAL, 'user')
    expect(await sync()).toEqual([])
  })

  test('leaves the tab alone when the new transcript cannot be found', async () => {
    await writeLive(200, REAL)
    expect(await sync()).toEqual([])
  })

  test('records the folder when the conversation belongs to another one', async () => {
    await writeLive(200, REAL, '/work/app-wt')
    await writeTranscript('/work/app-wt', REAL)
    const [next] = await sync()
    expect(next.agent?.sessionId).toBe(REAL)
    expect(next.resumeCwd).toBe('/work/app-wt')
  })

  test('ignores an unreadable session file', async () => {
    await fs.mkdir(join(config, 'sessions'), { recursive: true })
    await fs.writeFile(join(config, 'sessions', '200.json'), '{torn')
    expect(await sync()).toEqual([])
  })

  test('ignores a session file whose id is not a session id', async () => {
    await writeLive(200, '$(touch /tmp/x)')
    expect(await sync()).toEqual([])
  })

  test('ignores a tab that is not running Claude', async () => {
    await writeLive(200, REAL)
    await writeTranscript(CWD, REAL)
    const terminal = record({ agent: { command: 'npm run dev', cwd: CWD } })
    expect(await sync({ projectId: 'p', terminal, rootPid: 100 })).toEqual([])
  })
})
