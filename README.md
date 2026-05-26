<p align="center">
  <img src="resources/wordmark.svg" alt="wTerm" width="540" />
</p>

A desktop IDE for working with multiple projects and multiple long-running terminals from a single window. Built for agent CLI workflows — `claude`, `aider`, dev servers, test watchers — but it works fine as a general terminal multiplexer too.

Inspired by the KESA agent workspace, but with real terminals on the right instead of a chat panel.

![macOS](https://img.shields.io/badge/macOS-arm64-black) ![Electron](https://img.shields.io/badge/Electron-42-47848F) ![React](https://img.shields.io/badge/React-19-61DAFB) ![HeroUI](https://img.shields.io/badge/HeroUI-v3-7c3aed) ![Tailwind](https://img.shields.io/badge/Tailwind-v4-06B6D4)

## What it does

- **Project sidebar.** Add folders as projects. Each one expands to reveal its open terminals.
- **Many terminals per project, all alive at once.** xterm.js + node-pty per terminal. Switching projects or terminals doesn't kill anything — your `vim`, `claude`, `npm run dev`, etc. keep running. Output you didn't see arrives in the terminal's buffer.
- **Background-bell notifications.** When a backgrounded terminal rings the BEL (which Claude Code, aider, npm prompts, etc. do when they want input), you get a native macOS notification. Clicking it focuses the window and jumps straight to that terminal.
- **Sidebar unread dots.** A pulsing sky-blue dot marks terminals waiting for you. If the project is collapsed, the dot aggregates onto the project row so you don't lose it.
- **Persistent layout.** Projects, terminal names, the selected project, and the active terminal per project all survive quit/restart. (PTY processes themselves don't — macOS can't reparent child processes across app launches.)
- **Powerlevel10k friendly.** Font stack leads with `MesloLGS NF` so P10k's powerline glyphs render correctly.
- **iTerm escape hatch.** Per-project "Open in iTerm" / "Open in Finder" for when you want a standalone terminal window or to poke at the filesystem.

## Stack

- **Electron 42** — shell, native APIs, notifications, PTY ownership
- **React 19** — renderer UI
- **HeroUI v3** — component library (React Aria under the hood, Tailwind v4 styling)
- **Tailwind v4** via `@tailwindcss/vite`
- **xterm.js 6** + `@xterm/addon-fit` — terminal rendering
- **node-pty** — pseudo-terminal subprocess management
- **Zustand** — renderer-side state
- **electron-vite 5** — bundler with main/preload/renderer HMR

No separate backend process. The Electron main process handles PTY lifecycle, project state, and persistence directly.

## Architecture

```
src/
├── main/                          Electron main process (Node)
│   ├── index.ts                   Window + app lifecycle
│   ├── ipc/                       IPC handlers: projects, terminals, system, dialog
│   ├── pty/manager.ts             node-pty lifecycle, output coalescing
│   └── store/state.ts             Debounced atomic JSON persistence
├── preload/index.ts               contextBridge — exposes typed window.api
├── renderer/                      React app
│   └── src/
│       ├── app.tsx
│       ├── components/sidebar/    Project list + expandable terminal sub-items
│       ├── components/workspace/  TerminalPane (xterm.js wrapper)
│       ├── hooks/
│       └── state/store.ts         Zustand store
└── shared/types.ts                Shared types + IPC channel names
```

State lives at `~/Library/Application Support/wTerm/state.json`. Writes are debounced (500ms) and atomic (tmp + rename). `before-quit` flushes any pending save before `app.exit()`.

All terminals across all projects stay mounted as absolutely-positioned siblings; only the one matching `(selectedProject, activeTerminalInThatProject)` is visible. This is how scrollback survives navigation — `xterm.js` instances aren't torn down when you switch.

## Development

Requires Node 20+, pnpm 9+, and macOS arm64 (for now).

```bash
pnpm install            # also rebuilds node-pty against Electron's Node ABI
pnpm dev                # main + preload + renderer with HMR
pnpm typecheck          # tsc on both project references
pnpm build              # production bundles → out/
pnpm dist:mac           # full DMG → release/{version}/
```

If `pnpm install` doesn't download the Electron binary (rare pnpm-10 quirk), run `node node_modules/electron/install.js` once.

## Install (end-user)

```bash
pnpm dist:mac
open release/0.1.0/wTerm-0.1.0-arm64.dmg
```

Drag **wTerm** to **Applications**. First launch: right-click the app → **Open** → **Open** in the dialog (the app is signed with a personal self-signed certificate, so Gatekeeper doesn't recognize the authority and asks once). After that it launches normally and macOS treats it as a known app for permission persistence.

The build is signed with a local self-signed identity (`Dieu-Donne Nazzah (Personal)`) held in the developer's login Keychain. Anyone else cloning this repo to build will need to either remove `build.mac.identity` from `package.json` or substitute their own.

## Keyboard shortcuts

| Shortcut | Action |
|---|---|
| ⌘T | New terminal in the selected project |
| ⌘W | Close the active terminal |
| Double-click project name | Rename project |
| Double-click terminal name | Rename terminal |

## Roadmap

Things this doesn't do yet but probably should:

- **Daemonized PTYs** so running commands survive app restart (would need a separate long-lived process)
- **Split view** (two terminals side-by-side within one project)
- **Custom theming** — terminal palette derived from HeroUI tokens
- **Linux / Windows support** — currently arm64 macOS only
- **Code signing + notarization** — first-launch needs the right-click bypass without it

## License

Personal project. No license yet — ask before reusing.
