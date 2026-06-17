# wTerm 0.2.0

A feature release for wTerm — a multi-project, multi-terminal workspace IDE. This build brings a full **Monaco-based code editor**, a **git-aware file tree**, **project reordering**, and **Claude session auto-resume** — close the app and your Claude conversations come back, already resumed.

## Downloads

- **macOS (Apple Silicon)** — `wTerm-0.2.0-arm64.dmg`
- **Windows (x64)** — `wTerm-0.2.0-x64-setup.exe`

If you're on 0.1.3 or later, the app updates itself — you'll get 0.2.0 automatically.

## What's changed in 0.2.0

- **Claude session auto-resume** — terminal tabs that launched Claude are now remembered across restarts. On the next launch wTerm recreates each tab already resumed into its prior conversation (`claude --resume`), instead of an empty shell. Each tab tracks its own session, so multiple Claude tabs in one project all come back correctly. Bare-shell tabs remain session-scoped (not restored).
- **Monaco editor** — the in-app editor is now powered by Monaco (the editor core from VS Code), replacing CodeMirror. Syntax highlighting across a wide language set, a Halcyon-matched theme tuned to the app, format-on-save, and offline-bundled language workers.
- **View modes** — open files in a docked split, a floating panel, or full-screen, with a mode switcher in the editor chrome. Editor tabs support `⌘1`–`⌘9` jump and drag-to-reorder; `⌘W` closes the focused file tab.
- **Git-aware file tree** — the right-sidebar file tree colors file names by git status and supports keyboard navigation, rename/delete/new-file, and type-ahead.
- **Project reordering** — drag projects in the sidebar to reorder them; the order persists.

## macOS install instructions

The macOS build is signed with an Apple **Developer ID** certificate and **notarized by Apple**, so it opens normally — no Gatekeeper workarounds needed.

1. Open the DMG and drag **wTerm** to **Applications**.
2. Launch it from Applications or Spotlight.

That's it — the first launch goes straight through, and the app keeps itself up to date from here on.

## Windows first-launch instructions

The Windows installer is **unsigned**. SmartScreen will show "Windows protected your PC" on first launch:

1. Click **More info**.
2. Click **Run anyway**.

The installer (`wTerm-0.2.0-x64-setup.exe`) is a standard NSIS installer — pick an install location and it'll create Start Menu and desktop shortcuts.

## What's in this build

See the [README](./README.md) for the full feature list. Highlights:

- Claude session auto-resume across restarts (new in 0.2.0)
- Monaco code editor with docked / floating / full-screen view modes (new in 0.2.0)
- Git-aware file tree with keyboard navigation (new in 0.2.0)
- Drag-to-reorder projects (new in 0.2.0)
- Auto-update from GitHub Releases
- Multi-project, multi-terminal workspace with persistent layout
- Single hand-tuned Halcyon theme across app chrome, terminal, and editor
- Configurable terminal startup command (runs in every new terminal tab)
- Markdown preview (GitHub-flavored) for `.md` files
- Background-bell notifications (Claude Code, aider, npm prompts wake you)
- Built-in GitHub integration, settings panel
- Powerlevel10k-friendly font stack

## Known limitations

- macOS: Apple Silicon only (no Intel build)
- Windows: x64 only (no ARM build)
- No Linux build
- Session restore covers **Claude** tabs (resumed via `claude --resume`). Other long-running programs in bare shells still don't survive a restart. A Claude session typed manually into a bare shell (rather than launched via the configured startup command) isn't tracked and won't auto-resume.

## Verifying the download (optional)

```bash
# macOS / Linux
shasum -a 256 wTerm-0.2.0-arm64.dmg

# Windows (PowerShell)
Get-FileHash wTerm-0.2.0-x64-setup.exe -Algorithm SHA256
```

Compare against the SHA in the release asset list.
