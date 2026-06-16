# Advanced File Explorer & Editor (Monaco) — Design

**Date:** 2026-06-16
**Status:** Draft (pending spec review)
**Branch:** feat/cursor-workspace-layout

## Problem

wTerm should feel like a VS Code agent workspace, but the file explorer/editor still
lags behind that bar in four ways:

1. **Only ~11 languages are highlighted.** `code-mirror-language.ts` maps JS/TS, JSON,
   Markdown, HTML, CSS, Python, Rust, Go, YAML, XML, SQL. Everything else — Shell, Ruby,
   Swift, Kotlin, C/C++, C#, Java, PHP, TOML, Dockerfile, Lua, etc. — opens as plain text.
   This is the user's headline complaint: "most files are not supported."
2. **The editor has only one surface — a centered modal.** The user wants three
   VS Code-style open modes (**Docked**, **Modal**, **Fullscreen**) switchable from
   top-right icons, like the reference screenshots (which are VS Code).
3. **Multiple open files don't reliably show a tab strip** in the file surface.
4. **Polish gaps:** the file tree has no git-status colors and no keyboard shortcuts.

## Decisions (from brainstorming)

- **Adopt Monaco, the editor that powers VS Code.** Replace CodeMirror entirely. Monaco
  ships ~90 languages, the find/replace widget, multi-cursor, command palette, minimap,
  folding, and IntelliSense for TS/JS/JSON/CSS/HTML out of the box — directly resolving
  complaints #1 and most editing-shortcut asks.
- **Integration = raw `monaco-editor`, bundled locally, behind a thin React wrapper.**
  This is closest to how VS Code embeds Monaco and gives full control over models, view
  state, themes, and workers. No CDN — must work offline. Not `@monaco-editor/react`.
- **Three editor view modes** (`docked | modal | fullscreen`) selectable from top-right
  chrome icons, sharing one editor shell so tabs/multi-file behave identically in each.
- **Docked = vertical split**: editor on top, terminal below, draggable divider.
- **Git-status colors** in the file tree (modified/untracked/added/deleted/conflict).
- **File-tree keyboard shortcuts** (navigate, rename, delete, copy/paste, new file).
- Build order: **A** view modes + tabs → **B** Monaco → **C** git colors → **D** tree
  keys → **E** shortcut audit. (Monaco lands early since A's editor shell hosts it.)

## Scope

In scope: the file explorer (`right-sidebar/file-tree.tsx`) and the file editor surface
(`workspace/` editor components), plus the Monaco swap and a new git-file-status IPC.

Out of scope: terminal behavior, the project sidebar, GitHub/PR panels, settings UI
beyond adding a couple of editor options (minimap toggle), and any LSP/language-server
integration (Monaco's built-in IntelliSense only).

---

## A. Editor view modes + multi-file tabs

### State (store.ts)

Replace the modal-only flags with a view-mode model:

```ts
type EditorViewMode = 'docked' | 'modal' | 'fullscreen'
editorViewMode: EditorViewMode          // persisted; default 'docked'
setEditorViewMode: (m: EditorViewMode) => void
// existing: openFiles, activeFileByProject, fileStates, openFile, closeFile, setActiveFile
// modal size fields stay (used only in 'modal' mode)
```

`openFile` keeps its current append-or-focus semantics (it already never replaces an
existing tab) and additionally ensures the editor surface is shown. The old
`fileModalOpen` boolean is replaced by "any open files for the active project" +
`editorViewMode`.

### Components

A single shared shell hosts the chrome, tabs, and viewer in all three modes:

```
EditorShell                       // chrome header (filename + mode icons + close) + FileTabs + FileViewer
 ├─ EditorChrome                  // top-right: ⬓ docked · ▢ modal · ⛶ fullscreen · ✕ close
 ├─ FileTabs (existing)           // multi-file tab strip — mounted in EVERY mode
 └─ FileViewer (existing)         // hosts MonacoEditor / MarkdownPane
```

Mode wrappers position the shell:

- **DockedEditor** — renders inside `app.tsx`'s `<main>` workspace area as the **top
  pane of a vertical split**; terminal occupies the bottom pane. A draggable horizontal
  divider sets the split ratio (persisted). When the project has no open files, the
  split collapses and the terminal fills the area.
- **ModalEditor** — today's floating, centered, resizable window over a dim backdrop.
- **FullscreenEditor** — the shell fills the entire workspace area (over the terminal),
  edge to edge.

`EditorChrome` icons call `setEditorViewMode`. The same `EditorShell` instance is reused
across modes so React state and the Monaco model registry (see §B) survive the switch;
scroll/cursor are restored via Monaco view state.

### Multi-file tabs (fix #3)

`FileTabs` already maps every open file for the project; the bug is that it was only ever
mounted inside the modal. Mounting it in the shared `EditorShell` fixes it for all modes.
Additional tab behavior to add:

- ⌘1–9 jump to the Nth tab; ⌘W closes the active tab (with the existing unsaved-confirm).
- Middle-click closes (already present).
- Drag-to-reorder tabs (updates `openFiles` order).

### app.tsx changes

`{selectedProject && selectedHasOpenFiles && <FileModal .../>}` is replaced by a single
`<EditorSurface projectId={...} />` that renders the correct mode wrapper based on
`editorViewMode`. In docked mode it participates in the `<main>` split; in modal/fullscreen
it overlays.

---

## B. Monaco editor (replaces CodeMirror)

### Bundling & workers (the main integration task)

- Add dependency `monaco-editor`. Remove all `@codemirror/*` deps and
  `code-mirror-language.ts`, `codemirror-halcyon-theme.ts`.
- Configure `self.MonacoEnvironment.getWorker` to return locally-bundled workers using
  electron-vite/Vite `?worker` imports:
  `editor.worker`, `ts.worker`, `json.worker`, `css.worker`, `html.worker`. **No CDN
  loader** — the app must work fully offline.
- Verify electron-vite renderer config emits the workers correctly (may need a small
  `vite.config` tweak or `worker.format: 'es'`).

### MonacoEditor component (`workspace/monaco-editor.tsx`)

Thin wrapper replacing `code-editor.tsx`. Responsibilities:

- **Model registry:** one `monaco.editor.ITextModel` per open file, keyed by `tabKey`,
  created with language inferred from filename and disposed when the tab closes. Reusing
  models preserves undo history and lets a single editor instance swap files instantly.
- **Editor instance:** one `monaco.editor.create` per mounted surface; `setModel` switches
  files; `saveViewState`/`restoreViewState` preserve scroll+cursor across file and mode
  switches.
- **Options from settings:** map `EditorSettings` → Monaco options — `fontSize`,
  `fontFamily`, `tabSize`, `insertSpaces`, `wordWrap` (`'on'|'off'`), `lineNumbers`,
  and a **new `minimap` toggle** (default on, matching the screenshots). Re-apply via
  `editor.updateOptions` on settings change (no recreate).
- **Save & format:** ⌘S saves via the existing `window.api.fs.writeText`; when
  `formatOnSave` is on and the file is Prettier-formattable, run the existing
  `formatText` (lib/formatter.ts) before writing — registered as a Monaco command/keybinding
  (`KeyMod.CtrlCmd | KeyCode.KeyS`) and a document-formatting action (⌘⇧F).
- **Read-only / binary / error** states stay handled by `FileViewer` (unchanged); the
  Markdown preview/code pane stays, with the "code" mode now using `MonacoEditor`.

### Language detection

Monaco resolves most languages from file extension automatically. Add a small
`languageForFilename` helper for the cases Monaco doesn't infer (extensionless well-known
files: `Dockerfile`, `Makefile`, `CMakeLists.txt`, `.gitignore`, `.env*`, `.bashrc`),
calling `monaco.editor.createModel(value, language, uri)` with the right language id.

### Theming

Define Monaco themes matching the app's themes (Halcyon + default dark) via
`monaco.editor.defineTheme`, mapping the existing palette (`--background`, accent, etc.)
to Monaco token colors. Switch with `monaco.editor.setTheme` when `useTheme()` changes.
Editor surface background uses the same near-black navy as the terminal.

---

## C. Git-status colors in the file tree

### Main process

New IPC `git:file-status` (channel `git:file-status`) in `src/main/git/local.ts` +
`src/main/ipc/...` + preload `window.api.git.fileStatus(projectId)`. Implementation runs
`git status --porcelain=v1 -z` in the project cwd and parses into:

```ts
type GitFileStatus = 'modified' | 'added' | 'deleted' | 'untracked' | 'conflict'
fileStatus(projectId): Promise<Record<string /*relPath*/, GitFileStatus>>
```

Untracked (`??`), added (`A`), modified (`M`/` M`), deleted (`D`), conflict (`U`/`AA`/`DD`).
Returns `{}` for non-repos. Paths are relative with forward slashes (matching `FsEntry.path`).

### Renderer

`FileTree` fetches the status map on project load, on window focus, and after any fs
mutation (create/delete/rename/duplicate). Row name color (VS Code-style), driven by
CSS variables added to `themes.css` so they track the theme:

- modified → amber (`--git-modified`)
- untracked / added → green (`--git-added`)
- deleted → red, strikethrough (`--git-deleted`)
- conflict → orange (`--git-conflict`)

A folder that contains any changed descendant gets a subtle colored dot/marker. The
existing `ignored` styling (dimmed) is preserved and takes lower precedence than an
explicit status.

---

## D. File-tree keyboard shortcuts

`FileTree` gains a **selected/focused row** model (single selection) with roving
`tabIndex` so the tree is focusable and arrow-navigable. When the tree has focus:

- **↑ / ↓** — move selection through visible (expanded) rows.
- **← / →** — collapse / expand a folder, or move to parent / first child.
- **Enter** — open the file (folders toggle).
- **F2** — rename (reuses existing `RenameInput`).
- **Delete / ⌘⌫** — move to Trash (reuses existing confirm + `fs.remove`).
- **⌘C / ⌘V** — copy a file path / paste-duplicate into the selected folder (uses
  existing `fs.duplicate`/create APIs; cross-folder paste via a new `fs.copy` if needed).
- **⌘N** — new file in the selected folder (reuses `CreateInput`).
- **Type-ahead** — typing letters jumps selection to the next row whose name matches.

Keyboard handlers are scoped to the tree container and ignored while an inline
input (create/rename) is active.

---

## E. Editor shortcut audit

Monaco provides undo/redo (⌘Z/⌘⇧Z), cut/copy/paste, select-all, find/replace (⌘F/⌘⌥F),
multi-cursor (⌘D), comment toggle (⌘/), and indent shortcuts natively. Remaining work:

- Ensure the **modal's Escape handler doesn't swallow** Monaco's own Escape (e.g. closing
  the find widget). Escape should first dismiss Monaco overlays; only close the modal when
  the editor has no open overlay/widget.
- Ensure ⌘S / ⌘⇧F (save / format) are registered as Monaco keybindings (see §B) and not
  shadowed by the app-level `keydown` handler in `app.tsx`.
- Confirm app-level ⌘W (close terminal) vs editor ⌘W (close tab) routing: when the editor
  surface is focused, ⌘W closes the active file tab; otherwise it closes the terminal.

---

## Data flow

```
tree click / Enter ─▶ store.openFile ─▶ openFiles += file ─▶ EditorSurface renders
                                                            (mode = editorViewMode)
EditorShell ─▶ FileTabs (all open files)  +  FileViewer ─▶ MonacoEditor
MonacoEditor ─▶ model registry[tabKey] ─▶ monaco.editor.create / setModel
⌘S ─▶ (formatOnSave? formatText) ─▶ window.api.fs.writeText ─▶ markFileSaved
FileTree load/focus/mutation ─▶ window.api.git.fileStatus ─▶ row colors
```

## Components & boundaries

- **EditorSurface** — picks the mode wrapper from `editorViewMode`. Depends on store.
- **EditorShell** — chrome + tabs + viewer; mode-agnostic. Depends on FileTabs, FileViewer.
- **EditorChrome** — mode-switch + close icons. Depends on store setters only.
- **MonacoEditor** — wraps monaco; owns the model registry, options, theme, save/format.
  Depends on settings, theme, formatter, `window.api.fs`.
- **FileTree** — explorer + git colors + keyboard. Depends on `window.api.fs`,
  `window.api.git.fileStatus`, store.openFile.
- **main/git/local.ts** — adds `getFileStatus(cwd)`.

## Error handling

- Monaco worker fails to load → editor shows an inline error placeholder; log to console;
  app stays usable (tree, terminals unaffected).
- `git:file-status` errors / non-repo → return `{}`; tree renders without colors.
- Save failure → keep dirty state, surface a toast/inline message (match current behavior).
- Large/binary files → keep the existing `binary` placeholder; don't hand them to Monaco.

## Testing

- **Language coverage:** open a sampling of files (`.sh`, `.rb`, `.swift`, `.kt`, `.cpp`,
  `.cs`, `.java`, `.php`, `.toml`, `Dockerfile`, `Makefile`, `.lua`) and confirm
  highlighting.
- **View modes:** switch docked↔modal↔fullscreen with a dirty file open; confirm content,
  cursor, scroll, and undo history persist.
- **Multi-file:** open 3 files; confirm 3 tabs in every mode; ⌘1–3 and ⌘W work.
- **Offline workers:** run the packaged app with no network; confirm Monaco loads.
- **Git colors:** modify/add/delete files; confirm tree colors update on focus/mutation.
- **Tree keys:** arrow-navigate, F2 rename, Delete trash, ⌘N new file, type-ahead.
- **Shortcut audit:** undo/redo, ⌘F find, ⌘S save, ⌘⇧F format inside each mode.

## Risks

- **Monaco worker setup in electron-vite** is the highest-risk item; spike it first.
- **Bundle size** grows ~5 MB (acceptable for desktop).
- **Theme parity:** Monaco theming is token-based, not CSS-var-based; the Halcyon mapping
  is approximate and may need iteration.
