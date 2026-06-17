import { app } from 'electron'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { HOME_PROJECT_ID, type AppState, type Project, type ProjectId, type TerminalRecord } from '@shared/types'

const SAVE_DEBOUNCE_MS = 500

/**
 * Ensure the synthesized "Home" workspace sits at the front of the project list.
 * Home holds project-less terminals, always exists, starts in the OS home dir,
 * and is stripped before persisting (see {@link writeFile}) so it never drifts,
 * duplicates, or leaks into state.json.
 */
function ensureHome(projects: Project[]): Project[] {
  if (projects.some((p) => p.id === HOME_PROJECT_ID)) return projects
  const home: Project = {
    id: HOME_PROJECT_ID,
    name: 'Home',
    path: app.getPath('home'),
    color: '#5ccfe6',
    terminals: [],
    isDefault: true,
  }
  return [home, ...projects]
}

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
      // Only Claude tabs are restorable: a bare shell can't be resumed
      // meaningfully (its program is gone), but a Claude tab can be brought back
      // via `claude --resume <claudeSessionId>`. Drop every other terminal on
      // load, and keep the active-tab map only for ids that survived.
      const projects = parsed.projects.map((p) => ({
        ...p,
        terminals: (p.terminals ?? []).filter((t) => t.claudeSessionId),
      }))
      const survivingIds = new Set(projects.flatMap((p) => p.terminals.map((t) => t.id)))
      const activeTerminalByProject = Object.fromEntries(
        Object.entries(parsed.activeTerminalByProject ?? {}).filter(
          ([, id]) => id != null && survivingIds.has(id)
        )
      )
      cache = { ...parsed, projects, activeTerminalByProject }
    }
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.error('[state] failed to load:', err)
    }
  }
  cache.projects = ensureHome(cache.projects)
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
  // Persist only Claude tabs (those carry a claudeSessionId) so they can be
  // resumed next launch; bare-shell tabs stay session-scoped and are dropped.
  // The Home workspace is synthesized fresh each launch and never persisted.
  const projects = cache.projects
    .filter((p) => !p.isDefault)
    .map((p) => ({ ...p, terminals: p.terminals.filter((t) => t.claudeSessionId) }))
  const survivingIds = new Set(projects.flatMap((p) => p.terminals.map((t) => t.id)))
  const activeTerminalByProject = Object.fromEntries(
    Object.entries(cache.activeTerminalByProject ?? {}).filter(
      ([, id]) => id != null && survivingIds.has(id)
    )
  )
  const persisted: AppState = { ...cache, projects, activeTerminalByProject }
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
