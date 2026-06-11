import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ProjectList } from './components/sidebar/project-list'
import { RightSidebar } from './components/right-sidebar/right-sidebar'
import { RightActivityBar } from './components/right-activity-bar'
import { TerminalPane } from './components/workspace/terminal-pane'
import { EmptyState } from './components/workspace/empty-state'
import { FileViewer } from './components/workspace/file-viewer'
import { FileTabs } from './components/workspace/file-tabs'
import { SettingsModal } from './components/settings-modal'
import { UpdateBanner } from './components/update-banner'
import { useProjects } from './hooks/use-projects'
import { createProjectTerminal, useWorkspace } from './state/store'
import { isMac, isWindows, kbd } from './lib/platform'
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
  const openFiles = useWorkspace((s) => s.openFiles)
  const hasOpenFiles = !!selectedProject && openFiles.some((f) => f.projectId === selectedProject.id)
  const filePaneWidth = useWorkspace((s) => s.filePaneWidth)
  const setFilePaneWidth = useWorkspace((s) => s.setFilePaneWidth)
  const [settingsOpen, setSettingsOpen] = useState(false)

  const pendingFocusRef = useRef<{ projectId: string; terminalId: string } | null>(null)
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null)

  const onResizerPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault()
      dragRef.current = { startX: e.clientX, startWidth: filePaneWidth }
      e.currentTarget.setPointerCapture(e.pointerId)
      document.body.style.cursor = 'col-resize'
    },
    [filePaneWidth]
  )

  const onResizerPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current
      if (!drag) return
      setFilePaneWidth(drag.startWidth - (e.clientX - drag.startX))
    },
    [setFilePaneWidth]
  )

  const onResizerPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return
    dragRef.current = null
    e.currentTarget.releasePointerCapture(e.pointerId)
    document.body.style.cursor = ''
  }, [])

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
    <div className="flex h-screen w-screen bg-surface text-foreground">
      {!sidebarCollapsed && <ProjectList />}
      <main className="flex-1 flex flex-col min-w-0">
        <header
          className={`app-titlebar h-11 flex items-center gap-2 px-4 border-b border-accent/14 ${
            sidebarCollapsed && isMac ? 'pl-20' : ''
          } ${titlebarRightGutter}`}
        >
          {sidebarCollapsed && (
            <button
              type="button"
              onClick={toggleSidebar}
              aria-label="Show sidebar"
              title={`Show sidebar (${kbd('B')})`}
              className="flex items-center justify-center w-6 h-6 -ml-1 rounded-md text-foreground/50 hover:text-foreground hover:bg-foreground/10 transition-colors"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          )}
          {selectedProject ? (
            <div className="flex items-center gap-2 min-w-0 text-sm flex-shrink-0 pr-3 mr-3 border-r border-accent/14">
              <span
                className="inline-block w-2 h-2 rounded-full flex-shrink-0"
                style={{ background: selectedProject.color }}
                aria-hidden
              />
              <span className="font-medium truncate">{selectedProject.name}</span>
              {activeTerminal && (
                <>
                  <span className="text-foreground/30">/</span>
                  <span className="text-foreground/85 truncate">
                    {titleByTerminal[activeTerminal.id] || activeTerminal.name}
                  </span>
                </>
              )}
            </div>
          ) : (
            <span className="text-sm text-foreground/40">wTerm</span>
          )}
          {selectedProject && hasOpenFiles && (
            <div className="flex-1 min-w-0 self-stretch -my-px">
              <FileTabs projectId={selectedProject.id} />
            </div>
          )}
          {!(selectedProject && hasOpenFiles) && <div className="flex-1" />}
        </header>

        <div className="flex-1 min-h-0 flex">
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
          {selectedProject && hasOpenFiles && (
            <>
              <div
                onPointerDown={onResizerPointerDown}
                onPointerMove={onResizerPointerMove}
                onPointerUp={onResizerPointerUp}
                onPointerCancel={onResizerPointerUp}
                role="separator"
                aria-orientation="vertical"
                aria-label="Resize file pane"
                className="w-1 cursor-col-resize bg-accent/10 hover:bg-accent/30 transition-colors flex-shrink-0"
              />
              <div
                style={{ width: filePaneWidth }}
                className="flex-shrink-0 min-w-0 h-full"
              >
                <FileViewer projectId={selectedProject.id} />
              </div>
            </>
          )}
        </div>
      </main>
      {selectedProject && !rightSidebarCollapsed && (
        <RightSidebar project={selectedProject} />
      )}
      <RightActivityBar
        onOpenSettings={() => setSettingsOpen(true)}
        panelDisabled={!selectedProject}
      />
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <UpdateBanner />
    </div>
  )
}
