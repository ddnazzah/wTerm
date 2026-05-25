import { useCallback, useEffect, useMemo } from 'react'
import { ProjectList } from './components/sidebar/project-list'
import { TerminalPane } from './components/workspace/terminal-pane'
import { EmptyState } from './components/workspace/empty-state'
import { useProjects } from './hooks/use-projects'
import { useWorkspace } from './state/store'
import type { Project, TerminalRecord } from '@shared/types'

export default function App() {
  const { projects, selectedProject, addProject } = useProjects()
  const addTerminal = useWorkspace((s) => s.addTerminal)
  const removeTerminalLocal = useWorkspace((s) => s.removeTerminalLocal)
  const activeTerminalByProject = useWorkspace((s) => s.activeTerminalByProject)
  const selectProject = useWorkspace((s) => s.selectProject)
  const setActiveTerminal = useWorkspace((s) => s.setActiveTerminal)
  const setProjectExpanded = useWorkspace((s) => s.setProjectExpanded)
  const bumpUnread = useWorkspace((s) => s.bumpUnread)
  const clearUnread = useWorkspace((s) => s.clearUnread)

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
      if (!selectedProject) return

      if (e.key === 't') {
        e.preventDefault()
        void window.api.terminals.create({ projectId: selectedProject.id }).then((rec) => {
          if (rec) addTerminal(selectedProject.id, rec)
        })
      } else if (e.key === 'w' && activeTerminalId) {
        e.preventDefault()
        void window.api.terminals.kill(activeTerminalId)
        window.api.terminals.removeRecord(selectedProject.id, activeTerminalId)
        removeTerminalLocal(selectedProject.id, activeTerminalId)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedProject, addTerminal, removeTerminalLocal, activeTerminalId])

  const handleBell = useCallback(
    (project: Project, terminal: TerminalRecord) => {
      const isVisible =
        project.id === selectedProject?.id && terminal.id === activeTerminalId
      const focused = document.hasFocus()
      if (isVisible && focused) return

      bumpUnread(terminal.id)
      void window.api.system.notify({
        title: project.name,
        body: `${terminal.name} wants your input`,
        projectId: project.id,
        terminalId: terminal.id,
      })
    },
    [selectedProject, activeTerminalId, bumpUnread]
  )

  const showEmptyNoProject = !selectedProject
  const showEmptyNoTerminals = !!selectedProject && selectedProject.terminals.length === 0

  return (
    <div className="flex h-screen w-screen bg-background text-foreground">
      <ProjectList />
      <main className="flex-1 flex flex-col min-w-0">
        <header className="app-titlebar h-11 flex items-center px-4 border-b border-foreground/10">
          {selectedProject ? (
            <div className="flex items-center gap-2 min-w-0 text-sm">
              <span
                className="inline-block w-2 h-2 rounded-full flex-shrink-0"
                style={{ background: selectedProject.color }}
                aria-hidden
              />
              <span className="font-medium truncate">{selectedProject.name}</span>
              {activeTerminal && (
                <>
                  <span className="text-foreground/30">/</span>
                  <span className="text-foreground/85 truncate">{activeTerminal.name}</span>
                </>
              )}
              <span className="text-[11px] text-foreground/40 truncate ml-2">
                {selectedProject.path}
              </span>
            </div>
          ) : (
            <span className="text-sm text-foreground/40">Terminal Workspace</span>
          )}
        </header>

        <div className="relative flex-1 min-h-0">
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
                void window.api.terminals.create({ projectId: selectedProject.id }).then((rec) => {
                  if (rec) addTerminal(selectedProject.id, rec)
                })
              }}
            />
          )}
        </div>
      </main>
    </div>
  )
}
