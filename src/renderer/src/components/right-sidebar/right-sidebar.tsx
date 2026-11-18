import { useCallback, useEffect, useRef, useState } from 'react'
import {
  RIGHT_SIDEBAR_MAX_WIDTH,
  RIGHT_SIDEBAR_MIN_WIDTH,
  useWorkspace,
} from '@renderer/state/store'
import type { GitFileStatusMap, Project } from '@shared/types'
import { changedFileCount, type RightSidebarTab } from '@renderer/lib/right-panel'
import { FileTree } from './file-tree'
import { GitPanel } from './git-panel'
import { SearchPanel } from './search-panel'

interface Props {
  project: Project
}

export function RightSidebar({ project }: Props) {
  const width = useWorkspace((s) => s.rightSidebarWidth)
  const setWidth = useWorkspace((s) => s.setRightSidebarWidth)
  const tab = useWorkspace((s) => s.rightSidebarTab)
  const setTab = useWorkspace((s) => s.setRightSidebarTab)
  const changedCount = useChangedCount(project.id, tab)

  const draggingRef = useRef(false)
  const startXRef = useRef(0)
  const startWidthRef = useRef(width)

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault()
      draggingRef.current = true
      startXRef.current = e.clientX
      startWidthRef.current = width
      e.currentTarget.setPointerCapture(e.pointerId)
      document.body.style.cursor = 'col-resize'
    },
    [width]
  )

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!draggingRef.current) return
      const delta = startXRef.current - e.clientX
      setWidth(startWidthRef.current + delta)
    },
    [setWidth]
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

  useEffect(
    () => () => {
      document.body.style.cursor = ''
    },
    []
  )

  return (
    <aside
      className="relative flex flex-shrink-0 h-full"
      style={{ width, minWidth: RIGHT_SIDEBAR_MIN_WIDTH, maxWidth: RIGHT_SIDEBAR_MAX_WIDTH }}
    >
      <div className="flex flex-col h-full w-full rounded-lg bg-background overflow-hidden">
        {tab === 'search' ? (
          <header className="app-titlebar h-11 flex items-center px-4">
            <span className="text-[10px] uppercase tracking-wider text-foreground/55 font-medium">
              Search
            </span>
          </header>
        ) : (
          <PanelTabs tab={tab} changedCount={changedCount.value} onSelect={setTab} />
        )}

        <div className="flex-1 min-h-0 overflow-hidden">
          {tab === 'search' ? (
            <SearchPanel projectId={project.id} />
          ) : tab === 'files' ? (
            <FileTree project={project} />
          ) : (
            // Keyed so in-flight git work (e.g. a push) from a previous project
            // can never write its results into the next project's panel.
            <GitPanel
              key={project.id}
              project={project}
              onStatus={changedCount.update}
              onShowTab={setTab}
            />
          )}
        </div>
      </div>

      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize right sidebar"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        className="group absolute top-0 left-0 h-full w-1.5 -ml-0.5 cursor-col-resize z-10"
      >
        <div className="absolute inset-y-0 left-0 w-px bg-transparent group-hover:bg-foreground/30 transition-colors" />
      </div>
    </aside>
  )
}

interface ChangedCount {
  value: number | null
  update: (status: GitFileStatusMap) => void
}

/**
 * How many files differ from HEAD, for the Changes tab's badge. Read when the panel
 * opens or switches tab; while Changes is showing, its own reloads keep it current.
 */
function useChangedCount(projectId: string, tab: RightSidebarTab): ChangedCount {
  const [value, setValue] = useState<number | null>(null)

  useEffect(() => {
    let isCurrent = true
    setValue(null)
    void window.api.git.fileStatus(projectId).then((status) => {
      if (isCurrent) setValue(changedFileCount(status))
    })
    return () => {
      isCurrent = false
    }
  }, [projectId, tab])

  const update = useCallback((status: GitFileStatusMap) => setValue(changedFileCount(status)), [])
  return { value, update }
}

const PANEL_TABS: ReadonlyArray<{ tab: RightSidebarTab; label: string }> = [
  { tab: 'git', label: 'Changes' },
  { tab: 'files', label: 'Files' },
]

interface PanelTabsProps {
  tab: RightSidebarTab
  changedCount: number | null
  onSelect: (tab: RightSidebarTab) => void
}

function PanelTabs({ tab, changedCount, onSelect }: PanelTabsProps) {
  return (
    <div
      role="tablist"
      aria-label="Changes and files"
      className="app-titlebar h-11 flex items-end gap-0.5 px-2 border-b border-accent/7"
    >
      {PANEL_TABS.map((item) => {
        const isSelected = item.tab === tab
        const badge = item.tab === 'git' && changedCount ? changedCount : null
        return (
          <button
            key={item.tab}
            type="button"
            role="tab"
            aria-selected={isSelected}
            onClick={() => onSelect(item.tab)}
            className={[
              'flex items-center gap-1.5 h-10 px-3 text-[12px] border-b-2 transition-colors',
              isSelected
                ? 'text-foreground border-accent'
                : 'text-foreground/55 border-transparent hover:text-foreground',
            ].join(' ')}
          >
            {item.label}
            {badge !== null && (
              <span className="px-1.5 rounded-full bg-accent/15 text-accent text-[10px] leading-4 tabular-nums">
                {badge}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
