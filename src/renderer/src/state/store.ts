import { create } from 'zustand'
import type { Project, ProjectId, TerminalId, TerminalRecord } from '@shared/types'
import { useSettings } from './settings'

export const SIDEBAR_MIN_WIDTH = 180
export const SIDEBAR_MAX_WIDTH = 480
export const SIDEBAR_DEFAULT_WIDTH = 256

export const RIGHT_SIDEBAR_MIN_WIDTH = 260
export const RIGHT_SIDEBAR_MAX_WIDTH = 640
export const RIGHT_SIDEBAR_DEFAULT_WIDTH = 340

export const FILE_PANE_MIN_WIDTH = 320
export const FILE_PANE_MAX_WIDTH = 1200
export const FILE_PANE_DEFAULT_WIDTH = 560

const SIDEBAR_WIDTH_KEY = 'tw:sidebar-width'
const SIDEBAR_COLLAPSED_KEY = 'tw:sidebar-collapsed'
const RIGHT_SIDEBAR_WIDTH_KEY = 'tw:right-sidebar-width'
const RIGHT_SIDEBAR_COLLAPSED_KEY = 'tw:right-sidebar-collapsed'
const RIGHT_SIDEBAR_TAB_KEY = 'tw:right-sidebar-tab'
const FILE_PANE_WIDTH_KEY = 'tw:file-pane-width'

export type RightSidebarTab = 'files' | 'git'

export interface OpenedFile {
  projectId: string
  path: string
}

export type FileTabKey = string // `${projectId}::${path}`
export const tabKey = (f: OpenedFile): FileTabKey => `${f.projectId}::${f.path}`

export type FileLoadState =
  | { kind: 'loading' }
  | { kind: 'text'; current: string; saved: string }
  | { kind: 'binary' }
  | { kind: 'error'; message: string }

const clampSidebarWidth = (w: number): number =>
  Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, Math.round(w)))

const clampRightSidebarWidth = (w: number): number =>
  Math.min(RIGHT_SIDEBAR_MAX_WIDTH, Math.max(RIGHT_SIDEBAR_MIN_WIDTH, Math.round(w)))

const clampFilePaneWidth = (w: number): number =>
  Math.min(FILE_PANE_MAX_WIDTH, Math.max(FILE_PANE_MIN_WIDTH, Math.round(w)))

const readInitialSidebarWidth = (): number => {
  try {
    const raw = localStorage.getItem(SIDEBAR_WIDTH_KEY)
    const n = raw ? Number.parseInt(raw, 10) : NaN
    return Number.isFinite(n) ? clampSidebarWidth(n) : SIDEBAR_DEFAULT_WIDTH
  } catch {
    return SIDEBAR_DEFAULT_WIDTH
  }
}

const readInitialSidebarCollapsed = (): boolean => {
  try {
    return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1'
  } catch {
    return false
  }
}

const readInitialRightSidebarWidth = (): number => {
  try {
    const raw = localStorage.getItem(RIGHT_SIDEBAR_WIDTH_KEY)
    const n = raw ? Number.parseInt(raw, 10) : NaN
    return Number.isFinite(n) ? clampRightSidebarWidth(n) : RIGHT_SIDEBAR_DEFAULT_WIDTH
  } catch {
    return RIGHT_SIDEBAR_DEFAULT_WIDTH
  }
}

const readInitialRightSidebarCollapsed = (): boolean => {
  try {
    // default to OPEN; explicit '1' means collapsed
    return localStorage.getItem(RIGHT_SIDEBAR_COLLAPSED_KEY) === '1'
  } catch {
    return false
  }
}

const readInitialRightSidebarTab = (): RightSidebarTab => {
  try {
    const raw = localStorage.getItem(RIGHT_SIDEBAR_TAB_KEY)
    return raw === 'git' ? 'git' : 'files'
  } catch {
    return 'files'
  }
}

const readInitialFilePaneWidth = (): number => {
  try {
    const raw = localStorage.getItem(FILE_PANE_WIDTH_KEY)
    const n = raw ? Number.parseInt(raw, 10) : NaN
    return Number.isFinite(n) ? clampFilePaneWidth(n) : FILE_PANE_DEFAULT_WIDTH
  } catch {
    return FILE_PANE_DEFAULT_WIDTH
  }
}

interface WorkspaceState {
  projects: Project[]
  selectedProjectId: ProjectId | null
  activeTerminalByProject: Record<ProjectId, TerminalId | null>
  expandedProjectIds: Record<ProjectId, boolean>
  unreadByTerminal: Record<TerminalId, number>
  titleByTerminal: Record<TerminalId, string>
  busyByTerminal: Record<TerminalId, boolean>

  sidebarWidth: number
  sidebarCollapsed: boolean
  setSidebarWidth: (width: number) => void
  setSidebarCollapsed: (collapsed: boolean) => void
  toggleSidebar: () => void

  rightSidebarWidth: number
  rightSidebarCollapsed: boolean
  rightSidebarTab: RightSidebarTab
  setRightSidebarWidth: (width: number) => void
  setRightSidebarCollapsed: (collapsed: boolean) => void
  toggleRightSidebar: () => void
  setRightSidebarTab: (tab: RightSidebarTab) => void

  filePaneWidth: number
  setFilePaneWidth: (width: number) => void

  openFiles: OpenedFile[]
  /** Per-project active file path (null = no file open in that project). */
  activeFileByProject: Record<string, string | null>
  /** Load + edit state per tab. */
  fileStates: Record<FileTabKey, FileLoadState>

  openFile: (file: OpenedFile) => void
  closeFile: (file: OpenedFile) => void
  setActiveFile: (projectId: string, path: string | null) => void
  setFileState: (file: OpenedFile, state: FileLoadState) => void
  setFileContent: (file: OpenedFile, content: string) => void
  markFileSaved: (file: OpenedFile, content: string) => void

  setProjects: (
    projects: Project[],
    opts?: {
      selectedProjectId?: ProjectId | null
      activeTerminalByProject?: Record<ProjectId, TerminalId | null>
    }
  ) => void
  upsertProject: (project: Project) => void
  removeProject: (id: ProjectId) => void
  selectProject: (id: ProjectId | null) => void
  renameProject: (id: ProjectId, name: string) => void

  addTerminal: (projectId: ProjectId, terminal: TerminalRecord) => void
  removeTerminalLocal: (projectId: ProjectId, terminalId: TerminalId) => void
  renameTerminalLocal: (projectId: ProjectId, terminalId: TerminalId, name: string) => void
  setActiveTerminal: (projectId: ProjectId, terminalId: TerminalId | null) => void

  toggleProjectExpanded: (id: ProjectId) => void
  setProjectExpanded: (id: ProjectId, expanded: boolean) => void

  bumpUnread: (terminalId: TerminalId) => void
  clearUnread: (terminalId: TerminalId) => void

  setTerminalTitle: (terminalId: TerminalId, title: string) => void

  setTerminalBusy: (terminalId: TerminalId, busy: boolean) => void
}

export const useWorkspace = create<WorkspaceState>((set) => ({
  projects: [],
  selectedProjectId: null,
  activeTerminalByProject: {},
  expandedProjectIds: {},
  unreadByTerminal: {},
  titleByTerminal: {},
  busyByTerminal: {},

  sidebarWidth: readInitialSidebarWidth(),
  sidebarCollapsed: readInitialSidebarCollapsed(),

  rightSidebarWidth: readInitialRightSidebarWidth(),
  rightSidebarCollapsed: readInitialRightSidebarCollapsed(),
  rightSidebarTab: readInitialRightSidebarTab(),

  filePaneWidth: readInitialFilePaneWidth(),

  setFilePaneWidth: (width) => {
    const next = clampFilePaneWidth(width)
    set({ filePaneWidth: next })
    try {
      localStorage.setItem(FILE_PANE_WIDTH_KEY, String(next))
    } catch {
      // ignore
    }
  },

  setRightSidebarWidth: (width) => {
    const next = clampRightSidebarWidth(width)
    set({ rightSidebarWidth: next })
    try {
      localStorage.setItem(RIGHT_SIDEBAR_WIDTH_KEY, String(next))
    } catch {
      // ignore
    }
  },

  setRightSidebarCollapsed: (collapsed) => {
    set({ rightSidebarCollapsed: collapsed })
    try {
      localStorage.setItem(RIGHT_SIDEBAR_COLLAPSED_KEY, collapsed ? '1' : '0')
    } catch {
      // ignore
    }
  },

  toggleRightSidebar: () =>
    set((state) => {
      const next = !state.rightSidebarCollapsed
      try {
        localStorage.setItem(RIGHT_SIDEBAR_COLLAPSED_KEY, next ? '1' : '0')
      } catch {
        // ignore
      }
      return { rightSidebarCollapsed: next }
    }),

  setRightSidebarTab: (tab) => {
    set({ rightSidebarTab: tab })
    try {
      localStorage.setItem(RIGHT_SIDEBAR_TAB_KEY, tab)
    } catch {
      // ignore
    }
  },

  openFiles: [],
  activeFileByProject: {},
  fileStates: {},

  openFile: (file) =>
    set((state) => {
      const key = tabKey(file)
      const alreadyOpen = state.openFiles.some(
        (f) => f.projectId === file.projectId && f.path === file.path
      )
      return {
        openFiles: alreadyOpen ? state.openFiles : [...state.openFiles, file],
        activeFileByProject: { ...state.activeFileByProject, [file.projectId]: file.path },
        fileStates: alreadyOpen
          ? state.fileStates
          : { ...state.fileStates, [key]: { kind: 'loading' } },
      }
    }),

  closeFile: (file) =>
    set((state) => {
      const key = tabKey(file)
      const remaining = state.openFiles.filter(
        (f) => !(f.projectId === file.projectId && f.path === file.path)
      )
      const wasActive = state.activeFileByProject[file.projectId] === file.path
      const nextActive: string | null = wasActive
        ? remaining
            .filter((f) => f.projectId === file.projectId)
            .at(-1)?.path ?? null
        : state.activeFileByProject[file.projectId] ?? null
      const { [key]: _omit, ...rest } = state.fileStates
      return {
        openFiles: remaining,
        activeFileByProject: { ...state.activeFileByProject, [file.projectId]: nextActive },
        fileStates: rest,
      }
    }),

  setActiveFile: (projectId, path) =>
    set((state) => ({
      activeFileByProject: { ...state.activeFileByProject, [projectId]: path },
    })),

  setFileState: (file, fileState) =>
    set((state) => ({
      fileStates: { ...state.fileStates, [tabKey(file)]: fileState },
    })),

  setFileContent: (file, content) =>
    set((state) => {
      const key = tabKey(file)
      const prev = state.fileStates[key]
      if (!prev || prev.kind !== 'text') return state
      return {
        fileStates: { ...state.fileStates, [key]: { ...prev, current: content } },
      }
    }),

  markFileSaved: (file, content) =>
    set((state) => {
      const key = tabKey(file)
      const prev = state.fileStates[key]
      if (!prev || prev.kind !== 'text') return state
      return {
        fileStates: {
          ...state.fileStates,
          [key]: { kind: 'text', current: content, saved: content },
        },
      }
    }),

  setSidebarWidth: (width) => {
    const next = clampSidebarWidth(width)
    set({ sidebarWidth: next })
    try {
      localStorage.setItem(SIDEBAR_WIDTH_KEY, String(next))
    } catch {
      // ignore — storage may be unavailable
    }
  },

  setSidebarCollapsed: (collapsed) => {
    set({ sidebarCollapsed: collapsed })
    try {
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, collapsed ? '1' : '0')
    } catch {
      // ignore
    }
  },

  toggleSidebar: () =>
    set((state) => {
      const next = !state.sidebarCollapsed
      try {
        localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? '1' : '0')
      } catch {
        // ignore
      }
      return { sidebarCollapsed: next }
    }),

  setProjects: (projects, opts) =>
    set((state) => {
      const activeNext: Record<ProjectId, TerminalId | null> = {
        ...state.activeTerminalByProject,
        ...(opts?.activeTerminalByProject ?? {}),
      }
      const expandedNext: Record<ProjectId, boolean> = { ...state.expandedProjectIds }
      for (const p of projects) {
        if (!(p.id in activeNext) || activeNext[p.id] === undefined) {
          activeNext[p.id] = p.terminals[0]?.id ?? null
        }
        const aid = activeNext[p.id]
        if (aid && !p.terminals.find((t) => t.id === aid)) {
          activeNext[p.id] = p.terminals[0]?.id ?? null
        }
      }
      const selectedId = opts?.selectedProjectId ?? state.selectedProjectId ?? projects[0]?.id ?? null
      if (selectedId && !(selectedId in expandedNext)) expandedNext[selectedId] = true
      return {
        projects,
        selectedProjectId: selectedId,
        activeTerminalByProject: activeNext,
        expandedProjectIds: expandedNext,
      }
    }),

  upsertProject: (project) =>
    set((state) => {
      const idx = state.projects.findIndex((p) => p.id === project.id)
      const next = [...state.projects]
      if (idx >= 0) next[idx] = project
      else next.push(project)
      return {
        projects: next,
        selectedProjectId: state.selectedProjectId ?? project.id,
        activeTerminalByProject: {
          ...state.activeTerminalByProject,
          [project.id]: state.activeTerminalByProject[project.id] ?? project.terminals[0]?.id ?? null,
        },
        expandedProjectIds: {
          ...state.expandedProjectIds,
          [project.id]: state.expandedProjectIds[project.id] ?? true,
        },
      }
    }),

  removeProject: (id) =>
    set((state) => {
      const projects = state.projects.filter((p) => p.id !== id)
      const { [id]: _omittedActive, ...activeRest } = state.activeTerminalByProject
      const { [id]: _omittedExpanded, ...expandedRest } = state.expandedProjectIds
      return {
        projects,
        selectedProjectId:
          state.selectedProjectId === id ? projects[0]?.id ?? null : state.selectedProjectId,
        activeTerminalByProject: activeRest,
        expandedProjectIds: expandedRest,
      }
    }),

  selectProject: (id) =>
    set((state) => ({
      selectedProjectId: id,
      expandedProjectIds: id
        ? { ...state.expandedProjectIds, [id]: true }
        : state.expandedProjectIds,
    })),

  renameProject: (id, name) =>
    set((state) => ({
      projects: state.projects.map((p) => (p.id === id ? { ...p, name } : p)),
    })),

  addTerminal: (projectId, terminal) => {
    set((state) => ({
      projects: state.projects.map((p) =>
        p.id === projectId ? { ...p, terminals: [...p.terminals, terminal] } : p
      ),
      activeTerminalByProject: {
        ...state.activeTerminalByProject,
        [projectId]: terminal.id,
      },
    }))
    window.api?.terminals.setActive(projectId, terminal.id)
  },

  removeTerminalLocal: (projectId, terminalId) => {
    let nextActive: TerminalId | null | undefined
    set((state) => {
      const project = state.projects.find((p) => p.id === projectId)
      const remaining = project ? project.terminals.filter((t) => t.id !== terminalId) : []
      const wasActive = state.activeTerminalByProject[projectId] === terminalId
      const { [terminalId]: _omittedUnread, ...unreadRest } = state.unreadByTerminal
      const { [terminalId]: _omittedTitle, ...titleRest } = state.titleByTerminal
      const { [terminalId]: _omittedBusy, ...busyRest } = state.busyByTerminal
      nextActive = wasActive
        ? remaining[0]?.id ?? null
        : state.activeTerminalByProject[projectId]
      return {
        projects: state.projects.map((p) =>
          p.id === projectId ? { ...p, terminals: remaining } : p
        ),
        activeTerminalByProject: {
          ...state.activeTerminalByProject,
          [projectId]: nextActive ?? null,
        },
        unreadByTerminal: unreadRest,
        titleByTerminal: titleRest,
        busyByTerminal: busyRest,
      }
    })
    if (nextActive !== undefined) {
      window.api?.terminals.setActive(projectId, nextActive)
    }
  },

  renameTerminalLocal: (projectId, terminalId, name) =>
    set((state) => {
      const { [terminalId]: _omittedTitle, ...titleRest } = state.titleByTerminal
      return {
        projects: state.projects.map((p) =>
          p.id === projectId
            ? { ...p, terminals: p.terminals.map((t) => (t.id === terminalId ? { ...t, name } : t)) }
            : p
        ),
        titleByTerminal: titleRest,
      }
    }),

  setActiveTerminal: (projectId, terminalId) => {
    set((state) => ({
      activeTerminalByProject: { ...state.activeTerminalByProject, [projectId]: terminalId },
    }))
    window.api?.terminals.setActive(projectId, terminalId)
  },

  toggleProjectExpanded: (id) =>
    set((state) => ({
      expandedProjectIds: {
        ...state.expandedProjectIds,
        [id]: !state.expandedProjectIds[id],
      },
    })),

  setProjectExpanded: (id, expanded) =>
    set((state) => ({
      expandedProjectIds: { ...state.expandedProjectIds, [id]: expanded },
    })),

  bumpUnread: (terminalId) =>
    set((state) => ({
      unreadByTerminal: {
        ...state.unreadByTerminal,
        [terminalId]: (state.unreadByTerminal[terminalId] ?? 0) + 1,
      },
    })),

  clearUnread: (terminalId) =>
    set((state) => {
      if (!state.unreadByTerminal[terminalId]) return state
      const { [terminalId]: _omitted, ...rest } = state.unreadByTerminal
      return { unreadByTerminal: rest }
    }),

  setTerminalTitle: (terminalId, title) =>
    set((state) => {
      const trimmed = title.trim()
      const current = state.titleByTerminal[terminalId]
      if (!trimmed) {
        if (!current) return state
        const { [terminalId]: _omitted, ...rest } = state.titleByTerminal
        return { titleByTerminal: rest }
      }
      if (current === trimmed) return state
      return {
        titleByTerminal: { ...state.titleByTerminal, [terminalId]: trimmed },
      }
    }),

  setTerminalBusy: (terminalId, busy) =>
    set((state) => {
      const current = !!state.busyByTerminal[terminalId]
      if (current === busy) return state
      if (!busy) {
        const { [terminalId]: _omitted, ...rest } = state.busyByTerminal
        return { busyByTerminal: rest }
      }
      return { busyByTerminal: { ...state.busyByTerminal, [terminalId]: true } }
    }),
}))

/**
 * Create a terminal for a project and register it locally. Funnels every
 * "new tab" path through one place so the configured startup command (Settings
 * → Terminal) is applied consistently — and only to brand-new tabs.
 */
export async function createProjectTerminal(
  projectId: ProjectId,
  opts?: { cwd?: string; name?: string }
): Promise<TerminalRecord | null> {
  const startupCommand = useSettings.getState().terminal.startupCommand.trim() || undefined
  const record = await window.api.terminals.create({ projectId, startupCommand, ...opts })
  if (record) useWorkspace.getState().addTerminal(projectId, record)
  return record
}
