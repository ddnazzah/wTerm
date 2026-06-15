import { useWorkspace } from '@renderer/state/store'
import { isMac, kbd } from '@renderer/lib/platform'

interface Props {
  onOpenSettings: () => void
}

export function LeftActivityBar({ onOpenSettings }: Props) {
  const collapsed = useWorkspace((s) => s.sidebarCollapsed)
  const toggle = useWorkspace((s) => s.toggleSidebar)

  return (
    <aside
      className={`app-titlebar flex flex-col items-center justify-between gap-1 py-2 ${
        isMac ? 'pt-10' : ''
      } w-11 flex-shrink-0 border-r border-accent/14 bg-surface/40 backdrop-blur-sm`}
    >
      <div className="flex flex-col items-center gap-1">
        <ActivityButton
          active={!collapsed}
          onClick={toggle}
          label={`Explorer (${kbd('B')})`}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M3 7v13h18V7" /><path d="M3 7l2-3h6l2 3h8" />
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

function ActivityButton({
  active = false,
  onClick,
  label,
  children,
}: {
  active?: boolean
  onClick: () => void
  label: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      title={label}
      className={[
        'relative flex items-center justify-center w-9 h-9 rounded-md transition-colors',
        active
          ? 'text-foreground bg-foreground/10'
          : 'text-foreground/55 hover:text-foreground hover:bg-foreground/10',
      ].join(' ')}
    >
      {children}
      {active && (
        <span aria-hidden className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[2px] rounded-r bg-foreground" />
      )}
    </button>
  )
}
