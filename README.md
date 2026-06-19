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
- **Agent session restore.** If a terminal was running an agent (`claude`, `cursor-agent`, `aider`, …) when you quit, wTerm reopens that tab on the next launch and re-runs the agent in the same folder so it resumes where you left off. It works for *any* agent you type by hand: shell integration captures the running command per tab, and a small editable map in **Settings → Agent restore** says how each one resumes (e.g. `claude = claude --continue`). Only listed agents are restored; a tab idling at a prompt restores nothing. Toggle the whole feature off in Settings.
- **Single Halcyon theme.** One hand-tuned deep-navy palette across the app chrome, terminal, and editor. Font stack leads with the bundled `MesloLGS NF` so Powerlevel10k powerline glyphs render correctly.
- **Native escape hatch.** Per-project "Open in Terminal" / "Open in file manager" — iTerm on macOS, Windows Terminal on Windows — for when you want a standalone terminal window or to poke at the filesystem.
- **Auto-update.** The installed app checks GitHub Releases on launch (and hourly), downloads new versions in the background, and shows a "Restart to update" banner — otherwise the update installs on next quit. macOS updates are delivered through the signed + notarized build; there's also a manual "Check for updates" in Settings.
- **Work from your phone.** wTerm runs a small local web server and serves a mobile web app (PWA) that attaches to your live terminals — read output, type and run commands, and create / kill / rename terminals or switch projects, all kept in sync with the desktop. Reach it from anywhere over a private [Tailscale](https://tailscale.com) network (no public exposure, no port forwarding). Pair once with a 6-digit code or QR shown in **Settings → Mobile**. When a backgrounded terminal needs attention, you get a Web Push notification on your phone.

## Work from your phone

1. Install Tailscale on this computer and your phone (same tailnet).
2. Expose the bridge over HTTPS — once, from a terminal: `tailscale serve --bg 8788`. HTTPS is required so the phone app can register a service worker, install to the home screen, and receive push notifications.
3. On your phone, open the address shown in **Settings → Mobile** (e.g. `https://your-mac.your-tailnet.ts.net`) and enter the 6-digit pairing code (or scan the QR). The pairing token is stored on the phone so you only do this once.
4. Optionally tap **⋯ → Enable notifications** in the phone app (on iOS, add it to your Home Screen first).

The desktop owns the PTYs, so the phone is a live view onto the same terminals — anything you start on your phone keeps running when you're back at your desk, and vice-versa. PTYs still don't survive an app restart (only Claude tabs are restored), same as on the desktop.

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
│   ├── ipc/                       IPC handlers: projects, terminals, system, dialog, fs, git, github, bridge
│   ├── pty/                       node-pty lifecycle, output coalescing, shell integration
│   ├── bridge/                    Mobile bridge: HTTP+WS server, client fan-out, pairing/VAPID (safeStorage), web-push, tailscale
│   ├── github/                    Device-flow auth (safeStorage) + REST client
│   ├── sync.ts                    Pushes state to the desktop renderer after phone-initiated changes
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

pwa/                               Mobile web app (PWA), served by src/main/bridge — xterm.js + WS client,
                                   service worker for Web Push. Built to out/pwa via `pnpm build:pwa`.
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
- **Linux support** — currently macOS arm64 and Windows x64 only
- **Code signing on Windows** — installer is unsigned, SmartScreen prompts on first launch

## License

Personal project. No license yet — ask before reusing.
