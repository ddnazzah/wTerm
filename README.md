<p align="center">
  <img src="resources/wordmark.svg" alt="wTerm" width="540" />
</p>

A desktop IDE for working with multiple projects and multiple long-running terminals from a single window. Built for agent CLI workflows — `claude`, `aider`, dev servers, test watchers — but it works fine as a general terminal multiplexer too.

A project sidebar on the left, real terminals (and a file editor) in the center, and file tree + Git/GitHub on the right.

![macOS](https://img.shields.io/badge/macOS-arm64-black) ![Windows](https://img.shields.io/badge/Windows-x64-0078D6) ![Electron](https://img.shields.io/badge/Electron-42-47848F) ![React](https://img.shields.io/badge/React-19-61DAFB) ![HeroUI](https://img.shields.io/badge/HeroUI-v3-7c3aed) ![Tailwind](https://img.shields.io/badge/Tailwind-v4-06B6D4)

## What it does

- **Project sidebar.** Add folders as projects. Each one expands to reveal its open terminals.
- **Many terminals per project, all alive at once.** xterm.js + node-pty per terminal. Switching projects or terminals doesn't kill anything — your `vim`, `claude`, `npm run dev`, etc. keep running. Output you didn't see arrives in the terminal's buffer.
- **Background-bell notifications.** When a backgrounded terminal rings the BEL (which Claude Code, aider, npm prompts, etc. do when they want input), you get a native OS notification (macOS and Windows). Clicking it focuses the window and jumps straight to that terminal.
- **Sidebar unread dots.** A pulsing sky-blue dot marks terminals waiting for you. If the project is collapsed, the dot aggregates onto the project row so you don't lose it.
- **Built-in file editor.** Open a file from the tree and it loads in a CodeMirror 6 editor with syntax highlighting for the common languages, tabbed files, and ⌘S/Ctrl+S to save. Markdown files toggle between source and a GitHub-flavored preview.
- **Right sidebar: files + Git + GitHub.** A recursive file tree (create / rename / delete / reveal), a Git panel with branch and ahead/behind, and GitHub integration — sign in with device flow or a PAT, then list and merge pull requests for the current branch and watch / rerun / cancel Actions runs without leaving the app.
- **Configurable terminal startup command.** Set a command (or multi-line script) in Settings to run automatically in every newly created terminal.
- **Persistent layout.** Projects, terminal names, the selected project, and the active terminal per project all survive quit/restart. (PTY processes themselves don't — the OS can't reparent child processes across app launches.)
- **Single Halcyon theme.** One hand-tuned deep-navy palette across the app chrome, terminal, and editor. Font stack leads with the bundled `MesloLGS NF` so Powerlevel10k powerline glyphs render correctly.
- **Native escape hatch.** Per-project "Open in Terminal" / "Open in file manager" — iTerm on macOS, Windows Terminal on Windows — for when you want a standalone terminal window or to poke at the filesystem.

## Stack

- **Electron 42** — shell, native APIs, notifications, PTY ownership
- **React 19** — renderer UI
- **HeroUI v3** — component library (React Aria under the hood, Tailwind v4 styling)
- **Tailwind v4** via `@tailwindcss/vite`
- **xterm.js 6** + `@xterm/addon-fit` — terminal rendering
- **node-pty** — pseudo-terminal subprocess management
- **CodeMirror 6** — file editor + syntax highlighting
- **react-markdown** + **remark-gfm** — GitHub-flavored markdown preview
- **Zustand** — renderer-side state
- **electron-vite 5** — bundler with main/preload/renderer HMR

No separate backend process. The Electron main process handles PTY lifecycle, project state, and persistence directly.

## Architecture

```
src/
├── main/                          Electron main process (Node)
│   ├── index.ts                   Window + app lifecycle
│   ├── ipc/                       IPC handlers: projects, terminals, system, dialog, fs, git, github
│   ├── pty/                       node-pty lifecycle, output coalescing, shell integration
│   ├── github/                    Device-flow auth (safeStorage) + REST client
│   └── store/state.ts             Debounced atomic JSON persistence
├── preload/index.ts               contextBridge — exposes typed window.api
├── renderer/                      React app
│   └── src/
│       ├── app.tsx
│       ├── components/sidebar/        Project list + expandable terminal sub-items
│       ├── components/workspace/      TerminalPane, CodeMirror editor, markdown preview, file tabs
│       ├── components/right-sidebar/  File tree, Git panel, GitHub auth + PRs + Actions runs
│       ├── hooks/
│       ├── lib/theme.ts               Halcyon theme + CodeMirror theme
│       └── state/                     Zustand stores (workspace + settings)
└── shared/types.ts                Shared types + IPC channel names
```

State lives at `state.json` in Electron's `userData` dir — `~/Library/Application Support/wTerm/` on macOS, `%APPDATA%/wTerm/` on Windows. Writes are debounced (500ms) and atomic (tmp + rename); `before-quit` flushes any pending save before `app.exit()`. Editor and terminal settings (including the startup command) live in renderer `localStorage`; GitHub tokens are encrypted via Electron `safeStorage`.

All terminals across all projects stay mounted as absolutely-positioned siblings; only the one matching `(selectedProject, activeTerminalInThatProject)` is visible. This is how scrollback survives navigation — `xterm.js` instances aren't torn down when you switch.

## Development

Requires Node 20+ and pnpm 9+. Development is best on macOS arm64 (PTY behavior matches the prod target most closely), but `pnpm dev` runs on Windows x64 too.

```bash
pnpm install            # also rebuilds node-pty against Electron's Node ABI
pnpm dev                # main + preload + renderer with HMR
pnpm typecheck          # tsc on both project references
pnpm build              # production bundles → out/
pnpm dist:mac           # macOS DMG  → release/{version}/
pnpm dist:win           # Windows NSIS installer → release/{version}/
```

If `pnpm install` doesn't download the Electron binary (rare pnpm-10 quirk), run `node node_modules/electron/install.js` once.

## Install (end-user)

Grab the latest installer from the [Releases](../../releases) page:

- **macOS (Apple Silicon)** — `wTerm-<version>-arm64.dmg`
- **Windows (x64)** — `wTerm-<version>-x64-setup.exe`

**macOS.** The DMG is signed with an Apple **Developer ID** certificate and **notarized by Apple**, so it opens normally — no Gatekeeper right-click workaround needed. Open the DMG, drag **wTerm** to **Applications**, and launch it.

**Windows.** The NSIS installer is **unsigned**, so SmartScreen shows "Windows protected your PC" on first launch — click **More info** → **Run anyway**. It creates Start Menu and desktop shortcuts.

To build a macOS DMG yourself you'll need your own Apple Developer ID signing identity (and notarization credentials) configured for `electron-builder`, or to disable signing/notarization in `package.json`.

## Keyboard shortcuts

On Windows, use `Ctrl` in place of `⌘`.

| Shortcut | Action |
|---|---|
| ⌘T | New terminal in the selected project |
| ⌘W | Close the active terminal |
| ⌘S | Save the active file in the editor |
| Double-click project name | Rename project |
| Double-click terminal name | Rename terminal |

## Roadmap

Things this doesn't do yet but probably should:

- **Daemonized PTYs** so running commands survive app restart (would need a separate long-lived process)
- **Split view** (two terminals side-by-side within one project)
- **Auto-update** — currently you grab new installers from the Releases page by hand
- **Linux support** — currently macOS arm64 and Windows x64 only
- **Code signing on Windows** — installer is unsigned, SmartScreen prompts on first launch

## License

Personal project. No license yet — ask before reusing.
