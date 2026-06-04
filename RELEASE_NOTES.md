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

## macOS first-launch instructions

The macOS build is signed with a personal self-signed certificate and is **not notarized by Apple**. Gatekeeper will block it on first launch with one of:

- "wTerm can't be opened because Apple cannot check it for malicious software"
- "wTerm is from an unidentified developer"
- "wTerm is damaged and can't be opened"

### Option A — right-click Open (try this first)

1. Drag **wTerm** to **Applications** from the DMG.
2. In Finder, open **Applications**.
3. **Right-click** (or Control-click) **wTerm** → **Open**.
4. In the dialog, click **Open** again.

You only need to do this once. macOS remembers the choice and future launches go straight through.

### Option B — remove the quarantine flag (use if A doesn't work)

If you see the "damaged and can't be opened" message, Option A won't work — clear the quarantine bit from Terminal:

```bash
xattr -dr com.apple.quarantine /Applications/wTerm.app
```

Then launch normally from Applications or Spotlight.

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
