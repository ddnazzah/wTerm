import { create } from 'zustand'
import type { Project, ProjectId, TerminalId, TerminalRecord } from '@shared/types'

interface WorkspaceState {
  projects: Project[]
  selectedProjectId: ProjectId | null
  activeTerminalByProject: Record<ProjectId, TerminalId | null>
  expandedProjectIds: Record<ProjectId, boolean>
  unreadByTerminal: Record<TerminalId, number>

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
}

export const useWorkspace = create<WorkspaceState>((set) => ({
  projects: [],
  selectedProjectId: null,
  activeTerminalByProject: {},
  expandedProjectIds: {},
  unreadByTerminal: {},

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
      }
    })
    if (nextActive !== undefined) {
      window.api?.terminals.setActive(projectId, nextActive)
    }
  },

  renameTerminalLocal: (projectId, terminalId, name) =>
    set((state) => ({
      projects: state.projects.map((p) =>
        p.id === projectId
          ? { ...p, terminals: p.terminals.map((t) => (t.id === terminalId ? { ...t, name } : t)) }
          : p
      ),
    })),

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
}))
