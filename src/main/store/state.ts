import { app } from 'electron'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import type { AppState, Project, ProjectId, TerminalRecord } from '@shared/types'

const SAVE_DEBOUNCE_MS = 500

let cache: AppState = {
  version: 1,
  selectedProjectId: null,
  projects: [],
  activeTerminalByProject: {},
}
let writeTimer: NodeJS.Timeout | null = null
let pendingWrite: Promise<void> | null = null

function statePath(): string {
  return join(app.getPath('userData'), 'state.json')
}

export async function loadState(): Promise<AppState> {
  try {
    const raw = await fs.readFile(statePath(), 'utf-8')
    const parsed = JSON.parse(raw) as AppState
    if (parsed?.version === 1 && Array.isArray(parsed.projects)) {
      // Terminals are session-scoped — their PTYs die on close and we no longer
      // restore them. Drop any persisted terminal records (and the stale
      // active-tab map) on load so old/killed terminals never reappear, even
      // from a state.json written before terminal-restore was removed.
      cache = {
        ...parsed,
        projects: parsed.projects.map((p) => ({ ...p, terminals: [] })),
        activeTerminalByProject: {},
      }
    }
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.error('[state] failed to load:', err)
    }
  }
  return cache
}

export function getState(): AppState {
  return cache
}

export function getProject(id: ProjectId): Project | undefined {
  return cache.projects.find((p) => p.id === id)
}

export function setState(next: AppState): void {
  cache = next
  scheduleSave()
}

export function mutate(fn: (draft: AppState) => void): AppState {
  fn(cache)
  scheduleSave()
  return cache
}

function scheduleSave(): void {
  if (writeTimer) clearTimeout(writeTimer)
  writeTimer = setTimeout(() => {
    writeTimer = null
    pendingWrite = writeFile()
  }, SAVE_DEBOUNCE_MS)
}

async function writeFile(): Promise<void> {
  const target = statePath()
  const tmp = `${target}.tmp`
  // Terminals are session-scoped: their PTYs die when the app closes and we no
  // longer restore them, so persist projects with their terminal records (and
  // the now-meaningless active-tab map) stripped out.
  const persisted: AppState = {
    ...cache,
    projects: cache.projects.map((p) => ({ ...p, terminals: [] })),
    activeTerminalByProject: {},
  }
  const json = JSON.stringify(persisted, null, 2)
  await fs.mkdir(join(target, '..'), { recursive: true }).catch(() => {})
  await fs.writeFile(tmp, json, 'utf-8')
  await fs.rename(tmp, target)
}

export async function saveStateNow(): Promise<void> {
  if (writeTimer) {
    clearTimeout(writeTimer)
    writeTimer = null
  }
  if (pendingWrite) await pendingWrite.catch(() => {})
  await writeFile()
}

export function upsertTerminal(projectId: ProjectId, terminal: TerminalRecord): void {
  mutate((s) => {
    const project = s.projects.find((p) => p.id === projectId)
    if (!project) return
    const existing = project.terminals.find((t) => t.id === terminal.id)
    if (existing) Object.assign(existing, terminal)
    else project.terminals.push(terminal)
  })
}

export function removeTerminal(projectId: ProjectId, terminalId: string): void {
  mutate((s) => {
    const project = s.projects.find((p) => p.id === projectId)
    if (!project) return
    project.terminals = project.terminals.filter((t) => t.id !== terminalId)
  })
}
