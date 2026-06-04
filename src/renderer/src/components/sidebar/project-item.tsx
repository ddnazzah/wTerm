import { useState } from 'react'
import { Button, Dropdown, Label } from '@heroui/react'
import type { Project } from '@shared/types'
import { useWorkspace } from '@renderer/state/store'
import { useTerminals } from '@renderer/hooks/use-terminals'
import { isMac, isWindows } from '@renderer/lib/platform'
import { TerminalSidebarItem } from './terminal-sidebar-item'

// Per-platform names for the native terminal / file-manager apps.
const TERMINAL_APP = isMac ? 'iTerm' : isWindows ? 'Terminal' : 'terminal'
const FILE_MANAGER_APP = isMac ? 'Finder' : isWindows ? 'Explorer' : 'file manager'

interface Props {
  project: Project
  selected: boolean
  onSelect: () => void
  onRename: (name: string) => void
  onRemove: () => void
  onOpenInITerm: () => void
  onOpenInFinder: () => void
}

const ACTIONS = {
  newTerminal: 'new-terminal',
  rename: 'rename',
  finder: 'finder',
  iterm: 'iterm',
  remove: 'remove',
} as const

type ActionKey = (typeof ACTIONS)[keyof typeof ACTIONS]

export function ProjectItem({
  project,
  selected,
  onSelect,
  onRename,
  onRemove,
  onOpenInITerm,
  onOpenInFinder,
}: Props) {
  const expanded = useWorkspace((s) => !!s.expandedProjectIds[project.id])
  const toggleExpanded = useWorkspace((s) => s.toggleProjectExpanded)
  const setExpanded = useWorkspace((s) => s.setProjectExpanded)
  const unreadByTerminal = useWorkspace((s) => s.unreadByTerminal)
  const titleByTerminal = useWorkspace((s) => s.titleByTerminal)
  const busyByTerminal = useWorkspace((s) => s.busyByTerminal)

  const { activeId, create, close, rename: renameTerminal, setActive } = useTerminals(project)

  const projectHasUnread = project.terminals.some((t) => (unreadByTerminal[t.id] ?? 0) > 0)

  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(project.name)

  const commitRename = (): void => {
    setEditing(false)
    const trimmed = draft.trim()
    if (trimmed && trimmed !== project.name) onRename(trimmed)
    else setDraft(project.name)
  }

  const handleHeaderClick = (): void => {
    if (selected) {
      toggleExpanded(project.id)
    } else {
      onSelect()
      setExpanded(project.id, true)
    }
  }

  const handleNewTerminal = async (): Promise<void> => {
    onSelect()
    setExpanded(project.id, true)
    await create()
  }

  const handleAction = (key: React.Key): void => {
    switch (key as ActionKey) {
      case 'new-terminal':
        void handleNewTerminal()
        return
      case 'rename':
        setEditing(true)
        return
      case 'finder':
        onOpenInFinder()
        return
      case 'iterm':
        onOpenInITerm()
        return
      case 'remove':
        onRemove()
        return
    }
  }

  return (
    <div className="flex flex-col">
      <div
        onClick={handleHeaderClick}
        onDoubleClick={() => setEditing(true)}
        className={[
          'group/proj relative flex items-center gap-1.5 pl-1.5 pr-1 py-1.5 rounded-lg cursor-pointer transition-colors',
          selected
            ? 'bg-accent/12 text-foreground'
            : 'text-foreground/75 hover:bg-foreground/5 hover:text-foreground',
        ].join(' ')}
        title={project.path}
      >
        <span
          className={[
            'inline-flex items-center justify-center w-4 h-4 text-[10px] text-foreground/40 transition-transform',
            expanded ? 'rotate-90' : '',
          ].join(' ')}
          aria-hidden
        >
          ▶
        </span>
        <span
          className="inline-block w-2 h-2 rounded-full flex-shrink-0"
          style={{ background: project.color }}
          aria-hidden
        />
        <div className="flex-1 min-w-0">
          {editing ? (
            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitRename()
                if (e.key === 'Escape') {
                  setDraft(project.name)
                  setEditing(false)
                }
              }}
              onClick={(e) => e.stopPropagation()}
              className="w-full bg-transparent outline-none text-sm border-b border-foreground/30 focus:border-foreground"
            />
          ) : (
            <div className="text-sm truncate">{project.name}</div>
          )}
        </div>

        {!expanded && projectHasUnread && (
          <span
            aria-label="Unread terminal activity"
            title="A terminal in this project wants your input"
            className="inline-block w-1.5 h-1.5 rounded-full bg-sky-400 flex-shrink-0 animate-pulse"
          />
        )}

        {project.terminals.length > 0 && (
          <span className="text-[10px] tabular-nums px-1.5 py-0.5 rounded-md bg-foreground/10 text-foreground/70">
            {project.terminals.length}
          </span>
        )}

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            void handleNewTerminal()
          }}
          aria-label="New terminal in this project"
          title="New terminal"
          className="opacity-0 group-hover/proj:opacity-100 transition-opacity text-foreground/55 hover:text-foreground hover:bg-foreground/10 rounded-md h-6 w-6 inline-flex items-center justify-center text-base leading-none"
        >
          +
        </button>

        <Dropdown>
          <Dropdown.Trigger>
            <Button
              isIconOnly
              size="sm"
              variant="ghost"
              aria-label="Project actions"
              className="opacity-0 group-hover/proj:opacity-100 transition-opacity h-6 w-6 min-w-6 text-foreground/55"
              onPress={() => {}}
            >
              ⋯
            </Button>
          </Dropdown.Trigger>
          <Dropdown.Popover>
            <Dropdown.Menu onAction={handleAction}>
              <Dropdown.Item id={ACTIONS.newTerminal} textValue="New terminal">
                <Label>New terminal</Label>
              </Dropdown.Item>
              <Dropdown.Item id={ACTIONS.rename} textValue="Rename">
                <Label>Rename</Label>
              </Dropdown.Item>
              <Dropdown.Item id={ACTIONS.finder} textValue={`Open in ${FILE_MANAGER_APP}`}>
                <Label>Open in {FILE_MANAGER_APP}</Label>
              </Dropdown.Item>
              <Dropdown.Item id={ACTIONS.iterm} textValue={`Open in ${TERMINAL_APP}`}>
                <Label>Open in {TERMINAL_APP}</Label>
              </Dropdown.Item>
              <Dropdown.Item id={ACTIONS.remove} textValue="Remove" variant="danger">
                <Label>Remove</Label>
              </Dropdown.Item>
            </Dropdown.Menu>
          </Dropdown.Popover>
        </Dropdown>
      </div>

      {expanded && (
        <div className="ml-3 mt-0.5 mb-1 pl-2 border-l border-accent/14 flex flex-col gap-0.5">
          {project.terminals.map((t) => (
            <TerminalSidebarItem
              key={t.id}
              terminal={t}
              active={selected && t.id === activeId}
              unread={(unreadByTerminal[t.id] ?? 0) > 0}
              busy={!!busyByTerminal[t.id]}
              autoTitle={titleByTerminal[t.id]}
              onSelect={() => {
                if (!selected) onSelect()
                setActive(t.id)
              }}
              onClose={() => void close(t.id)}
              onRename={(name) => void renameTerminal(t.id, name)}
            />
          ))}
          <button
            type="button"
            onClick={() => void handleNewTerminal()}
            className="flex items-center gap-2 pl-2 pr-1.5 py-1 rounded-md text-[11px] text-foreground/45 hover:text-foreground/85 hover:bg-foreground/5 transition-colors"
          >
            <span className="w-1 h-3 inline-block" aria-hidden />
            + New terminal
          </button>
        </div>
      )}
    </div>
  )
}
