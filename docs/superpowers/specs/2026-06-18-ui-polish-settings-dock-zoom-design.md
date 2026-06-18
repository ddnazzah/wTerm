# wTerm UI fixes & polish — design

Date: 2026-06-18
Branch: `feat/ui-polish-settings-dock-zoom`

A batch of UI correctness fixes and polish across settings, the top bar, editor
display modes, the git panel, and a new whole-window zoom. Each item is
independent and can be implemented and verified on its own.

## 1. Font & whole-window zoom

**Current state**
- Editor (Monaco) reads `editor.fontSize` from the settings store and applies it
  reactively (`monaco-editor.tsx`). Works.
- Terminal (xterm) hardcodes `fontSize: 13` (`terminal-pane.tsx:124`) and never
  reads settings. There is no zoom of any kind anywhere (no `webFrame`, no menu
  accelerators, no terminal font control).

**Decision**
- Editor font size stays in Settings, editor-only. No separate terminal font
  setting.
- Add **whole-window zoom** that scales the entire renderer (terminal, editor,
  sidebars, chrome) like browser zoom.

**Implementation**
- Main process: expose an IPC channel (e.g. `system:setZoom` / `system:getZoom`)
  that sets `webContents.setZoomFactor` on the calling window and persists the
  factor (electron-store / existing state store). Restore the saved factor when
  the window is created.
- Preload: expose `window.api.system.setZoom(factor)` / `adjustZoom(delta)` /
  `resetZoom()` and `getZoom()`.
- Renderer: a global keydown handler maps `Cmd/Ctrl + =` (zoom in),
  `Cmd/Ctrl + -` (zoom out), `Cmd/Ctrl + 0` (reset) to the IPC calls. Clamp the
  factor to a sane range (e.g. 0.5–2.5).

## 2. Settings — VSCode-style left-nav

**Current state**: `settings-modal.tsx` is a single centered modal with sections
stacked vertically (Terminal, Editor, Formatting, Updates) plus an About footer.
Feels clumsy as the list grows.

**Decision / implementation**: rewrite into a two-pane dialog.
- Left rail: category list — **Appearance · Terminal · Editor · Formatting ·
  Updates · About**. Selected category highlighted.
- Right pane: scrollable content for the active category.
- Category contents:
  - **Appearance**: editor font size, editor font family.
  - **Terminal**: startup command.
  - **Editor**: tab size, insert spaces, word wrap, line numbers, minimap.
  - **Formatting**: format on save.
  - **Updates**: current version + check/install (as today).
  - **About**: name + version (folded in from the footer).
- Reuse the existing field primitives (`NumberField`, `TextField`,
  `TextAreaField`, `BoolField`); tighten row layout, spacing, and dividers.
- No behavior change to the settings store itself.

## 3. Top bar

- **Sidebar toggle position**: pin the toggle button hard to the far-left
  corner. On macOS it must sit just right of the traffic lights (they own the
  corner); on Windows/Linux it sits flush-left. Adjust the header padding so the
  toggle is the left-most interactive element.
- **Search label ordering**: the label is already built project-first
  (`app.tsx:225`: `${project.name} — ${terminal}`). Verify it renders
  project-first after a rebuild; no logic change expected. If a discrepancy is
  found at runtime, fix the construction site only.

## 4. Editor display modes

**Fullscreen return** (currently broken — no prior-mode memory):
- Add `previousEditorViewMode: EditorViewMode` to the store.
- When `setEditorViewMode('fullscreen')` is called, record the current
  (non-fullscreen) mode into `previousEditorViewMode` first.
- Add an exit path (Esc and/or a button) that restores `previousEditorViewMode`
  (defaulting to `modal` if it was somehow fullscreen) instead of closing files.

**Dock orientation** (currently stacked, editor above terminal):
- `docked-editor.tsx`: switch container from `flex-col` to `flex-row`.
- Order: terminal on the **left**, editor on the **right** (adjacent to the
  right panel).
- Divider becomes a vertical `w-1 cursor-col-resize` separator
  (`aria-orientation="vertical"`).
- Re-map the drag ratio to the X axis
  (`(clientX - rect.left) / rect.width`), keeping `dockSplitRatio` as the
  editor's fraction (now width instead of height). Keep the same persisted key
  and 0.15–0.85 clamp.

## 5. Git panel — collapsible sections

**Current state**: `git-panel.tsx` renders GitStatusBar, PrSection, RunsSection
stacked, none collapsible. The codebase has an expand/rotate pattern in
`file-tree.tsx` and `project-item.tsx` but no shared collapsible component.

**Decision / implementation**:
- Add a small reusable `CollapsibleSection` (chevron header that rotates,
  collapsible body, optional right-aligned count/badge), styled VSCode
  source-control-like.
- Wrap the git panel's regions as independently collapsible sections:
  **Changes/Status**, **Pull Requests**, **CI / Workflow Runs**. Clearer headers
  with counts. Expanded state can be local component state (no persistence
  required for v1).

## Out of scope
- Top-modal / VSCode quick-input component — explicitly deferred by the user.

## Verification
- `pnpm typecheck` and `pnpm test` pass.
- Manual: zoom in/out/reset scales the whole app and persists across restart;
  settings categories switch and all controls work; editor font size still
  applies live; sidebar toggle sits far-left; dock shows terminal-left /
  editor-right with a draggable vertical divider; entering then exiting
  fullscreen returns to the prior mode; git sections collapse/expand.
