import { useEffect, useState } from 'react'
import type { TerminalRecord } from '@shared/types'

interface Props {
  terminal: TerminalRecord
  active: boolean
  unread: boolean
  onSelect: () => void
  onClose: () => void
  onRename: (name: string) => void
}

export function TerminalSidebarItem({
  terminal,
  active,
  unread,
  onSelect,
  onClose,
  onRename,
}: Props) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(terminal.name)

  useEffect(() => setDraft(terminal.name), [terminal.name])

  const commit = (): void => {
    setEditing(false)
    const trimmed = draft.trim()
    if (trimmed && trimmed !== terminal.name) onRename(trimmed)
    else setDraft(terminal.name)
  }

  return (
    <div
      onClick={onSelect}
      onDoubleClick={(e) => {
        e.stopPropagation()
        setEditing(true)
      }}
      className={[
        'group/term flex items-center gap-2 pl-2 pr-1.5 py-1 rounded-md cursor-pointer transition-colors text-xs',
        active
          ? 'bg-foreground/10 text-foreground'
          : 'text-foreground/65 hover:bg-foreground/5 hover:text-foreground',
      ].join(' ')}
      title={terminal.name}
    >
      <span
        className={[
          'inline-block w-1 h-3 rounded-sm flex-shrink-0',
          active ? 'bg-foreground/70' : 'bg-foreground/25 group-hover/term:bg-foreground/40',
        ].join(' ')}
        aria-hidden
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
          {terminal.name}
        </span>
      )}
      {unread && (
        <span
          aria-label="Unread activity"
          title="Wants your input"
          className="inline-block w-1.5 h-1.5 rounded-full bg-sky-400 flex-shrink-0 animate-pulse"
        />
      )}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          onClose()
        }}
        aria-label={`Close ${terminal.name}`}
        className="opacity-0 group-hover/term:opacity-100 text-foreground/40 hover:text-foreground hover:bg-foreground/10 rounded-sm w-4 h-4 inline-flex items-center justify-center text-[11px] leading-none transition-opacity"
      >
        ×
      </button>
    </div>
  )
}
