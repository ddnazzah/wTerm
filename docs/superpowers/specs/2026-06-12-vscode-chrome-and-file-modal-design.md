# VS Code-style Chrome + File Modal — Design

**Date:** 2026-06-12
**Status:** Approved (pending spec review)

## Problem

wTerm should feel like a VS Code agent workspace. Today it is terminal-centric: the
project sidebar is on the left, the active terminal fills the center, and opening a file
shows it in a **resizable side pane** beside the terminal. We want the VS Code *frame*
while keeping terminals as the primary, central surface — and we want files to open in a
**centered, resizable modal** rather than a side pane.

## Decisions (from brainstorming)

- **Adopt VS Code chrome, keep terminals central.** Terminals become the main-area tabs;
  the editor is not the center.
- **Left activity bar + project sidebar** on the left (the project sidebar stays the
  explorer).
- **Right sidebar (file tree / Git / GitHub) + right activity bar** stay as-is.
- **New bottom status bar** spanning the window.
- **Files open in a centered, resizable modal with a dim backdrop.** The backdrop dims and
  blocks the workspace while open; Esc or a backdrop click closes it. Multiple open files
  are tabs *inside* the modal.
- Reference target chosen: "VS Code chrome, terminals central" (not full editor-center
  inversion).
- **Visual reference = the Visual Studio / VS Code agent-window screenshots**, applied to
  wTerm's own content (projects + terminals). We replicate the *look*, not the reference's
  sessions/agent-chat data, which wTerm doesn't have. Concretely from the images:
  - **Top bar:** a centered title (`<active terminal or project> · wTerm`), with the
    existing window/update affordances kept where they are.
  - **File-open as a titled, centered modal:** the file opens in a floating panel with its
    own **titlebar** (filename on the left, a **close control** on the right) over a dim
    backdrop — matching the `package.json` panel in the reference.
  - **Palette:** the existing deep-navy Halcyon theme already matches the reference's
    near-black navy; tune panel borders/separators to the muted, low-contrast look and keep
    a single warm accent (the existing accent / the amber Update pill).
  - **Right panel:** the file tree stays, presented in the muted "Files" style of the
    reference.

## Architecture

### Layout (app.tsx)

A single horizontal row plus a full-width status bar beneath, with the file modal as an
overlay:

```
┌────┬────────┬───────────────────────────┬──────────┬───┐
│ L  │ project│  terminal tab strip        │  right   │ R │
│ act│ sidebar│ ┌───────────────────────┐  │ sidebar  │act│
│ bar│        │ │  active terminal pane  │  │ files/   │bar│
│    │        │ └───────────────────────┘  │ git/gh   │   │
├────┴────────┴───────────────────────────┴──────────┴───┤
│ status bar: ⎇ branch · N terminals · v0.1.x            │
└────────────────────────────────────────────────────────┘
        (file modal overlays the whole thing, centered, dim backdrop)
```

### Components

- **`LeftActivityBar`** (new, `components/left-activity-bar.tsx`): slim vertical icon strip
  on the far left. Buttons: **Explorer** (toggles the project sidebar via the existing
  `toggleSidebar`) and **Settings** (opens the settings modal). Mirrors the existing
  `RightActivityBar` styling.
- **`TerminalTabs`** (new, `components/workspace/terminal-tabs.tsx`): a VS Code-style tab
  strip at the top of the main area listing the **selected project's terminals**, each with
  a terminal glyph, busy/unread indicators (reusing existing `busyByTerminal` /
  `unreadByTerminal`), a close button, and double-click rename. Clicking activates that
  terminal via the existing `setActiveTerminal`. Replaces the old header breadcrumb +
  `FileTabs` row.
- **`StatusBar`** (new, `components/status-bar.tsx`): full-width bottom bar. Left: git
  branch + ahead/behind for the selected project (existing `git:info`). Right:
  context-sensitive — `Ln x, Col y · <lang>` when the file modal is open and focused,
  otherwise `N terminals` for the selected project; plus the app version (existing
  `system:version`).
- **`FileModal`** (new, `components/workspace/file-modal.tsx`): a centered, resizable modal
  with a dim, click-to-close backdrop, styled after the reference's file panel. It has a
  **titlebar** (active filename on the left + a **close button** on the right), then the
  existing `FileTabs` (scoped to the modal) and `FileViewer` (CodeMirror editor / markdown
  preview / image viewer). Esc or backdrop click closes. Resizable by dragging its
  edges/corner; size persists (see store).
- **Reused unchanged:** `ProjectList` (left sidebar), `RightSidebar`, `RightActivityBar`,
  `TerminalPane` (still all mounted, visibility-toggled), `FileViewer`, `FileTabs`,
  `SettingsModal`, `UpdateBanner`.

### State (`state/store.ts`)

- The center no longer splits into terminal + file side-pane. The file side-pane and its
  `filePaneWidth` resizer are removed from the layout.
- Add **`fileModalOpenByProject: Record<ProjectId, boolean>`** (or a single
  `fileModalOpen` keyed off the selected project) plus `openFileModal()` /
  `closeFileModal()`.
- Opening a file (from the right-sidebar file tree) calls the existing `openFile` **and**
  `openFileModal()`. Closing the modal sets it false but leaves `openFiles` intact so
  reopening restores the tabs.
- Add persisted **`fileModalWidth` / `fileModalHeight`** (localStorage, same pattern as the
  current `filePaneWidth`) for the resizable modal; clamp to viewport.

## Data flow

1. User clicks a file in the right-sidebar file tree → `openFile(file)` +
   `openFileModal()` → `FileModal` mounts centered with a dim backdrop.
2. Inside the modal: `FileTabs` switches among open files; `FileViewer` renders the active
   one; ⌘S/Ctrl+S saves (unchanged).
3. Esc or backdrop click → `closeFileModal()` → modal unmounts, workspace re-enabled;
   `openFiles` preserved.
4. Terminal tabs at the top switch the active terminal; the center shows it full-width.
5. Status bar reflects git branch + (modal-open ? cursor position : terminal count).

## Error handling

- Modal with no open files for the project → not rendered (guard on `openFiles` for the
  selected project), same guard style as today's `hasOpenFiles`.
- Status-bar git info failure → branch segment hidden (treat like the existing Git panel,
  which already tolerates non-repos).
- Resizable modal clamps to the viewport so it can't be dragged off-screen or below a
  minimum usable size.

## Testing

No unit-test runner in this repo; gate is `npm run typecheck` + `npm run build`, then
manual `npm run dev`:

1. Open a file from the tree → **centered modal with a dim backdrop**; workspace behind is
   dimmed/non-interactive.
2. Resize the modal by dragging an edge/corner; reopen later → size persisted.
3. Edit + ⌘S saves; open a second file → tabs inside the modal; Esc closes, terminal
   visible again, tabs preserved on reopen.
4. Terminal **tabs at the top** switch terminals; busy/unread indicators show.
5. **Left activity bar** toggles the project sidebar and opens settings.
6. **Status bar** shows the git branch and terminal count, and the app version.

## Out of scope (YAGNI)

- Split/grid editors or simultaneous terminal+editor panes.
- Draggable (repositionable) modal — resizable only, stays centered.
- Drag-reordering tabs (terminals or file tabs).
- Moving terminals into a bottom panel (the "full inversion" option was not chosen).
- Restyling the editor itself — wTerm's CodeMirror/Halcyon editor is already in good shape.
