import { contextBridge, ipcRenderer } from 'electron'
import {
  IPC,
  type AppState,
  type CreateTerminalOptions,
  type FocusTerminalPayload,
  type NotifyPayload,
  type Project,
  type ProjectId,
  type TerminalDataPayload,
  type TerminalExitPayload,
  type TerminalId,
  type TerminalRecord,
} from '@shared/types'

const api = {
  projects: {
    snapshot: (): Promise<AppState> => ipcRenderer.invoke(IPC.projects.snapshot),
    add: (folderPath: string): Promise<Project> =>
      ipcRenderer.invoke(IPC.projects.add, folderPath),
    remove: (id: ProjectId): Promise<void> =>
      ipcRenderer.invoke(IPC.projects.remove, id),
    rename: (id: ProjectId, name: string): Promise<void> =>
      ipcRenderer.invoke(IPC.projects.rename, id, name),
    select: (id: ProjectId | null): Promise<void> =>
      ipcRenderer.invoke(IPC.projects.select, id),
    openInITerm: (id: ProjectId): Promise<void> =>
      ipcRenderer.invoke(IPC.projects.openInITerm, id),
    openInFinder: (id: ProjectId): Promise<void> =>
      ipcRenderer.invoke(IPC.projects.openInFinder, id),
  },
  terminals: {
    create: (opts: CreateTerminalOptions): Promise<TerminalRecord | null> =>
      ipcRenderer.invoke(IPC.terminals.create, opts),
    write: (id: string, data: string): Promise<void> =>
      ipcRenderer.invoke(IPC.terminals.write, id, data),
    resize: (id: string, cols: number, rows: number): Promise<void> =>
      ipcRenderer.invoke(IPC.terminals.resize, id, cols, rows),
    kill: (id: string): Promise<void> =>
      ipcRenderer.invoke(IPC.terminals.kill, id),
    rename: (projectId: string, id: string, name: string): Promise<void> =>
      ipcRenderer.invoke(IPC.terminals.rename, projectId, id, name),
    removeRecord: (projectId: string, id: string): void => {
      ipcRenderer.send('terminals:remove-record', projectId, id)
    },
    setActive: (projectId: ProjectId, id: TerminalId | null): void => {
      ipcRenderer.send(IPC.terminals.setActive, projectId, id)
    },
    onData: (cb: (payload: TerminalDataPayload) => void): (() => void) => {
      const listener = (_: unknown, payload: TerminalDataPayload) => cb(payload)
      ipcRenderer.on(IPC.terminals.data, listener)
      return () => ipcRenderer.off(IPC.terminals.data, listener)
    },
    onExit: (cb: (payload: TerminalExitPayload) => void): (() => void) => {
      const listener = (_: unknown, payload: TerminalExitPayload) => cb(payload)
      ipcRenderer.on(IPC.terminals.exit, listener)
      return () => ipcRenderer.off(IPC.terminals.exit, listener)
    },
  },
  dialog: {
    pickFolder: (): Promise<string | null> =>
      ipcRenderer.invoke(IPC.dialog.pickFolder),
  },
  system: {
    notify: (payload: NotifyPayload): Promise<void> =>
      ipcRenderer.invoke(IPC.system.notify, payload),
    onFocusTerminal: (cb: (payload: FocusTerminalPayload) => void): (() => void) => {
      const listener = (_: unknown, payload: FocusTerminalPayload) => cb(payload)
      ipcRenderer.on(IPC.system.focusTerminal, listener)
      return () => ipcRenderer.off(IPC.system.focusTerminal, listener)
    },
  },
}

export type Api = typeof api

contextBridge.exposeInMainWorld('api', api)
