import { useCallback, useEffect, useState } from 'react'
import type { FsEntry, Project } from '@shared/types'
import { useWorkspace } from '@renderer/state/store'
import { FileIcon } from './file-icon'

interface Props {
  project: Project
}

type ChildrenMap = Record<string, FsEntry[] | undefined>

export function FileTree({ project }: Props) {
  const openFile = useWorkspace((s) => s.openFile)
  const activeFilePath = useWorkspace(
    (s) => s.activeFileByProject[project.id] ?? null
  )

  const [rootEntries, setRootEntries] = useState<FsEntry[]>([])
  const [children, setChildren] = useState<ChildrenMap>({})
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [loading, setLoading] = useState(true)
  const [menu, setMenu] = useState<MenuState | null>(null)
  const [creatingAt, setCreatingAt] = useState<{
    parent: string
    kind: 'file' | 'folder'
  } | null>(null)
  const [renaming, setRenaming] = useState<string | null>(null)

  const reloadRoot = useCallback(async () => {
    setLoading(true)
    const list = await window.api.fs.list(project.id, '')
    setRootEntries(list)
    setLoading(false)
  }, [project.id])

  const reloadFolder = useCallback(
    async (relPath: string) => {
      if (relPath === '') {
        await reloadRoot()
        return
      }
      const list = await window.api.fs.list(project.id, relPath)
      setChildren((c) => ({ ...c, [relPath]: list }))
    },
    [project.id, reloadRoot]
  )

  // reset & load when project changes
  useEffect(() => {
    setChildren({})
    setExpanded({})
    setMenu(null)
    setCreatingAt(null)
    setRenaming(null)
    void reloadRoot()
  }, [project.id, reloadRoot])

  const toggle = useCallback(
    async (entry: FsEntry) => {
      if (!entry.isDirectory) return
      const isOpen = !!expanded[entry.path]
      setExpanded((e) => ({ ...e, [entry.path]: !isOpen }))
      if (!isOpen && !children[entry.path]) {
        const list = await window.api.fs.list(project.id, entry.path)
        setChildren((c) => ({ ...c, [entry.path]: list }))
      }
    },
    [expanded, children, project.id]
  )

  const handleAction = useCallback(
    async (target: FsEntry | null, action: ActionKey) => {
      setMenu(null)
      if (action === 'new-file' || action === 'new-folder') {
        const parent = target && target.isDirectory ? target.path : ''
        if (target && target.isDirectory && !expanded[target.path]) {
          await toggle(target)
        }
        setCreatingAt({ parent, kind: action === 'new-file' ? 'file' : 'folder' })
        return
      }
      if (!target) return
      if (action === 'reveal') {
        await window.api.fs.reveal(project.id, target.path)
        return
      }
      if (action === 'open') {
        openFile({ projectId: project.id, path: target.path })
        return
      }
      if (action === 'open-externally') {
        await window.api.fs.open(project.id, target.path)
        return
      }
      if (action === 'rename') {
        setRenaming(target.path)
        return
      }
      if (action === 'delete') {
        const ok = window.confirm(`Move "${target.name}" to Trash?`)
        if (!ok) return
        await window.api.fs.remove(project.id, target.path)
        const parent = parentOf(target.path)
        await reloadFolder(parent)
        return
      }
    },
    [expanded, toggle, project.id, reloadFolder, openFile]
  )

  const submitCreate = useCallback(
    async (name: string) => {
      if (!creatingAt) return
      const trimmed = name.trim()
      if (!trimmed) {
        setCreatingAt(null)
        return
      }
      const rel = creatingAt.parent ? `${creatingAt.parent}/${trimmed}` : trimmed
      if (creatingAt.kind === 'file') {
        await window.api.fs.createFile(project.id, rel)
      } else {
        await window.api.fs.createFolder(project.id, rel)
      }
      await reloadFolder(creatingAt.parent)
      setCreatingAt(null)
    },
    [creatingAt, project.id, reloadFolder]
  )

  const submitRename = useCallback(
    async (oldPath: string, newName: string) => {
      const trimmed = newName.trim()
      setRenaming(null)
      if (!trimmed) return
      const parent = parentOf(oldPath)
      const newPath = parent ? `${parent}/${trimmed}` : trimmed
      if (newPath === oldPath) return
      const ok = await window.api.fs.rename(project.id, oldPath, newPath)
      if (ok) {
        await reloadFolder(parent)
        setExpanded((e) => {
          const next = { ...e }
          if (next[oldPath] !== undefined) {
            next[newPath] = next[oldPath]!
            delete next[oldPath]
          }
          return next
        })
      }
    },
    [project.id, reloadFolder]
  )

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-1 px-2 py-1.5 border-b border-accent/7">
        <span className="text-[11px] text-foreground/50 truncate flex-1" title={project.path}>
          {project.path.split('/').slice(-2).join('/')}
        </span>
        <ToolbarButton
          title="New file"
          onClick={() => setCreatingAt({ parent: '', kind: 'file' })}
        >
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="12" y1="18" x2="12" y2="12" />
            <line x1="9" y1="15" x2="15" y2="15" />
          </svg>
        </ToolbarButton>
        <ToolbarButton
          title="New folder"
          onClick={() => setCreatingAt({ parent: '', kind: 'folder' })}
        >
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
            <line x1="12" y1="11" x2="12" y2="17" />
            <line x1="9" y1="14" x2="15" y2="14" />
          </svg>
        </ToolbarButton>
        <ToolbarButton title="Refresh" onClick={() => void reloadRoot()}>
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="23 4 23 10 17 10" />
            <polyline points="1 20 1 14 7 14" />
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
          </svg>
        </ToolbarButton>
      </div>

      <div
        className="flex-1 min-h-0 overflow-y-auto py-1 text-[13px]"
        onContextMenu={(e) => {
          e.preventDefault()
          setMenu({ x: e.clientX, y: e.clientY, target: null })
        }}
        onClick={() => setMenu(null)}
      >
        {loading && rootEntries.length === 0 ? (
          <div className="text-[11px] text-foreground/40 px-3 py-2">Loading…</div>
        ) : null}

        {creatingAt && creatingAt.parent === '' && (
          <CreateInput
            depth={0}
            kind={creatingAt.kind}
            onSubmit={submitCreate}
            onCancel={() => setCreatingAt(null)}
          />
        )}

        {rootEntries.map((entry) => (
          <TreeRow
            key={entry.path}
            entry={entry}
            depth={0}
            expanded={expanded}
            children_={children}
            renaming={renaming}
            creatingAt={creatingAt}
            onToggle={toggle}
            onOpen={(e) => {
              if (e.isDirectory) void toggle(e)
              else openFile({ projectId: project.id, path: e.path })
            }}
            activePath={activeFilePath}
            onContextMenu={(e, ev) => {
              ev.preventDefault()
              ev.stopPropagation()
              setMenu({ x: ev.clientX, y: ev.clientY, target: e })
            }}
            onSubmitRename={submitRename}
            onSubmitCreate={submitCreate}
            onCancelCreate={() => setCreatingAt(null)}
            onCancelRename={() => setRenaming(null)}
          />
        ))}

        {!loading && rootEntries.length === 0 && (
          <div className="text-[11px] text-foreground/40 px-3 py-4 text-center">
            Empty folder.
          </div>
        )}
      </div>

      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          target={menu.target}
          onClose={() => setMenu(null)}
          onAction={(action) => void handleAction(menu.target, action)}
        />
      )}
    </div>
  )
}

function ToolbarButton({
  title,
  onClick,
  children,
}: {
  title: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className="flex items-center justify-center w-6 h-6 rounded-md text-foreground/55 hover:text-foreground hover:bg-foreground/10 transition-colors"
    >
      {children}
    </button>
  )
}

interface TreeRowProps {
  entry: FsEntry
  depth: number
  expanded: Record<string, boolean>
  children_: ChildrenMap
  renaming: string | null
  creatingAt: { parent: string; kind: 'file' | 'folder' } | null
  activePath: string | null
  onToggle: (entry: FsEntry) => void
  onOpen: (entry: FsEntry) => void
  onContextMenu: (entry: FsEntry, ev: React.MouseEvent) => void
  onSubmitRename: (oldPath: string, newName: string) => void
  onSubmitCreate: (name: string) => void
  onCancelCreate: () => void
  onCancelRename: () => void
}

function TreeRow({
  entry,
  depth,
  expanded,
  children_,
  renaming,
  creatingAt,
  activePath,
  onToggle,
  onOpen,
  onContextMenu,
  onSubmitRename,
  onSubmitCreate,
  onCancelCreate,
  onCancelRename,
}: TreeRowProps) {
  const isOpen = !!expanded[entry.path]
  const kids = children_[entry.path]
  const isActive = !entry.isDirectory && activePath === entry.path

  return (
    <div>
      {renaming === entry.path ? (
        <RenameInput
          depth={depth}
          initialName={entry.name}
          onSubmit={(name) => onSubmitRename(entry.path, name)}
          onCancel={onCancelRename}
        />
      ) : (
        <button
          type="button"
          onClick={() => onOpen(entry)}
          onContextMenu={(ev) => onContextMenu(entry, ev)}
          title={entry.ignored ? `${entry.name} — ignored by git` : entry.name}
          className={[
            'group/row flex items-center w-full pr-2 py-[3px] text-left',
            isActive ? 'bg-foreground/10' : 'hover:bg-foreground/5',
          ].join(' ')}
          style={{ paddingLeft: 8 + depth * 12 }}
        >
          <span
            onClick={(ev) => {
              if (entry.isDirectory) {
                ev.stopPropagation()
                onToggle(entry)
              }
            }}
            className={[
              'inline-flex items-center justify-center w-3 h-3 mr-1 text-[8px] text-foreground/45 transition-transform',
              entry.isDirectory ? '' : 'opacity-0',
              isOpen ? 'rotate-90' : '',
            ].join(' ')}
            aria-hidden
          >
            ▶
          </span>
          <FileIcon
            name={entry.name}
            isDirectory={entry.isDirectory}
            isOpen={isOpen}
            className={['mr-1.5', entry.ignored ? 'opacity-45' : ''].join(' ')}
          />
          <span
            className={[
              'truncate',
              entry.ignored
                ? 'text-foreground/40 group-hover/row:text-foreground/60'
                : isActive
                  ? 'text-foreground'
                  : 'text-foreground/85 group-hover/row:text-foreground',
            ].join(' ')}
          >
            {entry.name}
          </span>
        </button>
      )}

      {entry.isDirectory && isOpen && (
        <>
          {creatingAt && creatingAt.parent === entry.path && (
            <CreateInput
              depth={depth + 1}
              kind={creatingAt.kind}
              onSubmit={onSubmitCreate}
              onCancel={onCancelCreate}
            />
          )}
          {kids === undefined ? (
            <div
              className="text-[11px] text-foreground/35 py-0.5"
              style={{ paddingLeft: 8 + (depth + 1) * 12 + 16 }}
            >
              Loading…
            </div>
          ) : (
            kids.map((child) => (
              <TreeRow
                key={child.path}
                entry={child}
                depth={depth + 1}
                expanded={expanded}
                children_={children_}
                renaming={renaming}
                creatingAt={creatingAt}
                activePath={activePath}
                onToggle={onToggle}
                onOpen={onOpen}
                onContextMenu={onContextMenu}
                onSubmitRename={onSubmitRename}
                onSubmitCreate={onSubmitCreate}
                onCancelCreate={onCancelCreate}
                onCancelRename={onCancelRename}
              />
            ))
          )}
        </>
      )}
    </div>
  )
}

function CreateInput({
  depth,
  kind,
  onSubmit,
  onCancel,
}: {
  depth: number
  kind: 'file' | 'folder'
  onSubmit: (name: string) => void
  onCancel: () => void
}) {
  const [value, setValue] = useState('')
  return (
    <div
      className="flex items-center py-[3px]"
      style={{ paddingLeft: 8 + depth * 12 + 16 }}
    >
      <FileIcon
        name={kind === 'folder' ? 'new' : 'new.txt'}
        isDirectory={kind === 'folder'}
        className="mr-1.5"
      />
      <input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={kind === 'folder' ? 'folder-name' : 'file.txt'}
        onBlur={() => onSubmit(value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onSubmit(value)
          if (e.key === 'Escape') onCancel()
        }}
        className="flex-1 bg-transparent outline-none text-[13px] border-b border-foreground/30 focus:border-foreground"
      />
    </div>
  )
}

function RenameInput({
  depth,
  initialName,
  onSubmit,
  onCancel,
}: {
  depth: number
  initialName: string
  onSubmit: (name: string) => void
  onCancel: () => void
}) {
  const [value, setValue] = useState(initialName)
  return (
    <div
      className="flex items-center py-[3px]"
      style={{ paddingLeft: 8 + depth * 12 + 16 }}
    >
      <input
        autoFocus
        value={value}
        onFocus={(e) => {
          const dot = initialName.lastIndexOf('.')
          if (dot > 0) e.currentTarget.setSelectionRange(0, dot)
          else e.currentTarget.select()
        }}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => onSubmit(value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onSubmit(value)
          if (e.key === 'Escape') onCancel()
        }}
        className="flex-1 bg-transparent outline-none text-[13px] border-b border-foreground/30 focus:border-foreground"
      />
    </div>
  )
}

type ActionKey =
  | 'new-file'
  | 'new-folder'
  | 'rename'
  | 'delete'
  | 'reveal'
  | 'open'
  | 'open-externally'
interface MenuState {
  x: number
  y: number
  target: FsEntry | null
}

function ContextMenu({
  x,
  y,
  target,
  onClose,
  onAction,
}: {
  x: number
  y: number
  target: FsEntry | null
  onClose: () => void
  onAction: (a: ActionKey) => void
}) {
  useEffect(() => {
    const handler = () => onClose()
    window.addEventListener('click', handler)
    window.addEventListener('blur', handler)
    return () => {
      window.removeEventListener('click', handler)
      window.removeEventListener('blur', handler)
    }
  }, [onClose])

  return (
    <div
      role="menu"
      className="fixed z-50 min-w-44 rounded-lg border border-foreground/15 bg-background/95 backdrop-blur shadow-xl py-1 text-[13px]"
      style={{ top: y, left: x }}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      {target && !target.isDirectory && (
        <>
          <MenuItem onClick={() => onAction('open')}>Open</MenuItem>
          <MenuItem onClick={() => onAction('open-externally')}>Open externally</MenuItem>
          <MenuDivider />
        </>
      )}
      <MenuItem onClick={() => onAction('new-file')}>New file</MenuItem>
      <MenuItem onClick={() => onAction('new-folder')}>New folder</MenuItem>
      {target && <MenuDivider />}
      {target && <MenuItem onClick={() => onAction('rename')}>Rename</MenuItem>}
      {target && (
        <MenuItem onClick={() => onAction('delete')} danger>
          Move to Trash
        </MenuItem>
      )}
      {target && <MenuDivider />}
      {target && (
        <MenuItem onClick={() => onAction('reveal')}>Reveal in Finder</MenuItem>
      )}
    </div>
  )
}

function MenuItem({
  onClick,
  children,
  danger,
}: {
  onClick: () => void
  children: React.ReactNode
  danger?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'flex items-center w-full px-3 py-1.5 text-left transition-colors',
        danger
          ? 'text-red-400 hover:bg-red-500/15'
          : 'text-foreground/85 hover:bg-foreground/10',
      ].join(' ')}
    >
      {children}
    </button>
  )
}

function MenuDivider() {
  return <div className="my-1 mx-2 h-px bg-foreground/10" />
}

function parentOf(p: string): string {
  const i = p.lastIndexOf('/')
  return i < 0 ? '' : p.slice(0, i)
}
