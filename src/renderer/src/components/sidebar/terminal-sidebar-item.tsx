import { useCallback, useEffect, useState } from 'react'
import type { TerminalRecord } from '@shared/types'
import { ActivityDot } from '../activity-dot'
import { ContextMenu, MenuDivider, MenuItem } from '../context-menu'
import { useAutopilotSnapshot } from '@renderer/hooks/use-autopilot-snapshot'
import { useAutopilot } from '@renderer/state/autopilot'
import { autopilotMode, autopilotSummary, menuDecisions } from '@renderer/lib/autopilot-label'
import type { AttentionMeta } from '@renderer/state/store'

interface Props {
  terminal: TerminalRecord
  active: boolean
  unread: boolean
  busy?: boolean
  attention?: boolean
  attentionMeta?: AttentionMeta
  autoTitle?: string
  index: number
  projectId: string
  onSelect: () => void
  onClose: () => void
  onRename: (name: string) => void
  onReorder: (from: number, to: number) => void
}

export function TerminalSidebarItem({
  terminal,
  active,
  unread,
  busy,
  attention,
  attentionMeta,
  autoTitle,
  index,
  projectId,
  onSelect,
  onClose,
  onRename,
  onReorder,
}: Props) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(terminal.name)
  const [dragOver, setDragOver] = useState(false)
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  const autopilot = useAutopilotSnapshot(terminal.id)
  const putAutopilot = useAutopilot((s) => s.put)
  const autopilotOn = autopilot?.enabled ?? false

  // Sync the draft to external renames, but never while the user is typing —
  // agent auto-renames land mid-edit and must not wipe the draft.
  useEffect(() => {
    if (!editing) setDraft(terminal.name)
  }, [terminal.name, editing])

  const displayName = autoTitle && autoTitle.length > 0 ? autoTitle : terminal.name

  const commit = (): void => {
    setEditing(false)
    const trimmed = draft.trim()
    if (trimmed && trimmed !== terminal.name) {
      onRename(trimmed)
      return
    }
    // Clearing a manually-set name re-enables auto-naming (name is kept until
    // the agent's next task title replaces it).
    if (!trimmed && terminal.nameSource === 'user') onRename('')
    setDraft(terminal.name)
  }

  const closeMenu = useCallback(() => setMenu(null), [])
  const runFromMenu = (action: () => void): void => {
    setMenu(null)
    action()
  }
  const toggleAutopilot = (): void => {
    void window.api.autopilot.setEnabled(terminal.id, !autopilotOn).then(putAutopilot)
  }

  return (
    <>
      <div
        draggable={!editing}
        onClick={onSelect}
        onContextMenu={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setMenu({ x: e.clientX, y: e.clientY })
        }}
        onDoubleClick={(e) => {
          e.stopPropagation()
          setEditing(true)
        }}
        onDragStart={(e) => {
          e.dataTransfer.setData('text/plain', JSON.stringify({ kind: 'term', projectId, index }))
          e.dataTransfer.effectAllowed = 'move'
        }}
        onDragOver={(e) => {
          if (!e.dataTransfer.types.includes('text/plain')) return
          e.preventDefault()
          e.stopPropagation()
          e.dataTransfer.dropEffect = 'move'
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setDragOver(false)
          try {
            const data = JSON.parse(e.dataTransfer.getData('text/plain'))
            if (data?.kind === 'term' && data.projectId === projectId && typeof data.index === 'number') {
              onReorder(data.index, index)
            }
          } catch {
            // ignore malformed payloads
          }
        }}
        className={[
          'group/term relative flex items-center gap-2 pl-2 pr-1.5 py-1 rounded-md cursor-pointer transition-colors text-xs',
          active
            ? 'bg-accent/12 text-foreground'
            : 'text-foreground/65 hover:bg-foreground/5 hover:text-foreground',
          dragOver ? 'shadow-[inset_0_2px_0_0_var(--accent)]' : '',
        ].join(' ')}
        title={displayName}
      >
        <ActivityDot
          busy={!!busy}
          attention={!!attention}
          unread={unread}
          meta={attentionMeta}
          autopilot={autopilotMode(autopilot)}
          note={autopilotSummary(autopilot)}
        />
        {editing ? (
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commit()
              if (e.key === 'Escape') {
                setDraft(terminal.name)
                setEditing(false)
              }
            }}
            onClick={(e) => e.stopPropagation()}
            className="flex-1 min-w-0 bg-transparent outline-none border-b border-foreground/30 focus:border-foreground"
          />
        ) : (
          <span
            className={[
              'flex-1 truncate',
              unread ? 'text-foreground font-medium' : '',
            ].join(' ')}
          >
            {displayName}
          </span>
        )}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onClose()
          }}
          aria-label={`Close ${displayName}`}
          className="opacity-0 group-hover/term:opacity-100 text-foreground/40 hover:text-foreground hover:bg-foreground/10 rounded-sm w-4 h-4 inline-flex items-center justify-center text-[11px] leading-none transition-opacity"
        >
          ×
        </button>
      </div>
      {menu && (
        <ContextMenu x={menu.x} y={menu.y} onClose={closeMenu}>
          <MenuItem onClick={() => runFromMenu(toggleAutopilot)}>
            <span className="w-4 text-accent">{autopilotOn ? '✓' : ''}</span>
            Autopilot
          </MenuItem>
          <DecisionList lines={menuDecisions(autopilot)} />
          <MenuDivider />
          <MenuItem onClick={() => runFromMenu(() => setEditing(true))}>Rename</MenuItem>
          <MenuItem onClick={() => runFromMenu(onClose)} danger>
            Close
          </MenuItem>
        </ContextMenu>
      )}
    </>
  )
}

/** What Autopilot chose on the user's behalf, newest first. Read-only. */
function DecisionList({ lines }: { lines: string[] }) {
  if (lines.length === 0) return null
  return (
    <div className="px-3 pt-1 pb-1.5 max-w-80">
      <div className="text-[11px] text-foreground/45 pb-0.5">Autopilot decisions</div>
      {lines.map((line, i) => (
        <div key={i} className="text-[12px] text-foreground/70 truncate" title={line}>
          {line}
        </div>
      ))}
    </div>
  )
}
