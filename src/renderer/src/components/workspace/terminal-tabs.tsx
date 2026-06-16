import { createProjectTerminal, useWorkspace } from '@renderer/state/store'
import type { Project } from '@shared/types'

interface Props {
  project: Project
}

export function TerminalTabs({ project }: Props) {
  const activeId = useWorkspace((s) => s.activeTerminalByProject[project.id] ?? null)
  const setActive = useWorkspace((s) => s.setActiveTerminal)
  const removeTerminalLocal = useWorkspace((s) => s.removeTerminalLocal)
  const titleByTerminal = useWorkspace((s) => s.titleByTerminal)
  const unreadByTerminal = useWorkspace((s) => s.unreadByTerminal)
  const busyByTerminal = useWorkspace((s) => s.busyByTerminal)

  const closeTerminal = (id: string): void => {
    void window.api.terminals.kill(id)
    window.api.terminals.removeRecord(project.id, id)
    removeTerminalLocal(project.id, id)
  }

  return (
    <div className="flex items-stretch h-9 min-w-0 overflow-x-auto">
      {project.terminals.map((t) => {
        const isActive = t.id === activeId
        const name = titleByTerminal[t.id] || t.name
        const unread = (unreadByTerminal[t.id] ?? 0) > 0
        const busy = !!busyByTerminal[t.id]
        return (
          <div
            key={t.id}
            onClick={() => setActive(project.id, t.id)}
            className={[
              'group/tt relative flex items-center gap-1.5 pl-3 pr-2 text-[12px] cursor-pointer transition-colors min-w-0 flex-shrink-0',
              isActive ? 'bg-foreground/8 text-foreground' : 'text-foreground/65 hover:bg-foreground/5 hover:text-foreground',
              busy ? 'terminal-item-busy' : '',
            ].join(' ')}
            title={name}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="flex-shrink-0 opacity-70">
              <polyline points="4 17 10 11 4 5" /><line x1="12" y1="19" x2="20" y2="19" />
            </svg>
            <span className={['truncate max-w-[160px]', unread ? 'font-medium text-foreground' : ''].join(' ')}>{name}</span>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); closeTerminal(t.id) }}
              aria-label={`Close ${name}`}
              className="flex items-center justify-center w-4 h-4 rounded text-foreground/45 opacity-0 group-hover/tt:opacity-100 hover:bg-foreground/10"
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden>
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        )
      })}
      <button
        type="button"
        onClick={() => void createProjectTerminal(project.id)}
        aria-label="New terminal"
        title="New terminal"
        className="flex items-center justify-center w-8 flex-shrink-0 text-foreground/55 hover:text-foreground hover:bg-foreground/5 text-base leading-none"
      >
        +
      </button>
    </div>
  )
}
