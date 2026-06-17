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
import { buildResumeCommand, isClaudeLaunch, withSessionId } from '../pty/claude-session'
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

      const shell = opts.shell ?? getDefaultShell()
      const cwd = resolveCwd(project.path, opts.cwd)

      // Restore path: rebuild a persisted Claude tab, reusing its id so the
      // recreated PTY lines up with the existing record and active-tab state.
      if (opts.id && opts.resumeSessionId) {
        const existing = project.terminals.find((t) => t.id === opts.id)
        const record: TerminalRecord = {
          id: opts.id,
          name: existing?.name ?? opts.name ?? `Terminal ${project.terminals.length + 1}`,
          shell: existing?.shell ?? shell,
          claudeSessionId: opts.resumeSessionId,
        }
        upsertTerminal(project.id, record)
        pty.create({
          id: opts.id,
          cwd,
          shell: record.shell,
          startupCommand: buildResumeCommand(opts.startupCommand, opts.resumeSessionId),
        })
        return record
      }

      // New tab. When it launches Claude, generate and pin a session id so the
      // transcript is ours to resume after a restart (see pty/claude-session.ts).
      // We only claim ownership when we actually injected the id — if the user's
      // command already pins a session, withSessionId leaves it untouched and we
      // must not record an id we don't control.
      const id = randomUUID()
      let claudeSessionId: string | undefined
      let startupCommand = opts.startupCommand
      if (isClaudeLaunch(opts.startupCommand) && opts.startupCommand) {
        const candidate = randomUUID()
        const injected = withSessionId(opts.startupCommand, candidate)
        if (injected !== opts.startupCommand) {
          claudeSessionId = candidate
          startupCommand = injected
        }
      }
      const record: TerminalRecord = {
        id,
        name: opts.name ?? `Terminal ${project.terminals.length + 1}`,
        shell,
        ...(claudeSessionId ? { claudeSessionId } : {}),
      }
      upsertTerminal(project.id, record)
      pty.create({ id, cwd, shell, startupCommand })
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
