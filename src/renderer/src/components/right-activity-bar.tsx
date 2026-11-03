import { useState, type FocusEvent } from 'react'
import { createPortal } from 'react-dom'
import { useWorkspace, type RightSidebarTab } from '@renderer/state/store'
import { isWindows, kbd } from '@renderer/lib/platform'

interface Props {
  onOpenSettings: () => void
  /** Open the project board tab; disabled when no project is selected. */
  onOpenBoard: () => void
  /** Open the project notes tab; disabled when no project is selected. */
  onOpenNotes: () => void
  /** Open the todos tab, which covers every project, so it is never disabled. */
  onOpenTodos: () => void
  /** Whether the Home terminal dock is open (drives the button's active state). */
  terminalOpen: boolean
  onToggleTerminal: () => void
  /** When true, project-bound icons (files, git, board, notes) are disabled — there's no project to inspect. */
  panelDisabled?: boolean
}

export function RightActivityBar({
  onOpenSettings,
  onOpenBoard,
  onOpenNotes,
  onOpenTodos,
  terminalOpen,
  onToggleTerminal,
  panelDisabled = false,
}: Props) {
  const tab = useWorkspace((s) => s.rightSidebarTab)
  const setTab = useWorkspace((s) => s.setRightSidebarTab)
  const collapsed = useWorkspace((s) => s.rightSidebarCollapsed)
  const setCollapsed = useWorkspace((s) => s.setRightSidebarCollapsed)

  const onPanelClick = (clicked: RightSidebarTab): void => {
    if (panelDisabled) return
    if (collapsed) {
      setTab(clicked)
      setCollapsed(false)
      return
    }
    if (clicked === tab) {
      setCollapsed(true)
      return
    }
    setTab(clicked)
  }

  const isActive = (which: RightSidebarTab): boolean =>
    !panelDisabled && !collapsed && tab === which

  return (
    <aside
      className={`app-titlebar flex flex-col items-center justify-between gap-1 py-2 ${
        isWindows ? 'pt-12' : ''
      } w-11 flex-shrink-0 bg-surface`}
    >
      <div className="flex flex-col items-center gap-1">
        <ActivityButton
          active={isActive('files')}
          disabled={panelDisabled}
          onClick={() => onPanelClick('files')}
          label={isActive('files') ? 'Hide files panel' : 'Files'}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
          </svg>
        </ActivityButton>
        <ActivityButton
          active={isActive('search')}
          disabled={panelDisabled}
          onClick={() => onPanelClick('search')}
          label={isActive('search') ? 'Hide search panel' : 'Search'}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <circle cx="11" cy="11" r="7" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </ActivityButton>
        <ActivityButton
          active={isActive('git')}
          disabled={panelDisabled}
          onClick={() => onPanelClick('git')}
          label={isActive('git') ? 'Hide source control panel' : 'Source control'}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <line x1="6" y1="3" x2="6" y2="15" />
            <circle cx="18" cy="6" r="3" />
            <circle cx="6" cy="18" r="3" />
            <path d="M18 9a9 9 0 0 1-9 9" />
          </svg>
        </ActivityButton>

        <span aria-hidden className="w-5 h-px my-1 bg-foreground/15" />

        <ActivityButton disabled={panelDisabled} onClick={onOpenBoard} label="Board">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <rect x="3" y="4" width="5" height="16" rx="1" />
            <rect x="10" y="4" width="5" height="10" rx="1" />
            <rect x="17" y="4" width="4" height="13" rx="1" />
          </svg>
        </ActivityButton>
        <ActivityButton disabled={panelDisabled} onClick={onOpenNotes} label="Notes">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M5 3h11l4 4v14H5z" />
            <line x1="9" y1="9" x2="15" y2="9" />
            <line x1="9" y1="13" x2="15" y2="13" />
            <line x1="9" y1="17" x2="13" y2="17" />
          </svg>
        </ActivityButton>
        <ActivityButton onClick={onOpenTodos} label="Todos">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M9 11l3 3 8-8" />
            <path d="M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9" />
          </svg>
        </ActivityButton>
        <ActivityButton active={terminalOpen} onClick={onToggleTerminal} label={`Terminal (${kbd('J')})`}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <polyline points="4 17 10 11 4 5" />
            <line x1="12" y1="19" x2="20" y2="19" />
          </svg>
        </ActivityButton>
      </div>

      <div className="flex flex-col items-center gap-1">
        <ActivityButton onClick={onOpenSettings} label={`Settings (${kbd(',')})`}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </ActivityButton>
      </div>
    </aside>
  )
}

const TOOLTIP_GAP_PX = 8

interface TooltipAnchor {
  right: number
  top: number
}

function anchorFor(element: Element): TooltipAnchor {
  const box = element.getBoundingClientRect()
  return {
    right: document.documentElement.clientWidth - box.left + TOOLTIP_GAP_PX,
    top: box.top + box.height / 2,
  }
}

/**
 * Rendered on the body because it opens over the editor overlay. Raising the bar to
 * clear that overlay would also put the bar above the menus that overlap it.
 */
function ActivityTooltip({ label, anchor }: { label: string; anchor: TooltipAnchor }) {
  return createPortal(
    <span
      role="tooltip"
      style={{ right: anchor.right, top: anchor.top }}
      className="pointer-events-none fixed z-[60] -translate-y-1/2 px-2 py-1 rounded-md whitespace-nowrap text-[11px] text-foreground bg-surface border border-accent/14 shadow-md"
    >
      {label}
    </span>,
    document.body
  )
}

function ActivityButton({
  active = false,
  disabled = false,
  onClick,
  label,
  children,
}: {
  active?: boolean
  disabled?: boolean
  onClick: () => void
  label: string
  children: React.ReactNode
}) {
  const [anchor, setAnchor] = useState<TooltipAnchor | null>(null)
  const onFocus = (event: FocusEvent<HTMLElement>): void => {
    if (event.target.matches(':focus-visible')) setAnchor(anchorFor(event.currentTarget))
  }

  // The handlers sit on a wrapper because React drops mouse events on a disabled button.
  return (
    <span
      className="flex"
      onMouseEnter={(event) => setAnchor(anchorFor(event.currentTarget))}
      onMouseLeave={() => setAnchor(null)}
      onFocus={onFocus}
      onBlur={() => setAnchor(null)}
    >
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-label={label}
        aria-pressed={active}
        className={[
          'relative flex items-center justify-center w-9 h-9 rounded-md transition-colors',
          disabled
            ? 'text-foreground/20 cursor-not-allowed'
            : active
              ? 'text-foreground bg-foreground/10'
              : 'text-foreground/55 hover:text-foreground hover:bg-foreground/10',
        ].join(' ')}
      >
        {children}
        {active && (
          <span
            aria-hidden
            className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[2px] rounded-r bg-foreground"
          />
        )}
      </button>
      {anchor && <ActivityTooltip label={label} anchor={anchor} />}
    </span>
  )
}
