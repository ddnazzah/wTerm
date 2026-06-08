# wTerm 0.1.2

A release for wTerm — a multi-project, multi-terminal workspace IDE — focused on making the app run correctly on Windows, shipped as a clean signed-and-notarized macOS build through the corrected release pipeline.

## Downloads

- **macOS (Apple Silicon)** — `wTerm-0.1.2-arm64.dmg`
- **Windows (x64)** — `wTerm-0.1.2-x64-setup.exe`

## What's changed in 0.1.2

- **Windows support** — the app now runs correctly on Windows, which was built on macOS and carried several platform assumptions:
  - Default shell is now **PowerShell** on Windows (override via `WTERM_SHELL`) instead of a hardcoded `/bin/zsh`.
  - "Open in Terminal" / "Open in Explorer" use **Windows Terminal** (PowerShell fallback) instead of the macOS-only `open -a iTerm`.
  - Toast **notifications** now fire reliably (AppUserModelId set on Windows).
  - **Title bar** renders native min/max/close controls via a title-bar overlay on Windows/Linux.
  - **Keyboard hints** show `Ctrl+…` off macOS instead of the `Cmd` glyphs.
  - `pnpm install` no longer exits non-zero on Windows when the optional `node-pty` rebuild is skipped.
- **Release pipeline fixes** — corrected the CI asset globs so the macOS DMG and Windows installer are reliably attached to the GitHub Release.
- **Signed + notarized macOS build** — the macOS DMG is built with an Apple **Developer ID** certificate and **notarized by Apple**, so it opens with no Gatekeeper workaround.

## macOS install instructions

The macOS build is signed with an Apple **Developer ID** certificate and **notarized by Apple**, so it opens normally — no Gatekeeper workarounds needed.

1. Open the DMG and drag **wTerm** to **Applications**.
2. Launch it from Applications or Spotlight.

That's it — the first launch goes straight through.

## Windows first-launch instructions

The Windows installer is **unsigned**. SmartScreen will show "Windows protected your PC" on first launch:

1. Click **More info**.
2. Click **Run anyway**.

The installer (`wTerm-0.1.2-x64-setup.exe`) is a standard NSIS installer — pick an install location and it'll create Start Menu and desktop shortcuts.

## What's in this build

See the [README](./README.md) for the full feature list. Highlights:

- Multi-project, multi-terminal workspace with persistent layout
- Single hand-tuned Halcyon theme across app chrome, terminal, and editor
- Configurable terminal startup command (runs in every new terminal tab)
- Markdown preview (GitHub-flavored) for `.md` files
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
shasum -a 256 wTerm-0.1.2-arm64.dmg

# Windows (PowerShell)
Get-FileHash wTerm-0.1.2-x64-setup.exe -Algorithm SHA256
```

Compare against the SHA in the release asset list.
