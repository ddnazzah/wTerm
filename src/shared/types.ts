export type ProjectId = string
export type TerminalId = string

export interface TerminalRecord {
  id: TerminalId
  name: string
  shell: string
}

export interface Project {
  id: ProjectId
  name: string
  path: string
  color: string
  terminals: TerminalRecord[]
}

export interface AppState {
  version: 1
  selectedProjectId: ProjectId | null
  projects: Project[]
  activeTerminalByProject?: Record<ProjectId, TerminalId | null>
}

export interface CreateTerminalOptions {
  projectId: ProjectId
  name?: string
  shell?: string
}

export type TerminalDataPayload = { id: TerminalId; data: string }
export type TerminalExitPayload = { id: TerminalId; exitCode: number; signal?: number }

export const IPC = {
  projects: {
    snapshot: 'projects:snapshot',
    add: 'projects:add',
    remove: 'projects:remove',
    rename: 'projects:rename',
    select: 'projects:select',
    openInITerm: 'projects:open-in-iterm',
    openInFinder: 'projects:open-in-finder',
  },
  terminals: {
    create: 'terminals:create',
    write: 'terminals:write',
    resize: 'terminals:resize',
    kill: 'terminals:kill',
    rename: 'terminals:rename',
    data: 'terminals:data',
    exit: 'terminals:exit',
    setActive: 'terminals:set-active',
  },
  dialog: {
    pickFolder: 'dialog:pick-folder',
  },
  system: {
    notify: 'system:notify',
    focusTerminal: 'system:focus-terminal',
  },
} as const

export interface NotifyPayload {
  title: string
  body: string
  projectId: ProjectId
  terminalId: TerminalId
}

export interface FocusTerminalPayload {
  projectId: ProjectId
  terminalId: TerminalId
}
