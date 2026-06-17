# Advanced File Explorer & Editor (Monaco) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the CodeMirror file editor with Monaco, add three switchable editor view modes (docked / modal / fullscreen) sharing one tab strip, color the file tree by git status, and add file-tree keyboard shortcuts — making wTerm's file experience feel like VS Code.

**Architecture:** Monaco is bundled locally (offline, no CDN) behind a thin React wrapper that owns a model-per-file registry so undo history and scroll survive file/mode switches. A single `EditorShell` (chrome + `FileTabs` + `FileViewer`) is hosted by three mode wrappers selected from `editorViewMode` in the Zustand store. A new `git:file-status` IPC feeds tree row colors. The file tree gains a roving-focus keyboard model.

**Tech Stack:** Electron + electron-vite, React 18, Zustand, TypeScript, `monaco-editor`, Vitest (new, for pure-logic units only), Tailwind.

**Verification note:** This repo has **no test runner today** and verifies via `npm run typecheck` + manual app runs. This plan adds a minimal Vitest setup used **only** for pure functions (git porcelain parser, filename→language). All React/Monaco/IPC glue is verified with `npm run typecheck` and explicit manual steps (`npm run dev`).

---

## File Structure

**Created:**
- `vitest.config.ts` — minimal Vitest config (node env, pure-logic tests only).
- `src/main/git/parse-status.ts` — pure `parsePorcelainStatus()` parser.
- `src/main/git/parse-status.test.ts` — unit tests for the parser.
- `src/renderer/src/lib/monaco-language.ts` — `languageForFilename()` + its test.
- `src/renderer/src/lib/monaco-language.test.ts`
- `src/renderer/src/lib/monaco-setup.ts` — worker env + theme definitions + `loadMonaco()`.
- `src/renderer/src/components/workspace/monaco-editor.tsx` — Monaco React wrapper (replaces `code-editor.tsx`).
- `src/renderer/src/components/workspace/editor-shell.tsx` — chrome + tabs + viewer.
- `src/renderer/src/components/workspace/editor-chrome.tsx` — title + mode-switch + close icons.
- `src/renderer/src/components/workspace/editor-surface.tsx` — picks mode wrapper from `editorViewMode`.
- `src/renderer/src/components/workspace/docked-editor.tsx` — vertical split host.

**Modified:**
- `src/shared/types.ts` — add `GitFileStatus`, `GitFileStatusMap`, `IPC.git.fileStatus`.
- `src/main/git/local.ts` — add `getFileStatus(cwd)`.
- `src/main/ipc/git.ts` — register the new handler.
- `src/preload/index.ts` — expose `window.api.git.fileStatus`.
- `src/renderer/src/state/store.ts` — `editorViewMode`, `dockSplitRatio`, tab reorder; drop `fileModalOpen`.
- `src/renderer/src/state/settings.ts` — add `minimap` option.
- `src/renderer/src/components/workspace/file-modal.tsx` — becomes the `modal` mode wrapper around `EditorShell`.
- `src/renderer/src/components/workspace/file-viewer.tsx` — use `MonacoEditor` instead of `CodeEditor`.
- `src/renderer/src/components/workspace/file-tabs.tsx` — ⌘1–9, drag-reorder.
- `src/renderer/src/components/right-sidebar/file-tree.tsx` — git colors + keyboard model.
- `src/renderer/src/styles/themes.css` — `--git-*` color variables.
- `src/renderer/src/app.tsx` — render `EditorSurface`; docked split; ⌘W routing.
- `package.json` — add `monaco-editor`, `vitest`; remove `@codemirror/*`, `@codemirror/theme-one-dark`.
- `electron.vite.config.ts` — ensure renderer worker output (`worker.format: 'es'`).

**Deleted (end of Phase B):**
- `src/renderer/src/components/workspace/code-editor.tsx`
- `src/renderer/src/lib/code-mirror-language.ts`
- `src/renderer/src/lib/codemirror-halcyon-theme.ts`

---

## Phase 0: Test harness (pure-logic only)

### Task 0: Add Vitest for pure functions

**Files:**
- Create: `vitest.config.ts`
- Modify: `package.json`

- [ ] **Step 1: Install Vitest**

Run: `npm install -D vitest`
Expected: `vitest` appears in devDependencies.

- [ ] **Step 2: Create `vitest.config.ts`**

```ts
import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@shared': resolve('src/shared'),
      '@renderer': resolve('src/renderer/src'),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
```

- [ ] **Step 3: Add test script to `package.json`**

In `"scripts"`, add: `"test": "vitest run",`

- [ ] **Step 4: Verify the runner starts**

Run: `npm test`
Expected: exits 0 with "No test files found" (no tests yet).

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json vitest.config.ts
git commit -m "test: add minimal vitest setup for pure-logic units"
```

---

## Phase C-data: Git file-status backend

(Built first because it is pure + testable and unblocks the tree colors. Phase letters refer to the spec; execution order is 0 → C-data → A → B → C-ui → D → E.)

### Task 1: Porcelain status parser (pure)

**Files:**
- Create: `src/main/git/parse-status.ts`
- Test: `src/main/git/parse-status.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import { parsePorcelainStatus } from './parse-status'

describe('parsePorcelainStatus', () => {
  it('returns empty map for empty input', () => {
    expect(parsePorcelainStatus('')).toEqual({})
  })

  it('maps modified, added, deleted, untracked, conflict', () => {
    // `git status --porcelain=v1 -z` uses NUL separators, no trailing newline.
    const z = [
      ' M src/a.ts',   // worktree modified
      'A  src/b.ts',   // staged add
      ' D src/c.ts',   // worktree delete
      '?? src/d.ts',   // untracked
      'UU src/e.ts',   // conflict
    ].join('\0') + '\0'
    expect(parsePorcelainStatus(z)).toEqual({
      'src/a.ts': 'modified',
      'src/b.ts': 'added',
      'src/c.ts': 'deleted',
      'src/d.ts': 'untracked',
      'src/e.ts': 'conflict',
    })
  })

  it('handles renames (R) by recording the new path as modified', () => {
    // rename entries are emitted as `R  new\0old\0`
    const z = 'R  new.ts\0old.ts\0'
    expect(parsePorcelainStatus(z)).toEqual({ 'new.ts': 'modified' })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/main/git/parse-status.test.ts`
Expected: FAIL — cannot find module `./parse-status`.

- [ ] **Step 3: Write the implementation**

```ts
import type { GitFileStatus, GitFileStatusMap } from '@shared/types'

/**
 * Parse the output of `git status --porcelain=v1 -z` into a relPath→status map.
 * The -z form is NUL-separated; rename entries are `XY new\0old\0` (two fields).
 */
export function parsePorcelainStatus(z: string): GitFileStatusMap {
  const out: GitFileStatusMap = {}
  const parts = z.split('\0')
  for (let i = 0; i < parts.length; i++) {
    const entry = parts[i]
    if (!entry) continue
    const x = entry[0]
    const y = entry[1]
    const path = entry.slice(3)
    if (!path) continue
    // Renames/copies consume the following NUL field (the old path).
    if (x === 'R' || x === 'C') {
      i++ // skip old path
      out[path] = 'modified'
      continue
    }
    out[path] = classify(x, y)
  }
  return out
}

function classify(x: string, y: string): GitFileStatus {
  if (x === '?' && y === '?') return 'untracked'
  if (x === 'U' || y === 'U' || (x === 'A' && y === 'A') || (x === 'D' && y === 'D')) {
    return 'conflict'
  }
  if (x === 'A') return 'added'
  if (x === 'D' || y === 'D') return 'deleted'
  return 'modified'
}
```

- [ ] **Step 4: Add the types to `src/shared/types.ts`**

Add near the git types:

```ts
export type GitFileStatus = 'modified' | 'added' | 'deleted' | 'untracked' | 'conflict'
export type GitFileStatusMap = Record<string, GitFileStatus>
```

And add to the `IPC.git` block:

```ts
  git: {
    info: 'git:info',
    push: 'git:push',
    fileStatus: 'git:file-status',
  },
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/main/git/parse-status.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add src/main/git/parse-status.ts src/main/git/parse-status.test.ts src/shared/types.ts
git commit -m "feat(git): porcelain status parser + types"
```

### Task 2: getFileStatus + IPC + preload

**Files:**
- Modify: `src/main/git/local.ts`
- Modify: `src/main/ipc/git.ts`
- Modify: `src/preload/index.ts`

- [ ] **Step 1: Add `getFileStatus` to `src/main/git/local.ts`**

At the end of the file (the `git()` helper and `RunResult` already exist at the top):

```ts
import type { GitFileStatusMap } from '@shared/types'
import { parsePorcelainStatus } from './parse-status'

export async function getFileStatus(cwd: string): Promise<GitFileStatusMap> {
  const res = await git(['status', '--porcelain=v1', '-z'], cwd)
  if (res.code !== 0) return {}
  return parsePorcelainStatus(res.stdout)
}
```

(Adjust the existing `import type { GitInfo }` line to also import `GitFileStatusMap`, or add the new import as shown.)

- [ ] **Step 2: Register the handler in `src/main/ipc/git.ts`**

Add inside `registerGitIpc()`:

```ts
import { getFileStatus, getGitInfo, pushCurrentBranch } from '../git/local'
import { IPC, type GitFileStatusMap, type GitInfo, type ProjectId } from '@shared/types'

  ipcMain.handle(
    IPC.git.fileStatus,
    async (_e, projectId: ProjectId): Promise<GitFileStatusMap> => {
      const project = getProject(projectId)
      if (!project) return {}
      return getFileStatus(project.path)
    }
  )
```

- [ ] **Step 3: Expose in `src/preload/index.ts`**

In the `git:` block of the exposed api, add:

```ts
    fileStatus: (projectId: ProjectId): Promise<GitFileStatusMap> =>
      ipcRenderer.invoke(IPC.git.fileStatus, projectId),
```

Add `GitFileStatusMap` to the type import from `@shared/types` in that file. If the renderer has an `api` type declaration (e.g. `src/preload/index.d.ts`), add the `fileStatus` signature there too.

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: passes (0 errors).

- [ ] **Step 5: Commit**

```bash
git add src/main/git/local.ts src/main/ipc/git.ts src/preload/index.ts src/preload/index.d.ts
git commit -m "feat(git): file-status IPC + preload binding"
```

---

## Phase A: Editor view modes + tab strip

### Task 3: Store — editorViewMode + dockSplitRatio + tab reorder

**Files:**
- Modify: `src/renderer/src/state/store.ts`

- [ ] **Step 1: Add persistence helpers and types near `readInitialFileModalSize` (store.ts ~line 18)**

```ts
const EDITOR_VIEW_MODE_KEY = 'tw:editor-view-mode'
const DOCK_SPLIT_KEY = 'tw:dock-split-ratio'

export type EditorViewMode = 'docked' | 'modal' | 'fullscreen'

const readEditorViewMode = (): EditorViewMode => {
  const raw = localStorage.getItem(EDITOR_VIEW_MODE_KEY)
  return raw === 'modal' || raw === 'fullscreen' || raw === 'docked' ? raw : 'docked'
}

const readDockSplitRatio = (): number => {
  const n = Number.parseFloat(localStorage.getItem(DOCK_SPLIT_KEY) ?? '')
  return Number.isFinite(n) && n > 0.15 && n < 0.85 ? n : 0.6
}
```

- [ ] **Step 2: Extend the store interface**

In the state interface (near `fileModalOpen: boolean`), replace `fileModalOpen`/`openFileModal`/`closeFileModal` with:

```ts
  editorViewMode: EditorViewMode
  setEditorViewMode: (m: EditorViewMode) => void
  dockSplitRatio: number          // fraction of main area given to the editor (top pane)
  setDockSplitRatio: (r: number) => void
  reorderFile: (projectId: string, from: number, to: number) => void
```

- [ ] **Step 3: Update the store implementation**

Replace the `fileModalOpen` initial value + `openFileModal`/`closeFileModal` with:

```ts
  editorViewMode: readEditorViewMode(),
  setEditorViewMode: (m) => {
    localStorage.setItem(EDITOR_VIEW_MODE_KEY, m)
    set({ editorViewMode: m })
  },
  dockSplitRatio: readDockSplitRatio(),
  setDockSplitRatio: (r) => {
    const clamped = Math.min(0.85, Math.max(0.15, r))
    localStorage.setItem(DOCK_SPLIT_KEY, String(clamped))
    set({ dockSplitRatio: clamped })
  },
  reorderFile: (projectId, from, to) =>
    set((state) => {
      const proj = state.openFiles.filter((f) => f.projectId === projectId)
      const others = state.openFiles.filter((f) => f.projectId !== projectId)
      if (from < 0 || to < 0 || from >= proj.length || to >= proj.length) return {}
      const next = [...proj]
      const [moved] = next.splice(from, 1)
      next.splice(to, 0, moved)
      return { openFiles: [...others, ...next] }
    }),
```

- [ ] **Step 4: Remove `fileModalOpen` writes from `openFile`/`closeFile`/reset**

In `openFile`, delete the `fileModalOpen: true` line. In `closeFile`, delete the `fileModalOpen: ...` line. In the reset action (~line 416) delete `fileModalOpen: false`. The editor surface now shows whenever the active project has open files (computed in `app.tsx`).

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: errors only in files still referencing `fileModalOpen` (file-modal.tsx) — fixed in Task 5. If other files break, fix references to use `editorViewMode`.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/state/store.ts
git commit -m "feat(editor): view-mode + dock-split + tab-reorder store state"
```

### Task 4: EditorChrome (mode-switch icons + close)

**Files:**
- Create: `src/renderer/src/components/workspace/editor-chrome.tsx`

- [ ] **Step 1: Implement**

```tsx
import { useWorkspace, type EditorViewMode } from '@renderer/state/store'

interface Props {
  filename: string
  onClose: () => void
}

const MODES: { mode: EditorViewMode; title: string; path: JSX.Element }[] = [
  {
    mode: 'docked',
    title: 'Dock (split with terminal)',
    path: <path d="M3 4h18v16H3z M3 13h18" />,
  },
  {
    mode: 'modal',
    title: 'Floating window',
    path: <path d="M5 6h14v12H5z" />,
  },
  {
    mode: 'fullscreen',
    title: 'Fullscreen',
    path: <path d="M4 9V4h5 M20 9V4h-5 M4 15v5h5 M20 15v5h-5" />,
  },
]

export function EditorChrome({ filename, onClose }: Props) {
  const viewMode = useWorkspace((s) => s.editorViewMode)
  const setViewMode = useWorkspace((s) => s.setEditorViewMode)
  return (
    <div className="flex items-center gap-2 h-9 px-3 border-b border-accent/14 bg-surface/80 flex-shrink-0">
      <span className="text-[12px] text-foreground/85 font-medium truncate flex-1">{filename}</span>
      {MODES.map(({ mode, title, path }) => (
        <button
          key={mode}
          type="button"
          title={title}
          aria-pressed={viewMode === mode}
          onClick={() => setViewMode(mode)}
          className={[
            'flex items-center justify-center w-6 h-6 rounded-md transition-colors',
            viewMode === mode
              ? 'bg-foreground/10 text-foreground'
              : 'text-foreground/55 hover:text-foreground hover:bg-foreground/10',
          ].join(' ')}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            {path}
          </svg>
        </button>
      ))}
      <button
        type="button"
        onClick={onClose}
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
  )
}
```

- [ ] **Step 2: Typecheck & commit**

Run: `npm run typecheck` (expect pass)

```bash
git add src/renderer/src/components/workspace/editor-chrome.tsx
git commit -m "feat(editor): mode-switch chrome header"
```

### Task 5: EditorShell + EditorSurface + mode wrappers

**Files:**
- Create: `src/renderer/src/components/workspace/editor-shell.tsx`
- Create: `src/renderer/src/components/workspace/editor-surface.tsx`
- Create: `src/renderer/src/components/workspace/docked-editor.tsx`
- Modify: `src/renderer/src/components/workspace/file-modal.tsx`

- [ ] **Step 1: EditorShell (chrome + tabs + viewer, mode-agnostic)**

```tsx
import { useWorkspace } from '@renderer/state/store'
import { EditorChrome } from './editor-chrome'
import { FileTabs } from './file-tabs'
import { FileViewer } from './file-viewer'

interface Props {
  projectId: string
  onClose: () => void
}

export function EditorShell({ projectId, onClose }: Props) {
  const activeFileByProject = useWorkspace((s) => s.activeFileByProject)
  const activePath = activeFileByProject[projectId] ?? null
  const filename = activePath ? activePath.split('/').pop() ?? activePath : 'Untitled'
  return (
    <div className="flex flex-col h-full w-full min-h-0 bg-surface overflow-hidden">
      <EditorChrome filename={filename} onClose={onClose} />
      <div className="h-9 border-b border-accent/14 flex-shrink-0">
        <FileTabs projectId={projectId} />
      </div>
      <div className="flex-1 min-h-0">
        <FileViewer projectId={projectId} />
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Rewrite `file-modal.tsx` as the `modal` wrapper around EditorShell**

Keep the existing resize logic and backdrop, but swap the inner content for `EditorShell`, drop the `fileModalOpen` gate (the surface decides), and make `onClose` close all files for the project. Replace the file body with:

```tsx
import { useCallback, useEffect, useRef } from 'react'
import { useWorkspace } from '@renderer/state/store'
import { EditorShell } from './editor-shell'

interface Props {
  projectId: string
  onClose: () => void
}

export function ModalEditor({ projectId, onClose }: Props) {
  const width = useWorkspace((s) => s.fileModalWidth)
  const height = useWorkspace((s) => s.fileModalHeight)
  const setSize = useWorkspace((s) => s.setFileModalSize)
  const dragRef = useRef<{ x: number; y: number; w: number; h: number } | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const onResizeDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault(); e.stopPropagation()
    dragRef.current = { x: e.clientX, y: e.clientY, w: width, h: height }
    e.currentTarget.setPointerCapture(e.pointerId)
  }, [width, height])
  const onResizeMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current; if (!d) return
    setSize(d.w + (e.clientX - d.x) * 2, d.h + (e.clientY - d.y) * 2)
  }, [setSize])
  const onResizeUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return
    dragRef.current = null
    e.currentTarget.releasePointerCapture(e.pointerId)
  }, [])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-[1px]" onClick={onClose}>
      <div
        className="relative flex flex-col rounded-lg border border-accent/20 shadow-2xl overflow-hidden"
        style={{ width, height, maxWidth: '94vw', maxHeight: '92vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        <EditorShell projectId={projectId} onClose={onClose} />
        <div
          onPointerDown={onResizeDown} onPointerMove={onResizeMove}
          onPointerUp={onResizeUp} onPointerCancel={onResizeUp}
          role="separator" aria-label="Resize file window"
          className="absolute bottom-0 right-0 w-4 h-4 cursor-nwse-resize"
          style={{ touchAction: 'none' }}
        />
      </div>
    </div>
  )
}
```

(Rename the file's export to `ModalEditor`; the old `FileModal`/`FileTabs`-in-header markup is now inside `EditorShell`.)

- [ ] **Step 3: DockedEditor (vertical split host)**

```tsx
import { useCallback, useRef } from 'react'
import { useWorkspace } from '@renderer/state/store'
import { EditorShell } from './editor-shell'

interface Props {
  projectId: string
  onClose: () => void
  children: React.ReactNode  // the terminal area (bottom pane)
}

export function DockedEditor({ projectId, onClose, children }: Props) {
  const ratio = useWorkspace((s) => s.dockSplitRatio)
  const setRatio = useWorkspace((s) => s.setDockSplitRatio)
  const hostRef = useRef<HTMLDivElement | null>(null)
  const dragging = useRef(false)

  const onDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    dragging.current = true
    e.currentTarget.setPointerCapture(e.pointerId)
  }, [])
  const onMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging.current || !hostRef.current) return
    const rect = hostRef.current.getBoundingClientRect()
    setRatio((e.clientY - rect.top) / rect.height)
  }, [setRatio])
  const onUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    dragging.current = false
    e.currentTarget.releasePointerCapture(e.pointerId)
  }, [])

  return (
    <div ref={hostRef} className="flex flex-col h-full min-h-0">
      <div style={{ flexBasis: `${ratio * 100}%` }} className="min-h-0 overflow-hidden">
        <EditorShell projectId={projectId} onClose={onClose} />
      </div>
      <div
        role="separator" aria-orientation="horizontal"
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
        className="h-1 cursor-row-resize bg-accent/10 hover:bg-accent/30 transition-colors flex-shrink-0"
        style={{ touchAction: 'none' }}
      />
      <div className="flex-1 min-h-0 overflow-hidden">{children}</div>
    </div>
  )
}
```

- [ ] **Step 4: EditorSurface (mode selector) for modal + fullscreen**

```tsx
import { useCallback } from 'react'
import { useWorkspace } from '@renderer/state/store'
import { EditorShell } from './editor-shell'
import { ModalEditor } from './file-modal'

interface Props {
  projectId: string
}

/** Renders modal/fullscreen overlays. Docked mode is handled inline in app.tsx. */
export function EditorOverlay({ projectId }: Props) {
  const viewMode = useWorkspace((s) => s.editorViewMode)
  const openFiles = useWorkspace((s) => s.openFiles)
  const closeFile = useWorkspace((s) => s.closeFile)

  const closeAll = useCallback(() => {
    for (const f of openFiles.filter((f) => f.projectId === projectId)) closeFile(f)
  }, [openFiles, projectId, closeFile])

  if (viewMode === 'modal') return <ModalEditor projectId={projectId} onClose={closeAll} />
  if (viewMode === 'fullscreen') {
    return (
      <div className="fixed inset-0 z-50 bg-background">
        <EditorShell projectId={projectId} onClose={closeAll} />
      </div>
    )
  }
  return null
}
```

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: errors only in `app.tsx` / `file-viewer.tsx` (wired in Task 6 and Phase B). Fix any stragglers referencing removed `FileModal`.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/components/workspace/editor-shell.tsx src/renderer/src/components/workspace/editor-surface.tsx src/renderer/src/components/workspace/docked-editor.tsx src/renderer/src/components/workspace/file-modal.tsx
git commit -m "feat(editor): shared EditorShell + modal/fullscreen/docked wrappers"
```

### Task 6: Wire view modes into app.tsx

**Files:**
- Modify: `src/renderer/src/app.tsx`

- [ ] **Step 1: Replace imports**

Remove `import { FileModal } from './components/workspace/file-modal'`. Add:

```tsx
import { EditorOverlay } from './components/workspace/editor-surface'
import { DockedEditor } from './components/workspace/docked-editor'
```

- [ ] **Step 2: Read view mode + compute close-all**

In the component body add:

```tsx
  const editorViewMode = useWorkspace((s) => s.editorViewMode)
  const closeFile = useWorkspace((s) => s.closeFile)
  const closeAllFiles = useCallback(() => {
    if (!selectedProject) return
    for (const f of openFiles.filter((f) => f.projectId === selectedProject.id)) closeFile(f)
  }, [openFiles, selectedProject, closeFile])
```

- [ ] **Step 3: Wrap the terminal area for docked mode**

Extract the existing terminal `<div className="@container relative flex-1 ...">…</div>` into a `const terminalArea = (…)`. Then render the main content:

```tsx
{selectedProject && selectedHasOpenFiles && editorViewMode === 'docked' ? (
  <DockedEditor projectId={selectedProject.id} onClose={closeAllFiles}>
    {terminalArea}
  </DockedEditor>
) : (
  terminalArea
)}
```

- [ ] **Step 4: Render overlay modes near the bottom (replacing the old FileModal line)**

```tsx
{selectedProject && selectedHasOpenFiles && editorViewMode !== 'docked' && (
  <EditorOverlay projectId={selectedProject.id} />
)}
```

- [ ] **Step 5: Typecheck & manual run**

Run: `npm run typecheck` (expect pass)
Run: `npm run dev`, open a file, click each of the three mode icons. Expected: docked shows editor over terminal with a draggable divider; modal floats; fullscreen fills. Closing the last tab returns to full terminal.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/app.tsx
git commit -m "feat(editor): render docked/modal/fullscreen surfaces in app shell"
```

### Task 7: Tab strip — ⌘1–9 and drag reorder

**Files:**
- Modify: `src/renderer/src/components/workspace/file-tabs.tsx`

- [ ] **Step 1: Add ⌘1–9 jump**

Inside `FileTabs`, after `projectTabs` is computed, add an effect:

```tsx
useEffect(() => {
  const onKey = (e: KeyboardEvent) => {
    if (!(e.metaKey || e.ctrlKey)) return
    const n = Number.parseInt(e.key, 10)
    if (Number.isInteger(n) && n >= 1 && n <= 9 && projectTabs[n - 1]) {
      e.preventDefault()
      setActiveFile(projectId, projectTabs[n - 1].path)
    }
  }
  window.addEventListener('keydown', onKey)
  return () => window.removeEventListener('keydown', onKey)
}, [projectTabs, projectId, setActiveFile])
```

- [ ] **Step 2: Add drag-to-reorder**

Make each tab `draggable`, track drag index in a ref, and on drop call `reorderFile`:

```tsx
const dragIndex = useRef<number | null>(null)
const reorderFile = useWorkspace((s) => s.reorderFile)
// on each tab wrapper:
//   draggable
//   onDragStart={() => (dragIndex.current = i)}
//   onDragOver={(e) => e.preventDefault()}
//   onDrop={() => { if (dragIndex.current !== null) reorderFile(projectId, dragIndex.current, i); dragIndex.current = null }}
```

(Use the map index `i` from `projectTabs.map((file, i) => …)`.)

- [ ] **Step 3: Typecheck & manual run**

Run: `npm run typecheck` (expect pass)
Run: `npm run dev`, open 3 files. Expected: 3 tabs visible in every mode; ⌘1/⌘2/⌘3 switch; dragging a tab reorders it.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/components/workspace/file-tabs.tsx
git commit -m "feat(editor): tab ⌘1-9 jump + drag reorder"
```

---

## Phase B: Monaco editor

### Task 8: Install Monaco + worker/setup + electron-vite

**Files:**
- Modify: `package.json`, `electron.vite.config.ts`
- Create: `src/renderer/src/lib/monaco-setup.ts`

- [ ] **Step 1: Install**

Run: `npm install monaco-editor`
Expected: `monaco-editor` in dependencies.

- [ ] **Step 2: Ensure ESM worker output in `electron.vite.config.ts`**

In the `renderer` block add `worker: { format: 'es' }`:

```ts
  renderer: {
    root: 'src/renderer',
    worker: { format: 'es' },
    resolve: { /* …unchanged… */ },
    plugins: [react(), tailwindcss()],
    build: { /* …unchanged… */ },
  },
```

- [ ] **Step 3: Create `src/renderer/src/lib/monaco-setup.ts`**

```ts
import * as monaco from 'monaco-editor'
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker'
import cssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker'
import htmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker'
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker'

// Locally-bundled workers — no CDN, works fully offline.
self.MonacoEnvironment = {
  getWorker(_id, label) {
    if (label === 'json') return new jsonWorker()
    if (label === 'css' || label === 'scss' || label === 'less') return new cssWorker()
    if (label === 'html' || label === 'handlebars' || label === 'razor') return new htmlWorker()
    if (label === 'typescript' || label === 'javascript') return new tsWorker()
    return new editorWorker()
  },
}

let defined = false
export function ensureThemes(): void {
  if (defined) return
  defined = true
  // Halcyon-flavored dark theme; background painted by container CSS var anyway.
  monaco.editor.defineTheme('wterm-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [],
    colors: {
      'editor.background': '#0c1021',
      'editorGutter.background': '#0c1021',
      'editor.lineHighlightBackground': '#ffffff0d',
    },
  })
}

export { monaco }
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: passes. (If TS complains about `?worker` imports, add a `declare module '*?worker'` ambient type in `src/renderer/src/vite-env.d.ts` exporting `const w: { new (): Worker }; export default w`.)

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json electron.vite.config.ts src/renderer/src/lib/monaco-setup.ts src/renderer/src/vite-env.d.ts
git commit -m "feat(editor): bundle monaco with local offline workers"
```

### Task 9: languageForFilename helper (pure, tested)

**Files:**
- Create: `src/renderer/src/lib/monaco-language.ts`
- Test: `src/renderer/src/lib/monaco-language.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import { languageForFilename } from './monaco-language'

describe('languageForFilename', () => {
  it('maps extensionless well-known files', () => {
    expect(languageForFilename('Dockerfile')).toBe('dockerfile')
    expect(languageForFilename('Makefile')).toBe('makefile')
    expect(languageForFilename('.gitignore')).toBe('ignore')
    expect(languageForFilename('.env.local')).toBe('ini')
  })
  it('returns undefined for normal extensions (Monaco infers them)', () => {
    expect(languageForFilename('app.ts')).toBeUndefined()
    expect(languageForFilename('main.rs')).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/renderer/src/lib/monaco-language.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
/**
 * Returns an explicit Monaco language id for files Monaco can't infer from the
 * extension (extensionless / dotfiles). Returns undefined to let Monaco infer
 * from the path (which covers ~90 normal extensions).
 */
export function languageForFilename(name: string): string | undefined {
  const base = name.split('/').pop() ?? name
  if (base === 'Dockerfile' || base.startsWith('Dockerfile.')) return 'dockerfile'
  if (base === 'Makefile' || base === 'makefile' || base === 'GNUmakefile') return 'makefile'
  if (base === 'CMakeLists.txt') return 'cmake'
  if (base === '.gitignore' || base === '.dockerignore' || base === '.npmignore') return 'ignore'
  if (base === '.env' || base.startsWith('.env.')) return 'ini'
  if (base === '.bashrc' || base === '.zshrc' || base === '.bash_profile' || base === '.profile') return 'shell'
  return undefined
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/renderer/src/lib/monaco-language.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/lib/monaco-language.ts src/renderer/src/lib/monaco-language.test.ts
git commit -m "feat(editor): filename→monaco-language helper"
```

### Task 10: MonacoEditor React wrapper

**Files:**
- Create: `src/renderer/src/components/workspace/monaco-editor.tsx`

- [ ] **Step 1: Implement the wrapper**

```tsx
import { useEffect, useRef } from 'react'
import { monaco, ensureThemes } from '@renderer/lib/monaco-setup'
import { languageForFilename } from '@renderer/lib/monaco-language'
import { useTheme } from '@renderer/lib/theme'
import { useSettings, type EditorSettings } from '@renderer/state/settings'

interface Props {
  /** Stable per-file key (tabKey). */
  fileKey: string
  filename: string
  initialContent: string
  onChange: (text: string) => void
  onSave: (text: string) => void
  format?: (text: string) => Promise<string | null>
  readOnly?: boolean
}

// One model per fileKey so undo history + view state survive remounts/mode switches.
const models = new Map<string, monaco.editor.ITextModel>()
const viewStates = new Map<string, monaco.editor.ICodeEditorViewState | null>()

function modelFor(fileKey: string, filename: string, content: string): monaco.editor.ITextModel {
  let m = models.get(fileKey)
  if (!m || m.isDisposed()) {
    const lang = languageForFilename(filename)
    const uri = monaco.Uri.parse(`inmemory://file/${encodeURIComponent(fileKey)}`)
    m = monaco.editor.createModel(content, lang, uri)
    models.set(fileKey, m)
  }
  return m
}

export function disposeMonacoModel(fileKey: string): void {
  models.get(fileKey)?.dispose()
  models.delete(fileKey)
  viewStates.delete(fileKey)
}

function optionsFrom(s: EditorSettings): monaco.editor.IStandaloneEditorConstructionOptions {
  return {
    fontSize: s.fontSize,
    fontFamily: s.fontFamily,
    tabSize: s.tabSize,
    insertSpaces: s.insertSpaces,
    wordWrap: s.wordWrap ? 'on' : 'off',
    lineNumbers: s.lineNumbers ? 'on' : 'off',
    minimap: { enabled: s.minimap },
    automaticLayout: true,
    scrollBeyondLastLine: false,
  }
}

export function MonacoEditor({ fileKey, filename, initialContent, onChange, onSave, format, readOnly }: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null)
  const onChangeRef = useRef(onChange)
  const onSaveRef = useRef(onSave)
  const formatRef = useRef(format)
  useEffect(() => { onChangeRef.current = onChange; onSaveRef.current = onSave; formatRef.current = format })

  const settings = useSettings((s) => s.editor)
  const { theme } = useTheme()

  // Create once; swap models per fileKey.
  useEffect(() => {
    if (!hostRef.current) return
    ensureThemes()
    const editor = monaco.editor.create(hostRef.current, {
      ...optionsFrom(useSettings.getState().editor),
      theme: 'wterm-dark',
      readOnly,
    })
    editorRef.current = editor
    const sub = editor.onDidChangeModelContent(() => onChangeRef.current(editor.getValue()))
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      const run = (text: string) => onSaveRef.current(text)
      const fmt = formatRef.current
      if (fmt) void fmt(editor.getValue()).then((f) => {
        if (f && f !== editor.getValue()) editor.setValue(f)
        run(editor.getValue())
      })
      else run(editor.getValue())
    })
    return () => {
      sub.dispose()
      editor.dispose()
      editorRef.current = null
    }
  }, [readOnly])

  // Swap model when the open file changes, preserving view state.
  useEffect(() => {
    const editor = editorRef.current
    if (!editor) return
    const prev = editor.getModel()
    if (prev) {
      // stash by the previous model's key embedded in its uri
      const key = decodeURIComponent(prev.uri.path.replace(/^\/file\//, ''))
      viewStates.set(key, editor.saveViewState())
    }
    const model = modelFor(fileKey, filename, initialContent)
    editor.setModel(model)
    const vs = viewStates.get(fileKey)
    if (vs) editor.restoreViewState(vs)
    editor.focus()
  }, [fileKey, filename, initialContent])

  // React to settings/theme.
  useEffect(() => { editorRef.current?.updateOptions(optionsFrom(settings)) }, [settings])
  useEffect(() => { monaco.editor.setTheme('wterm-dark'); void theme }, [theme])

  return <div ref={hostRef} className="h-full w-full overflow-hidden" />
}
```

- [ ] **Step 2: Add `minimap` to settings (`src/renderer/src/state/settings.ts`)**

Add `minimap: boolean` to `EditorSettings`, and `minimap: true` to `DEFAULTS`.

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: passes (file-viewer still imports `CodeEditor` until Task 11).

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/components/workspace/monaco-editor.tsx src/renderer/src/state/settings.ts
git commit -m "feat(editor): Monaco React wrapper with per-file model registry"
```

### Task 11: Swap FileViewer to Monaco + dispose models on close

**Files:**
- Modify: `src/renderer/src/components/workspace/file-viewer.tsx`
- Modify: `src/renderer/src/state/store.ts`

- [ ] **Step 1: Replace `CodeEditor` with `MonacoEditor` in `file-viewer.tsx`**

Change the import `import { CodeEditor } from './code-editor'` → `import { MonacoEditor } from './monaco-editor'`, and replace both `<CodeEditor .../>` usages (the main editor and the Markdown "code" pane) with `<MonacoEditor .../>` — the props are identical (`fileKey`, `filename`, `initialContent`, `onChange`, `onSave`, `format`).

- [ ] **Step 2: Dispose the Monaco model when a tab closes**

In `store.ts` `closeFile`, after computing `key`, call the disposer. Add at top of store.ts: `import { disposeMonacoModel } from '@renderer/components/workspace/monaco-editor'`. Inside `closeFile`'s `set`, before returning, add `disposeMonacoModel(key)`. (Safe even if no model exists.)

- [ ] **Step 3: Typecheck & manual run**

Run: `npm run typecheck` (expect pass)
Run: `npm run dev`. Open `.ts`, `.sh`, `.rb`, `.go`, `Dockerfile`, `.toml`. Expected: all highlighted; minimap visible; ⌘Z/⌘⇧Z undo/redo; ⌘F find; ⌘S saves (and formats if formatOnSave on).

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/components/workspace/file-viewer.tsx src/renderer/src/state/store.ts
git commit -m "feat(editor): render files with Monaco; dispose models on close"
```

### Task 12: Remove CodeMirror

**Files:**
- Delete: `code-editor.tsx`, `code-mirror-language.ts`, `codemirror-halcyon-theme.ts`
- Modify: `package.json`

- [ ] **Step 1: Confirm no remaining imports**

Run: `grep -rn "codemirror\|code-editor\|@codemirror\|halcyonTheme" src/`
Expected: no references outside the files to delete. Fix any stragglers.

- [ ] **Step 2: Delete files & uninstall**

```bash
git rm src/renderer/src/components/workspace/code-editor.tsx src/renderer/src/lib/code-mirror-language.ts src/renderer/src/lib/codemirror-halcyon-theme.ts
npm uninstall @codemirror/autocomplete @codemirror/commands @codemirror/lang-css @codemirror/lang-go @codemirror/lang-html @codemirror/lang-javascript @codemirror/lang-json @codemirror/lang-markdown @codemirror/lang-python @codemirror/lang-rust @codemirror/lang-sql @codemirror/lang-xml @codemirror/lang-yaml @codemirror/language @codemirror/search @codemirror/state @codemirror/theme-one-dark @codemirror/view
```

- [ ] **Step 3: Typecheck + test + manual**

Run: `npm run typecheck && npm test`
Expected: both pass.
Run: `npm run dev` and confirm editing still works.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore(editor): remove CodeMirror, fully on Monaco"
```

---

## Phase C-ui: Git-status colors in the tree

### Task 13: themes.css variables

**Files:**
- Modify: `src/renderer/src/styles/themes.css`

- [ ] **Step 1: Add variables to each theme block**

For every theme selector in `themes.css`, add:

```css
  --git-modified: #d7a85f;
  --git-added: #5fb87a;
  --git-deleted: #d16969;
  --git-conflict: #d98e4f;
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/src/styles/themes.css
git commit -m "feat(tree): git-status color variables"
```

### Task 14: Tree fetches + renders git status

**Files:**
- Modify: `src/renderer/src/components/right-sidebar/file-tree.tsx`

- [ ] **Step 1: Fetch the status map**

Add state + loader to `FileTree`:

```tsx
const [gitStatus, setGitStatus] = useState<GitFileStatusMap>({})
const reloadGit = useCallback(async () => {
  setGitStatus(await window.api.git.fileStatus(project.id))
}, [project.id])
```

Call `void reloadGit()` in the existing project-change effect, on window `focus`, and at the end of `reloadFolder`/`submitCreate`/`submitRename`/the delete branch of `handleAction`.

- [ ] **Step 2: Color the row name**

Add a helper and apply it in `TreeRow` (pass `gitStatus` down, look up `entry.path`; for folders, derive a marker if any key starts with `entry.path + '/'`):

```tsx
function statusColor(s?: GitFileStatus): string | undefined {
  switch (s) {
    case 'modified': return 'var(--git-modified)'
    case 'added':
    case 'untracked': return 'var(--git-added)'
    case 'deleted': return 'var(--git-deleted)'
    case 'conflict': return 'var(--git-conflict)'
    default: return undefined
  }
}
```

Apply via inline `style={{ color: statusColor(status) }}` on the name `<span>` (overrides the Tailwind color when set), and add `line-through` when `status === 'deleted'`. Keep `ignored` dimming when no status is present.

- [ ] **Step 3: Typecheck & manual run**

Run: `npm run typecheck` (expect pass)
Run: `npm run dev`. Modify a tracked file, add a new file, `git rm` a file. Expected: names show amber/green/red on focus or after a tree mutation.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/components/right-sidebar/file-tree.tsx
git commit -m "feat(tree): color file names by git status"
```

---

## Phase D: File-tree keyboard shortcuts

### Task 15: Selection model + arrow nav + actions

**Files:**
- Modify: `src/renderer/src/components/right-sidebar/file-tree.tsx`

- [ ] **Step 1: Add selection state + visible-rows flattening**

```tsx
const [selected, setSelected] = useState<string | null>(null)
// Build the ordered list of currently-visible rows (respecting `expanded`).
const visibleRows = useMemo(() => flattenVisible(rootEntries, children, expanded), [rootEntries, children, expanded])
```

Add `flattenVisible(roots, children, expanded): FsEntry[]` that walks roots, and for each expanded directory splices in its `children[path]` recursively (skip undefined/not-yet-loaded).

- [ ] **Step 2: Keyboard handler on the scroll container**

Make the scroll `<div>` focusable (`tabIndex={0}`) and add `onKeyDown`:

```tsx
const onTreeKey = (e: React.KeyboardEvent) => {
  if (renaming || creatingAt) return
  const idx = visibleRows.findIndex((r) => r.path === selected)
  const cur = idx >= 0 ? visibleRows[idx] : null
  switch (e.key) {
    case 'ArrowDown': e.preventDefault(); setSelected(visibleRows[Math.min(visibleRows.length - 1, idx + 1)]?.path ?? selected); break
    case 'ArrowUp': e.preventDefault(); setSelected(visibleRows[Math.max(0, idx - 1)]?.path ?? selected); break
    case 'ArrowRight': if (cur?.isDirectory && !expanded[cur.path]) { e.preventDefault(); void toggle(cur) } break
    case 'ArrowLeft': if (cur?.isDirectory && expanded[cur.path]) { e.preventDefault(); void toggle(cur) } break
    case 'Enter': if (cur) { e.preventDefault(); cur.isDirectory ? void toggle(cur) : openFile({ projectId: project.id, path: cur.path }) } break
    case 'F2': if (cur) { e.preventDefault(); setRenaming(cur.path) } break
    case 'Delete':
    case 'Backspace': if (cur && (e.key === 'Delete' || e.metaKey)) { e.preventDefault(); void handleAction(cur, 'delete') } break
    default:
      if (e.key === 'n' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void handleAction(cur, 'new-file') }
  }
}
```

Wire `onKeyDown={onTreeKey}` on the scroll container; set `selected` on row click (in `onOpen`/the row button `onClick`).

- [ ] **Step 3: Highlight the selected row**

In `TreeRow`, add a `selected` prop; when `entry.path === selected`, apply a ring/background (e.g. `ring-1 ring-accent/40`) distinct from the active-file background.

- [ ] **Step 4: Type-ahead jump**

Add a small buffer ref; in `onTreeKey` default branch, if a single printable char, append to buffer (reset after 600ms via a timestamp ref compared on each keypress — no timers needed) and select the next visible row whose name starts with the buffer.

- [ ] **Step 5: Typecheck & manual run**

Run: `npm run typecheck` (expect pass)
Run: `npm run dev`. Click the tree, then: arrows navigate, →/← expand/collapse, Enter opens, F2 renames, Delete trashes (with confirm), ⌘N new file, typing a letter jumps.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/components/right-sidebar/file-tree.tsx
git commit -m "feat(tree): keyboard navigation + rename/delete/new/type-ahead"
```

---

## Phase E: Editor shortcut audit

### Task 16: Resolve Esc + ⌘W + ⌘S conflicts

**Files:**
- Modify: `src/renderer/src/components/workspace/file-modal.tsx` (ModalEditor)
- Modify: `src/renderer/src/app.tsx`

- [ ] **Step 1: Escape should not close the modal while a Monaco widget is open**

In `ModalEditor`'s Escape handler, only close when no Monaco overlay is open. Track focus: if `document.activeElement` is inside the editor host and Monaco has an open find widget, let Monaco handle Escape first. Simplest robust approach: check `document.querySelector('.monaco-editor .find-widget.visible')` before closing:

```tsx
if (e.key === 'Escape') {
  if (document.querySelector('.monaco-editor .find-widget.visible')) return
  e.preventDefault(); onClose()
}
```

- [ ] **Step 2: ⌘W routes to close-tab when the editor is focused**

In `app.tsx`'s keydown handler, before the terminal `⌘W` branch, add: if the active project has open files **and** focus is within the editor surface (`document.activeElement?.closest('.monaco-editor, [data-editor-surface]')`), close the active file tab instead of the terminal. Add `data-editor-surface` to `EditorShell`'s root div.

```tsx
if (e.key === 'w' && selectedHasOpenFilesForActive && editorFocused()) {
  e.preventDefault()
  const active = activeFileByProject[selectedProject.id]
  const f = openFiles.find((x) => x.projectId === selectedProject.id && x.path === active)
  if (f) closeFile(f)
  return
}
```

- [ ] **Step 3: Confirm ⌘S isn't shadowed**

Verify the app-level keydown handler in `app.tsx` does not intercept `s`. It doesn't today — but add a guard comment so future edits don't. Monaco's own ⌘S command (Task 10) handles save.

- [ ] **Step 4: Typecheck & manual run**

Run: `npm run typecheck` (expect pass)
Run: `npm run dev`. In each mode: ⌘F opens find, Esc closes the find widget (not the modal); a second Esc closes the modal. ⌘W with editor focused closes the tab; with terminal focused closes the terminal. ⌘S saves.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/workspace/file-modal.tsx src/renderer/src/app.tsx src/renderer/src/components/workspace/editor-shell.tsx
git commit -m "fix(editor): scope Esc/⌘W/⌘S between editor and terminal"
```

---

## Final verification

- [ ] Run `npm run typecheck` — passes.
- [ ] Run `npm test` — parser + language tests pass.
- [ ] Run `npm run dev`:
  - Open `.sh`, `.rb`, `.swift`, `.kt`, `.cpp`, `.cs`, `.java`, `.php`, `.toml`, `Dockerfile`, `Makefile`, `.lua` → all highlighted.
  - Switch docked ↔ modal ↔ fullscreen with a dirty file → content, cursor, scroll, undo history persist.
  - Open 3 files → 3 tabs in every mode; ⌘1–3 jump; ⌘W closes; drag reorders.
  - Disconnect network, reload → Monaco still loads (local workers).
  - Modify/add/delete files → tree colors update on focus.
  - Tree keys: arrows, F2, Delete, ⌘N, type-ahead.
  - undo/redo, ⌘F, ⌘S, ⌘⇧F inside each mode.
- [ ] Run `npm run build` — production build succeeds (workers emitted).
- [ ] Final commit if any fixups remain.
