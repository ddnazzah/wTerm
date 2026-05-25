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
      cache = {
        ...parsed,
        activeTerminalByProject: parsed.activeTerminalByProject ?? {},
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
  const json = JSON.stringify(cache, null, 2)
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
