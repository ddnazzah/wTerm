// Keeps each tab's saved session id on the conversation Claude is really in.
//
// A launch command only says where a tab started. `/clear` and `/resume` move it to
// another conversation without any shell command, so a tab launched with
// `--resume X` used to come back as X on every restart, however old X had become.
// Claude records the truth in <config>/sessions/<pid>.json. That format is not a
// public contract, so anything unexpected leaves the tab's record as it was.

import { execFile } from 'node:child_process'
import { promises as fs } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { extractPinnedSessionId, isClaudeLaunch } from '@shared/claude-session'
import type { ProjectId, TerminalRecord } from '@shared/types'
import { claudeProjectSlug } from './claude-session-watch'

const run = promisify(execFile)

const TRACK_INTERVAL_MS = 10_000
const PS_TIMEOUT_MS = 5_000
const PS_MAX_BUFFER = 16 * 1024 * 1024
/** A conversation's latest reply is near the end, and transcripts can be huge. */
const TRANSCRIPT_TAIL_BYTES = 1024 * 1024
const SESSION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type AgentRecord = NonNullable<TerminalRecord['agent']>

export interface ProcessRow {
  pid: number
  ppid: number
  command: string
}

export interface TrackedTab {
  projectId: ProjectId
  terminal: TerminalRecord
  /** The tab's shell process. */
  rootPid: number
}

export interface SyncRequest {
  tabs: TrackedTab[]
  processTable: string
  configDir: string
  update: (projectId: ProjectId, next: TerminalRecord) => void
}

export function parseProcessTable(table: string): ProcessRow[] {
  return table.split('\n').flatMap((line) => {
    const match = line.match(/^\s*(\d+)\s+(\d+)\s+(.*)$/)
    return match ? [{ pid: Number(match[1]), ppid: Number(match[2]), command: match[3] }] : []
  })
}

/** Claude processes under a tab, nearest first, so its own beats any subagent. */
export function findClaudePids(rows: ProcessRow[], rootPid: number): number[] {
  const seen = new Set([rootPid])
  const found: number[] = []
  let level = [rootPid]
  while (level.length > 0) {
    const children = rows.filter((row) => level.includes(row.ppid) && !seen.has(row.pid))
    children.forEach((row) => seen.add(row.pid))
    found.push(...children.filter((row) => /\bclaude\b/.test(row.command)).map((row) => row.pid))
    level = children.map((row) => row.pid)
  }
  return found
}

/** What a shell capture means for the record. A repeat must not undo a tracked move. */
export function capturedAgent(
  current: TerminalRecord['agent'],
  agent: { command: string; cwd: string }
): AgentRecord {
  const isSameLaunch = current?.command === agent.command && current?.cwd === agent.cwd
  const pinned = isClaudeLaunch(agent.command) ? extractPinnedSessionId(agent.command) : null
  const sessionId = (isSameLaunch ? current?.sessionId : null) ?? pinned
  return { command: agent.command, cwd: agent.cwd, ...(sessionId ? { sessionId } : {}) }
}

export function withLiveSession(
  terminal: TerminalRecord,
  sessionId: string,
  resumeCwd?: string
): TerminalRecord {
  const { resumeCwd: _old, ...rest } = terminal
  return {
    ...rest,
    // Restore prefers an owned id, so it has to move too or the tab stays stale.
    ...(terminal.claudeSessionId ? { claudeSessionId: sessionId } : {}),
    ...(terminal.agent ? { agent: { ...terminal.agent, sessionId } } : {}),
    ...(resumeCwd ? { resumeCwd } : {}),
  }
}

async function readLiveSession(
  configDir: string,
  pid: number
): Promise<{ sessionId: string; cwd: string } | null> {
  try {
    const raw: unknown = JSON.parse(await fs.readFile(join(configDir, 'sessions', `${pid}.json`), 'utf-8'))
    const { sessionId, cwd } = raw as { sessionId?: unknown; cwd?: unknown }
    if (typeof sessionId !== 'string' || !SESSION_ID.test(sessionId)) return null
    return { sessionId, cwd: typeof cwd === 'string' ? cwd : '' }
  } catch {
    return null
  }
}

/** Resuming a session with no reply yet fails, so such a session does not count. */
async function hasConversation(configDir: string, folder: string, sessionId: string): Promise<boolean> {
  const path = join(configDir, 'projects', claudeProjectSlug(folder), `${sessionId}.jsonl`)
  let handle: fs.FileHandle | null = null
  try {
    handle = await fs.open(path, 'r')
    const { size } = await handle.stat()
    const length = Math.min(size, TRANSCRIPT_TAIL_BYTES)
    const { buffer } = await handle.read(Buffer.alloc(length), 0, length, size - length)
    return buffer.includes('"type":"assistant"')
  } catch {
    return false
  } finally {
    await handle?.close()
  }
}

function currentSessionId(terminal: TerminalRecord): string | undefined {
  return terminal.claudeSessionId ?? terminal.agent?.sessionId
}

async function syncTab(tab: TrackedTab, rows: ProcessRow[], request: SyncRequest): Promise<void> {
  const { terminal } = tab
  if (!terminal.agent || !isClaudeLaunch(terminal.agent.command)) return

  // Only the nearest Claude that has a session file: never fall through to a subagent.
  let live: { sessionId: string; cwd: string } | null = null
  for (const pid of findClaudePids(rows, tab.rootPid)) {
    live = await readLiveSession(request.configDir, pid)
    if (live) break
  }
  if (!live || live.sessionId === currentSessionId(terminal)) return

  const { configDir, update } = request
  if (await hasConversation(configDir, terminal.agent.cwd, live.sessionId)) {
    update(tab.projectId, withLiveSession(terminal, live.sessionId))
  } else if (live.cwd && (await hasConversation(configDir, live.cwd, live.sessionId))) {
    update(tab.projectId, withLiveSession(terminal, live.sessionId, live.cwd))
  }
}

export async function syncTabSessions(request: SyncRequest): Promise<void> {
  const rows = parseProcessTable(request.processTable)
  await Promise.all(request.tabs.map((tab) => syncTab(tab, rows, request)))
}

export interface TrackerDeps {
  listTabs: () => TrackedTab[]
  update: SyncRequest['update']
}

/** Polls while the app runs. Returns the function that stops it. */
export function startSessionTracking({ listTabs, update }: TrackerDeps): () => void {
  const configDir = process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), '.claude')
  let isRunning = false

  const pass = async (): Promise<void> => {
    const tabs = listTabs()
    if (isRunning || tabs.length === 0) return
    isRunning = true
    try {
      const { stdout } = await run('ps', ['-axo', 'pid=,ppid=,command='], {
        timeout: PS_TIMEOUT_MS,
        maxBuffer: PS_MAX_BUFFER,
      })
      await syncTabSessions({ tabs, processTable: stdout, configDir, update })
    } catch (err) {
      console.error('[claude-session-track] pass failed:', err)
    } finally {
      isRunning = false
    }
  }

  const timer = setInterval(() => void pass(), TRACK_INTERVAL_MS)
  return () => clearInterval(timer)
}
