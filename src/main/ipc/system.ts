import { BrowserWindow, ipcMain, Notification, shell } from 'electron'
import { spawn } from 'node:child_process'
import { IPC, type FocusTerminalPayload, type NotifyPayload, type ProjectId } from '@shared/types'
import { getProject } from '../store/state'

let mainWindowRef: BrowserWindow | null = null

export function setMainWindow(win: BrowserWindow): void {
  mainWindowRef = win
}

export function registerSystemIpc(): void {
  ipcMain.handle(IPC.projects.openInITerm, (_e, id: ProjectId): void => {
    const project = getProject(id)
    if (!project) return
    spawn('open', ['-a', 'iTerm', project.path], { detached: true, stdio: 'ignore' }).unref()
  })

  ipcMain.handle(IPC.projects.openInFinder, (_e, id: ProjectId): void => {
    const project = getProject(id)
    if (!project) return
    shell.openPath(project.path)
  })

  ipcMain.handle(IPC.system.notify, (_e, payload: NotifyPayload): void => {
    if (!Notification.isSupported()) return
    const n = new Notification({
      title: payload.title,
      body: payload.body,
      silent: false,
    })
    n.on('click', () => {
      const win = mainWindowRef
      if (!win) return
      if (win.isMinimized()) win.restore()
      win.show()
      win.focus()
      const focusPayload: FocusTerminalPayload = {
        projectId: payload.projectId,
        terminalId: payload.terminalId,
      }
      win.webContents.send(IPC.system.focusTerminal, focusPayload)
    })
    n.show()
  })
}
