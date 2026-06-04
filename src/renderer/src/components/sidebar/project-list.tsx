import { useCallback, useEffect, useRef } from 'react'
import { AddProjectButton } from './add-project-button'
import { ProjectItem } from './project-item'
import { useProjects } from '@renderer/hooks/use-projects'
import {
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_WIDTH,
  useWorkspace,
} from '@renderer/state/store'

export function ProjectList() {
  const { projects, selectedProjectId, addProject, remove, rename, select, openInITerm, openInFinder } =
    useProjects()
  const sidebarWidth = useWorkspace((s) => s.sidebarWidth)
  const setSidebarWidth = useWorkspace((s) => s.setSidebarWidth)
  const toggleSidebar = useWorkspace((s) => s.toggleSidebar)

  const draggingRef = useRef(false)

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault()
      draggingRef.current = true
      const target = e.currentTarget
      target.setPointerCapture(e.pointerId)
      document.body.style.cursor = 'col-resize'
    },
    []
  )

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!draggingRef.current) return
      setSidebarWidth(e.clientX)
    },
    [setSidebarWidth]
  )

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!draggingRef.current) return
      draggingRef.current = false
      e.currentTarget.releasePointerCapture(e.pointerId)
      document.body.style.cursor = ''
    },
    []
  )

  const handleDoubleClick = useCallback(() => {
    setSidebarWidth(256)
  }, [setSidebarWidth])

  useEffect(() => {
    return () => {
      document.body.style.cursor = ''
    }
  }, [])

  return (
    <aside
      className="relative flex flex-col h-full flex-shrink-0 border-r border-accent/14 bg-surface/40 backdrop-blur-sm"
      style={{ width: sidebarWidth, minWidth: SIDEBAR_MIN_WIDTH, maxWidth: SIDEBAR_MAX_WIDTH }}
    >
      <header className="app-titlebar flex items-center h-11 px-3 pl-20 border-b border-accent/14">
        <span className="text-[11px] uppercase tracking-wider text-foreground/40 font-medium flex-1">
          Projects
        </span>
        <button
          type="button"
          onClick={toggleSidebar}
          aria-label="Collapse sidebar"
          title="Collapse sidebar"
          className="ml-1 flex items-center justify-center w-6 h-6 rounded-md text-foreground/50 hover:text-foreground hover:bg-foreground/10 transition-colors"
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
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
      </header>

      <div className="flex-1 overflow-y-auto p-2">
        {projects.length === 0 ? (
          <div className="text-xs text-foreground/40 px-2 py-6 text-center">
            No projects yet.
          </div>
        ) : (
          <div className="flex flex-col gap-0.5">
            {projects.map((p) => (
              <ProjectItem
                key={p.id}
                project={p}
                selected={p.id === selectedProjectId}
                onSelect={() => void select(p.id)}
                onRename={(name) => void rename(p.id, name)}
                onRemove={() => void remove(p.id)}
                onOpenInITerm={() => void openInITerm(p.id)}
                onOpenInFinder={() => void openInFinder(p.id)}
              />
            ))}
          </div>
        )}
      </div>

      <div className="p-2 border-t border-accent/14">
        <AddProjectButton onAdd={() => void addProject()} />
      </div>

      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize sidebar"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onDoubleClick={handleDoubleClick}
        className="group absolute top-0 right-0 h-full w-1.5 -mr-0.5 cursor-col-resize z-10"
      >
        <div className="absolute inset-y-0 right-0 w-px bg-transparent group-hover:bg-foreground/30 transition-colors" />
      </div>
    </aside>
  )
}
