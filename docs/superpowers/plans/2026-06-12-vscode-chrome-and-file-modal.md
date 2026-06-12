# VS Code Chrome + File Modal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give wTerm the VS Code agent-window look — left activity bar + project sidebar, terminals as central tabs, right Files/Git/GitHub panel, a bottom status bar, and files opening in a centered, resizable, titled modal over a dim backdrop.

**Architecture:** Pure renderer change. New chrome components (`LeftActivityBar`, `StatusBar`, `TerminalTabs`, `FileModal`) assembled by a restructured `app.tsx`; the file side-pane is replaced by a modal hosting the existing `FileTabs` + `FileViewer`. Store gains a `fileModalOpen` flag (set by the existing `openFile` choke point) and persisted modal size.

**Tech Stack:** React 19, Zustand, Tailwind v4, electron-vite. No new dependencies.

**Testing note:** No unit-test runner in this repo. Automated gate per task is `npm run typecheck`; behavior is verified manually via `npm run dev`.

---

## File Structure

| File | Responsibility | Change |
|------|----------------|--------|
| `state/store.ts` | Workspace state | Add `fileModalOpen` + `openFileModal`/`closeFileModal`, persisted `fileModalWidth/Height`; `openFile` sets modal open |
| `components/workspace/file-modal.tsx` | Centered titled modal hosting the editor | Create |
| `components/left-activity-bar.tsx` | Far-left VS Code activity bar | Create |
| `components/status-bar.tsx` | Bottom status bar | Create |
| `components/workspace/terminal-tabs.tsx` | Top tab strip of the project's terminals | Create |
| `app.tsx` | Layout assembly | Restructure: add chrome, mount modal, drop the file side-pane |

---

## Task 1: Store — file-modal state + size, opened by `openFile`

**Files:** Modify `src/renderer/src/state/store.ts`

- [ ] **Step 1: Add the modal-size localStorage key + reader** near the other keys (after `FILE_PANE_WIDTH_KEY`, store.ts:22):

```typescript
const FILE_MODAL_SIZE_KEY = 'tw:file-modal-size'

const readInitialFileModalSize = (): { width: number; height: number } => {
  try {
    const raw = localStorage.getItem(FILE_MODAL_SIZE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as { width: number; height: number }
      if (parsed?.width && parsed?.height) return parsed
    }
  } catch {
    // ignore
  }
  return { width: 900, height: 600 }
}
```

- [ ] **Step 2: Declare state + actions in the `WorkspaceState` interface** (near `openFile`, store.ts:137):

```typescript
  fileModalOpen: boolean
  fileModalWidth: number
  fileModalHeight: number
  openFileModal: () => void
  closeFileModal: () => void
  setFileModalSize: (width: number, height: number) => void
```

- [ ] **Step 3: Initialize state + implement actions** in the store object (near `openFiles: []`, store.ts:239):

```typescript
  fileModalOpen: false,
  fileModalWidth: readInitialFileModalSize().width,
  fileModalHeight: readInitialFileModalSize().height,
  openFileModal: () => set({ fileModalOpen: true }),
  closeFileModal: () => set({ fileModalOpen: false }),
  setFileModalSize: (width, height) => {
    const w = Math.max(420, Math.min(width, window.innerWidth - 80))
    const h = Math.max(300, Math.min(height, window.innerHeight - 80))
    set({ fileModalWidth: w, fileModalHeight: h })
    try {
      localStorage.setItem(FILE_MODAL_SIZE_KEY, JSON.stringify({ width: w, height: h }))
    } catch {
      // ignore
    }
  },
```

- [ ] **Step 4: Make `openFile` open the modal** — add `fileModalOpen: true` to the object returned by `openFile` (store.ts:249-255):

```typescript
      return {
        openFiles: alreadyOpen ? state.openFiles : [...state.openFiles, file],
        activeFileByProject: { ...state.activeFileByProject, [file.projectId]: file.path },
        fileStates: alreadyOpen
          ? state.fileStates
          : { ...state.fileStates, [key]: { kind: 'loading' } },
        fileModalOpen: true,
      }
```

- [ ] **Step 5: Typecheck.** `npm run typecheck` → PASS.
- [ ] **Step 6: Commit.** `git add -A && git commit -m "feat(store): file-modal open state + persisted size"`

---

## Task 2: `FileModal` component

**Files:** Create `src/renderer/src/components/workspace/file-modal.tsx`

- [ ] **Step 1: Write the component** — centered, dim backdrop (click/Esc closes), titlebar with the active filename + close button, resizable from the bottom-right corner, hosting `FileTabs` + `FileViewer`:

```tsx
import { useCallback, useEffect, useRef } from 'react'
import { useWorkspace } from '@renderer/state/store'
import { FileTabs } from './file-tabs'
import { FileViewer } from './file-viewer'

interface Props {
  projectId: string
}

export function FileModal({ projectId }: Props) {
  const open = useWorkspace((s) => s.fileModalOpen)
  const close = useWorkspace((s) => s.closeFileModal)
  const width = useWorkspace((s) => s.fileModalWidth)
  const height = useWorkspace((s) => s.fileModalHeight)
  const setSize = useWorkspace((s) => s.setFileModalSize)
  const activeFileByProject = useWorkspace((s) => s.activeFileByProject)
  const activePath = activeFileByProject[projectId] ?? null
  const filename = activePath ? activePath.split('/').pop() ?? activePath : 'Untitled'

  const dragRef = useRef<{ x: number; y: number; w: number; h: number } | null>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault()
        close()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, close])

  const onResizeDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault()
      e.stopPropagation()
      dragRef.current = { x: e.clientX, y: e.clientY, w: width, h: height }
      e.currentTarget.setPointerCapture(e.pointerId)
    },
    [width, height]
  )
  const onResizeMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const d = dragRef.current
      if (!d) return
      setSize(d.w + (e.clientX - d.x) * 2, d.h + (e.clientY - d.y) * 2)
    },
    [setSize]
  )
  const onResizeUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return
    dragRef.current = null
    e.currentTarget.releasePointerCapture(e.pointerId)
  }, [])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-[1px]"
      onClick={close}
    >
      <div
        className="relative flex flex-col rounded-lg border border-accent/20 bg-surface shadow-2xl overflow-hidden"
        style={{ width, height, maxWidth: '94vw', maxHeight: '92vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 h-9 px-3 border-b border-accent/14 bg-surface/80 flex-shrink-0">
          <span className="text-[12px] text-foreground/85 font-medium truncate flex-1">{filename}</span>
          <button
            type="button"
            onClick={close}
            aria-label="Close file"
            title="Close (Esc)"
            className="flex items-center justify-center w-6 h-6 rounded-md text-foreground/55 hover:text-foreground hover:bg-foreground/10 transition-colors"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden>
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div className="h-9 border-b border-accent/14 flex-shrink-0">
          <FileTabs projectId={projectId} />
        </div>
        <div className="flex-1 min-h-0">
          <FileViewer projectId={projectId} />
        </div>
        <div
          onPointerDown={onResizeDown}
          onPointerMove={onResizeMove}
          onPointerUp={onResizeUp}
          onPointerCancel={onResizeUp}
          role="separator"
          aria-label="Resize file window"
          className="absolute bottom-0 right-0 w-4 h-4 cursor-nwse-resize"
          style={{ touchAction: 'none' }}
        />
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Typecheck.** `npm run typecheck` → PASS.
- [ ] **Step 3: Commit.** `git add -A && git commit -m "feat(workspace): centered resizable titled FileModal"`

---

## Task 3: `LeftActivityBar` component

**Files:** Create `src/renderer/src/components/left-activity-bar.tsx`

- [ ] **Step 1: Write the component** — mirrors `RightActivityBar`'s `ActivityButton` styling; Explorer toggles the project sidebar, Settings opens settings:

```tsx
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
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
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
```

- [ ] **Step 2: Typecheck + Commit.** `npm run typecheck` → PASS; `git add -A && git commit -m "feat(chrome): left activity bar"`

---

## Task 4: `StatusBar` component

**Files:** Create `src/renderer/src/components/status-bar.tsx`

- [ ] **Step 1: Write the component** — shows git branch for the selected project, terminal count, and app version:

```tsx
import { useEffect, useState } from 'react'
import type { Project } from '@shared/types'

interface Props {
  project: Project | null
}

export function StatusBar({ project }: Props) {
  const [branch, setBranch] = useState<string | null>(null)
  const [version, setVersion] = useState<string>('')

  useEffect(() => {
    window.api.system.getVersion().then(setVersion).catch(() => {})
  }, [])

  useEffect(() => {
    let cancelled = false
    if (!project) {
      setBranch(null)
      return
    }
    window.api.git
      .info(project.id)
      .then((info) => {
        if (!cancelled) setBranch(info.isRepo ? info.branch : null)
      })
      .catch(() => {
        if (!cancelled) setBranch(null)
      })
    return () => {
      cancelled = true
    }
  }, [project])

  const termCount = project?.terminals.length ?? 0

  return (
    <footer className="flex items-center gap-3 h-6 px-3 text-[11px] text-foreground/60 border-t border-accent/14 bg-surface/60 flex-shrink-0 select-none">
      {branch && (
        <span className="flex items-center gap-1" title="Current branch">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <line x1="6" y1="3" x2="6" y2="15" /><circle cx="18" cy="6" r="3" /><circle cx="6" cy="18" r="3" /><path d="M18 9a9 9 0 0 1-9 9" />
          </svg>
          {branch}
        </span>
      )}
      {project && (
        <span title="Open terminals">{termCount} {termCount === 1 ? 'terminal' : 'terminals'}</span>
      )}
      <span className="flex-1" />
      {version && <span className="text-foreground/40">v{version}</span>}
    </footer>
  )
}
```

- [ ] **Step 2: Typecheck + Commit.** `npm run typecheck` → PASS; `git add -A && git commit -m "feat(chrome): bottom status bar"`

---

## Task 5: `TerminalTabs` component

**Files:** Create `src/renderer/src/components/workspace/terminal-tabs.tsx`

- [ ] **Step 1: Write the component** — VS Code-style top tab strip of the selected project's terminals; click activates, × closes (mirrors `FileTabs` interactions, reusing existing store actions):

```tsx
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
    <div className="flex items-stretch h-9 min-w-0 overflow-x-auto border-b border-accent/14 bg-surface/40">
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
              'group/tt relative flex items-center gap-1.5 pl-3 pr-2 text-[12px] cursor-pointer border-r border-accent/14 transition-colors min-w-0 flex-shrink-0',
              isActive ? 'bg-background text-foreground' : 'text-foreground/65 hover:bg-foreground/5 hover:text-foreground',
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
            {isActive && <span aria-hidden className="absolute bottom-0 left-0 right-0 h-px bg-foreground" />}
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
```

- [ ] **Step 2: Typecheck + Commit.** `npm run typecheck` → PASS; `git add -A && git commit -m "feat(workspace): terminal tab strip"`

---

## Task 6: Restructure `app.tsx`

**Files:** Modify `src/renderer/src/app.tsx`

- [ ] **Step 1: Swap imports** — drop `FileViewer` + `FileTabs` direct use in the main area, add the new chrome:

```tsx
import { ProjectList } from './components/sidebar/project-list'
import { RightSidebar } from './components/right-sidebar/right-sidebar'
import { RightActivityBar } from './components/right-activity-bar'
import { LeftActivityBar } from './components/left-activity-bar'
import { StatusBar } from './components/status-bar'
import { TerminalPane } from './components/workspace/terminal-pane'
import { TerminalTabs } from './components/workspace/terminal-tabs'
import { EmptyState } from './components/workspace/empty-state'
import { FileModal } from './components/workspace/file-modal'
import { SettingsModal } from './components/settings-modal'
import { UpdateBanner } from './components/update-banner'
```

- [ ] **Step 2: Replace the returned layout** (app.tsx:194-309) with the new structure: left activity bar · project sidebar · main (centered title + terminal tabs + center terminal area) · right sidebar · right activity bar; status bar across the bottom; `FileModal` overlay. Remove the file side-pane + its resizer and the `onResizer*` handlers/`dragRef`/`filePaneWidth` usage in this file:

```tsx
  return (
    <div className="flex flex-col h-screen w-screen bg-surface text-foreground">
      <div className="flex flex-1 min-h-0">
        <LeftActivityBar onOpenSettings={() => setSettingsOpen(true)} />
        {!sidebarCollapsed && <ProjectList />}
        <main className="flex-1 flex flex-col min-w-0">
          <header className={`app-titlebar h-11 flex items-center px-4 border-b border-accent/14 ${titlebarRightGutter}`}>
            <span className="flex-1" />
            <span className="text-[12px] text-foreground/70 truncate text-center">
              {selectedProject
                ? `${selectedProject.name}${activeTerminal ? ` — ${titleByTerminal[activeTerminal.id] || activeTerminal.name}` : ''} · wTerm`
                : 'wTerm'}
            </span>
            <span className="flex-1" />
          </header>

          {selectedProject && selectedProject.terminals.length > 0 && (
            <TerminalTabs project={selectedProject} />
          )}

          <div className="@container relative flex-1 min-w-0 overflow-hidden">
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
                  void createProjectTerminal(selectedProject.id)
                }}
              />
            )}
          </div>
        </main>
        {selectedProject && !rightSidebarCollapsed && <RightSidebar project={selectedProject} />}
        <RightActivityBar onOpenSettings={() => setSettingsOpen(true)} panelDisabled={!selectedProject} />
      </div>
      <StatusBar project={selectedProject} />
      {selectedProject && <FileModal projectId={selectedProject.id} />}
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <UpdateBanner />
    </div>
  )
```

- [ ] **Step 3: Remove now-dead code** in app.tsx: the `onResizerPointerDown/Move/Up` callbacks, `dragRef`, and the `filePaneWidth`/`setFilePaneWidth`/`hasOpenFiles` selectors if unused after the rewrite. (Keep `openFiles`-derived logic only if still referenced.) Verify with typecheck which names are unused.

- [ ] **Step 4: Typecheck.** `npm run typecheck` → PASS (fix any unused-variable / missing-import errors it reports).

- [ ] **Step 5: Commit.** `git add -A && git commit -m "feat(layout): VS Code chrome — activity bars, terminal tabs, status bar, file modal"`

---

## Task 7: Verify end-to-end

**Files:** none

- [ ] **Step 1: Typecheck whole project.** `npm run typecheck` → PASS.
- [ ] **Step 2: Build.** `npm run build` → completes with no errors.
- [ ] **Step 3: Manual (`npm run dev`):**
  - Left activity bar toggles the project sidebar and opens settings.
  - Terminal tabs across the top switch terminals; `+` adds one; × closes; busy/unread show.
  - Opening a file from the right Files tree → **centered modal, dim backdrop**; resize from the corner (persists on reopen); file tabs inside; ⌘S saves; Esc/backdrop closes; terminal visible again.
  - Status bar shows git branch + terminal count + version.

---

## Self-Review Notes

- **Spec coverage:** left activity bar (T3), project sidebar (kept), terminals-as-central-tabs (T5), right sidebar + activity bar (kept), status bar (T4), centered top-bar title (T6), file titled-modal w/ dim backdrop + resize + persisted size (T1/T2), side-pane removed (T6). All present.
- **Type consistency:** `openFileModal`/`closeFileModal`/`setFileModalSize`/`fileModalOpen`/`fileModalWidth`/`fileModalHeight` used identically across T1/T2. `createProjectTerminal`, `setActiveTerminal`, `removeTerminalLocal`, `git.info`, `system.getVersion` all match existing store/preload signatures.
- **Out of scope (unchanged):** split editors, draggable modal, tab drag-reorder, bottom terminal panel, editor restyling.
