# wTerm 0.1.1

A polish release for wTerm — a multi-project, multi-terminal workspace IDE — focused on a refined Halcyon look, a configurable terminal startup command, and Markdown preview.

## Downloads

- **macOS (Apple Silicon)** — `wTerm-0.1.1-arm64.dmg`
- **Windows (x64)** — `wTerm-0.1.1-x64-setup.exe`

## What's new in 0.1.1

- **Halcyon theme** — the UI is now a single, hand-tuned Halcyon theme (a port of `bchiang7/halcyon-vscode`) across the app chrome, terminal, and editor, replacing the earlier theme picker.
- **Halcyon CodeMirror editor theme** — the file editor now matches the app, with consistent syntax highlighting.
- **Terminal startup command** — set a command (or multi-line script) in Settings that runs automatically in every new terminal tab.
- **Markdown preview** — open a rendered preview of `.md` files (GitHub-flavored Markdown) alongside the editor.
- **File viewer / file tree improvements** — refinements to the right-sidebar file tree and file viewer/editor.
- **Terminal & PTY refinements** — stability and behavior improvements in the terminal pane and PTY manager.

## macOS install instructions

The macOS build is signed with an Apple **Developer ID** certificate and **notarized by Apple**, so it opens normally — no Gatekeeper workarounds needed.

1. Open the DMG and drag **wTerm** to **Applications**.
2. Launch it from Applications or Spotlight.

That's it — the first launch goes straight through.

## Windows first-launch instructions

The Windows installer is **unsigned**. SmartScreen will show "Windows protected your PC" on first launch:

1. Click **More info**.
2. Click **Run anyway**.

The installer (`wTerm-0.1.1-x64-setup.exe`) is a standard NSIS installer — pick an install location and it'll create Start Menu and desktop shortcuts.

## What's in this build

See the [README](./README.md) for the full feature list. Highlights:

- Multi-project, multi-terminal workspace with persistent layout
- Background-bell notifications (Claude Code, aider, npm prompts wake you)
- Sidebar unread dots that aggregate to the project row when collapsed
- Powerlevel10k-friendly font stack
- File viewer/editor with CodeMirror, right sidebar for git status & file tree
- Built-in GitHub integration, settings panel

## Known limitations

- macOS: Apple Silicon only (no Intel build)
- Windows: x64 only (no ARM build)
- No Linux build
- PTY processes don't survive app restart (daemonized PTYs are on the roadmap)
- No auto-update — grab new installers from the Releases page

## Verifying the download (optional)

```bash
# macOS / Linux
shasum -a 256 wTerm-0.1.1-arm64.dmg

# Windows (PowerShell)
Get-FileHash wTerm-0.1.1-x64-setup.exe -Algorithm SHA256
```

Compare against the SHA in the release asset list.
