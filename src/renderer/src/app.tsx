import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ProjectList } from './components/sidebar/project-list'
import { RightSidebar } from './components/right-sidebar/right-sidebar'
import { RightActivityBar } from './components/right-activity-bar'
import { TerminalPane } from './components/workspace/terminal-pane'
import { EmptyState } from './components/workspace/empty-state'
import { SettingsModal } from './components/settings-modal'
import { UpdateBanner } from './components/update-banner'
import { LeftActivityBar } from './components/left-activity-bar'
import { StatusBar } from './components/status-bar'
import { TerminalTabs } from './components/workspace/terminal-tabs'
import { FileModal } from './components/workspace/file-modal'
import { useProjects } from './hooks/use-projects'
import { createProjectTerminal, useWorkspace } from './state/store'
import { isWindows } from './lib/platform'
import type { Project, TerminalRecord } from '@shared/types'

export default function App() {
  const { projects, selectedProject, addProject } = useProjects()
  const removeTerminalLocal = useWorkspace((s) => s.removeTerminalLocal)
  const activeTerminalByProject = useWorkspace((s) => s.activeTerminalByProject)
  const selectProject = useWorkspace((s) => s.selectProject)
  const setActiveTerminal = useWorkspace((s) => s.setActiveTerminal)
  const setProjectExpanded = useWorkspace((s) => s.setProjectExpanded)
  const bumpUnread = useWorkspace((s) => s.bumpUnread)
  const clearUnread = useWorkspace((s) => s.clearUnread)
  const titleByTerminal = useWorkspace((s) => s.titleByTerminal)
  const sidebarCollapsed = useWorkspace((s) => s.sidebarCollapsed)
  const toggleSidebar = useWorkspace((s) => s.toggleSidebar)
  const rightSidebarCollapsed = useWorkspace((s) => s.rightSidebarCollapsed)
  const toggleRightSidebar = useWorkspace((s) => s.toggleRightSidebar)
  const [settingsOpen, setSettingsOpen] = useState(false)

  const pendingFocusRef = useRef<{ projectId: string; terminalId: string } | null>(null)

  const activeTerminalId = selectedProject
    ? activeTerminalByProject[selectedProject.id] ?? null
    : null

  const activeTerminal = useMemo(
    () => selectedProject?.terminals.find((t) => t.id === activeTerminalId) ?? null,
    [selectedProject, activeTerminalId]
  )

  const allTerminals = useMemo(
    () => projects.flatMap((p) => p.terminals.map((t) => ({ ...t, project: p }))),
    [projects]
  )

  useEffect(() => {
    const offExit = window.api.terminals.onExit(({ id }) => {
      void id
    })
    return offExit
  }, [])

  useEffect(() => {
    const offFocus = window.api.system.onFocusTerminal(({ projectId, terminalId }) => {
      selectProject(projectId)
      setProjectExpanded(projectId, true)
      setActiveTerminal(projectId, terminalId)
      clearUnread(terminalId)
    })
    return offFocus
  }, [selectProject, setActiveTerminal, setProjectExpanded, clearUnread])

  useEffect(() => {
    if (!activeTerminalId) return
    const tryClear = (): void => {
      if (document.hasFocus()) clearUnread(activeTerminalId)
    }
    tryClear()
    window.addEventListener('focus', tryClear)
    return () => window.removeEventListener('focus', tryClear)
  }, [activeTerminalId, clearUnread])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (!(e.metaKey || e.ctrlKey)) return

      if (e.key === ',') {
        e.preventDefault()
        setSettingsOpen((v) => !v)
        return
      }

      if ((e.key === 'b' || e.key === 'B') && e.shiftKey) {
        e.preventDefault()
        toggleRightSidebar()
        return
      }

      if (e.key === 'b' || e.key === 'B') {
        e.preventDefault()
        toggleSidebar()
        return
      }

      if (!selectedProject) return

      if (e.key === 't') {
        e.preventDefault()
        void createProjectTerminal(selectedProject.id)
      } else if (e.key === 'w' && activeTerminalId) {
        e.preventDefault()
        void window.api.terminals.kill(activeTerminalId)
        window.api.terminals.removeRecord(selectedProject.id, activeTerminalId)
        removeTerminalLocal(selectedProject.id, activeTerminalId)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [
    selectedProject,
    removeTerminalLocal,
    activeTerminalId,
    toggleSidebar,
    toggleRightSidebar,
  ])

  const handleBell = useCallback(
    (project: Project, terminal: TerminalRecord) => {
      const isVisible =
        project.id === selectedProject?.id && terminal.id === activeTerminalId
      const focused = document.hasFocus()

      if (!(isVisible && focused)) {
        bumpUnread(terminal.id)
        pendingFocusRef.current = { projectId: project.id, terminalId: terminal.id }
      }

      void window.api.system.notify({
        title: project.name,
        body: `${terminal.name} wants your input`,
        projectId: project.id,
        terminalId: terminal.id,
      })
    },
    [selectedProject, activeTerminalId, bumpUnread]
  )

  useEffect(() => {
    const onWindowFocus = (): void => {
      const pending = pendingFocusRef.current
      if (!pending) return
      pendingFocusRef.current = null
      selectProject(pending.projectId)
      setProjectExpanded(pending.projectId, true)
      setActiveTerminal(pending.projectId, pending.terminalId)
      clearUnread(pending.terminalId)
    }
    window.addEventListener('focus', onWindowFocus)
    return () => window.removeEventListener('focus', onWindowFocus)
  }, [selectProject, setProjectExpanded, setActiveTerminal, clearUnread])

  const showEmptyNoProject = !selectedProject
  const showEmptyNoTerminals = !!selectedProject && selectedProject.terminals.length === 0

  // When the right sidebar is hidden, the main header runs to the window's right
  // edge — where the Windows window-controls overlay sits — so reserve room so
  // tabs/content don't slide under the minimize/maximize/close buttons.
  const rightSidebarVisible = !!selectedProject && !rightSidebarCollapsed
  const titlebarRightGutter = isWindows && !rightSidebarVisible ? 'pr-[100px]' : ''

  return (
    <div className="flex flex-col h-screen w-screen bg-surface text-foreground">
      <div className="flex flex-1 min-h-0">
        <LeftActivityBar onOpenSettings={() => setSettingsOpen(true)} />
        {!sidebarCollapsed && <ProjectList />}
        <main className="flex-1 flex flex-col min-w-0">
          <header
            className={`app-titlebar h-11 flex items-center px-4 border-b border-accent/14 ${titlebarRightGutter}`}
          >
            <span className="flex-1" />
            <span className="text-[12px] text-foreground/70 truncate text-center">
              {selectedProject
                ? `${selectedProject.name}${activeTerminal ? ` — ${titleByTerminal[activeTerminal.id] || activeTerminal.name}` : ''} · wTerm`
                : 'wTerm'}
            </span>
            <span className="flex-1" />
          </header>

          {selectedProject && selectedProject.terminals.length > 0 && (
            <TerminalTabs project={selectedProject} />
          )}

          <div className="@container relative flex-1 min-w-0 overflow-hidden">
            {allTerminals.map((t) => (
              <TerminalPane
                key={t.id}
                terminalId={t.id}
                active={t.project.id === selectedProject?.id && t.id === activeTerminalId}
                onBell={() => handleBell(t.project, t)}
              />
            ))}
            {showEmptyNoProject && (
              <EmptyState hasSelection={false} onAddProject={() => void addProject()} />
            )}
            {showEmptyNoTerminals && (
              <EmptyState
                hasSelection
                onCreateTerminal={() => {
                  if (!selectedProject) return
                  void createProjectTerminal(selectedProject.id)
                }}
              />
            )}
          </div>
        </main>
        {selectedProject && !rightSidebarCollapsed && <RightSidebar project={selectedProject} />}
        <RightActivityBar
          onOpenSettings={() => setSettingsOpen(true)}
          panelDisabled={!selectedProject}
        />
      </div>
      <StatusBar project={selectedProject} />
      {selectedProject && <FileModal projectId={selectedProject.id} />}
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <UpdateBanner />
    </div>
  )
}
