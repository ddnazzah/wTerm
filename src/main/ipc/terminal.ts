import { ipcMain } from 'electron'
import { randomUUID } from 'node:crypto'
import { resolve, sep } from 'node:path'
import {
  IPC,
  type CreateTerminalOptions,
  type ProjectId,
  type TerminalId,
  type TerminalRecord,
} from '@shared/types'
import { getProject, mutate, removeTerminal, upsertTerminal } from '../store/state'
import { getDefaultShell } from '../pty/shell-integration'
import type { PtyManager } from '../pty/manager'

/** Resolve a project-relative cwd, refusing anything that escapes the project root. */
function resolveCwd(root: string, rel: string | undefined): string {
  const normRoot = resolve(root)
  if (!rel) return normRoot
  const abs = resolve(normRoot, rel)
  if (abs !== normRoot && !abs.startsWith(normRoot + sep)) return normRoot
  return abs
}

export function registerTerminalIpc(pty: PtyManager): void {
  ipcMain.handle(
    IPC.terminals.create,
    (_e, opts: CreateTerminalOptions): TerminalRecord | null => {
      const project = getProject(opts.projectId)
      if (!project) return null

      const id = randomUUID()
      const shell = opts.shell ?? getDefaultShell()
      const cwd = resolveCwd(project.path, opts.cwd)
      const record: TerminalRecord = {
        id,
        name: opts.name ?? `Terminal ${project.terminals.length + 1}`,
        shell,
      }
      upsertTerminal(project.id, record)
      pty.create({ id, cwd, shell, startupCommand: opts.startupCommand })
      return record
    }
  )

  ipcMain.handle(IPC.terminals.attach, (_e, id: string): string => {
    return pty.attach(id)
  })

  ipcMain.handle(IPC.terminals.write, (_e, id: string, data: string): void => {
    pty.write(id, data)
  })

  ipcMain.handle(IPC.terminals.resize, (_e, id: string, cols: number, rows: number): void => {
    pty.resize(id, cols, rows)
  })

  ipcMain.handle(IPC.terminals.kill, (_e, id: string): void => {
    pty.kill(id)
  })

  ipcMain.handle(
    IPC.terminals.rename,
    (_e, projectId: string, id: string, name: string): void => {
      const project = getProject(projectId)
      const t = project?.terminals.find((x) => x.id === id)
      if (project && t) upsertTerminal(project.id, { ...t, name })
    }
  )

  ipcMain.on('terminals:remove-record', (_e, projectId: string, id: string) => {
    // Removing the record is permanent (the terminal won't be restored), so kill
    // its pty as well rather than leaving the shell running orphaned.
    pty.kill(id)
    removeTerminal(projectId, id)
  })

  ipcMain.on(IPC.terminals.setActive, (_e, projectId: ProjectId, id: TerminalId | null) => {
    mutate((s) => {
      s.activeTerminalByProject = { ...(s.activeTerminalByProject ?? {}), [projectId]: id }
    })
  })
}
