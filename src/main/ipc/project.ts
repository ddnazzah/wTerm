import { ipcMain } from 'electron'
import { basename } from 'node:path'
import { randomUUID } from 'node:crypto'
import { IPC, type AppState, type Project, type ProjectId } from '@shared/types'
import { getState, mutate } from '../store/state'

const PALETTE = [
  '#7c3aed', '#0ea5e9', '#10b981', '#f59e0b',
  '#ef4444', '#ec4899', '#14b8a6', '#a855f7',
]

function pickColor(index: number): string {
  return PALETTE[index % PALETTE.length] ?? '#7c3aed'
}

/**
 * Set the selected project. Authoritative selection lives in main state; the
 * renderer mirrors it optimistically and rehydrates from `state:changed`. Used
 * by both the IPC handler and the mobile bridge.
 */
export function selectProject(id: ProjectId | null): void {
  mutate((s) => {
    if (id === null || s.projects.some((p) => p.id === id)) {
      s.selectedProjectId = id
    }
  })
}

export function registerProjectIpc(): void {
  ipcMain.handle(IPC.projects.snapshot, (): AppState => getState())

  ipcMain.handle(IPC.projects.add, (_e, folderPath: string): Project => {
    let created!: Project
    mutate((s) => {
      const existing = s.projects.find((p) => p.path === folderPath)
      if (existing) {
        created = existing
        return
      }
      const project: Project = {
        id: randomUUID(),
        name: basename(folderPath) || folderPath,
        path: folderPath,
        color: pickColor(s.projects.length),
        terminals: [],
      }
      s.projects.push(project)
      if (!s.selectedProjectId) s.selectedProjectId = project.id
      created = project
    })
    return created
  })

  ipcMain.handle(IPC.projects.remove, (_e, id: ProjectId): void => {
    mutate((s) => {
      s.projects = s.projects.filter((p) => p.id !== id)
      if (s.selectedProjectId === id) {
        s.selectedProjectId = s.projects[0]?.id ?? null
      }
    })
  })

  ipcMain.handle(IPC.projects.rename, (_e, id: ProjectId, name: string): void => {
    mutate((s) => {
      const project = s.projects.find((p) => p.id === id)
      if (project) project.name = name
    })
  })

  ipcMain.handle(IPC.projects.select, (_e, id: ProjectId | null): void => {
    selectProject(id)
  })

  ipcMain.handle(IPC.projects.reorder, (_e, orderedIds: ProjectId[]): void => {
    mutate((s) => {
      const byId = new Map(s.projects.map((p) => [p.id, p]))
      // Default (Home) projects stay pinned to the front; user projects follow
      // the requested order, with any not named appended (defensive).
      const defaults = s.projects.filter((p) => p.isDefault)
      const ordered = orderedIds
        .map((id) => byId.get(id))
        .filter((p): p is Project => !!p && !p.isDefault)
      const orderedSet = new Set(ordered.map((p) => p.id))
      const remaining = s.projects.filter((p) => !p.isDefault && !orderedSet.has(p.id))
      s.projects = [...defaults, ...ordered, ...remaining]
    })
  })
}
