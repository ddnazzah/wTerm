# wTerm 0.1.3

A release for wTerm — a multi-project, multi-terminal workspace IDE — that adds in-app **auto-update**, so future versions install themselves instead of being downloaded by hand.

## Downloads

- **macOS (Apple Silicon)** — `wTerm-0.1.3-arm64.dmg`
- **Windows (x64)** — `wTerm-0.1.3-x64-setup.exe`

## What's changed in 0.1.3

- **Auto-update** — the installed app now checks GitHub Releases on launch (and hourly), downloads new versions in the background, and shows a "Restart to update" banner. If you don't restart, the update installs on the next quit.
  - A manual **Check for updates** control lives in **Settings ▸ Updates**, alongside the current version and live status.
  - macOS updates ship through the existing **Developer ID-signed + notarized** build (Squirrel handles the swap); Windows updates run the NSIS installer.
  - **Note:** this is the first build that contains the updater, so 0.1.3 itself is a manual install. Auto-update takes effect from 0.1.3 onward — a 0.1.3 user is updated to 0.1.4 automatically.
- **Release pipeline** — the build now also publishes the electron-updater feed (`latest-mac.yml`, `latest.yml`, the macOS update `.zip`, and blockmaps) to each GitHub Release so installed apps can discover new versions.

## macOS install instructions

The macOS build is signed with an Apple **Developer ID** certificate and **notarized by Apple**, so it opens normally — no Gatekeeper workarounds needed.

1. Open the DMG and drag **wTerm** to **Applications**.
2. Launch it from Applications or Spotlight.

That's it — the first launch goes straight through, and the app will keep itself up to date from here on.

## Windows first-launch instructions

The Windows installer is **unsigned**. SmartScreen will show "Windows protected your PC" on first launch:

1. Click **More info**.
2. Click **Run anyway**.

The installer (`wTerm-0.1.3-x64-setup.exe`) is a standard NSIS installer — pick an install location and it'll create Start Menu and desktop shortcuts.

## What's in this build

See the [README](./README.md) for the full feature list. Highlights:

- Auto-update from GitHub Releases (new in 0.1.3)
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

## Verifying the download (optional)

```bash
# macOS / Linux
shasum -a 256 wTerm-0.1.3-arm64.dmg

# Windows (PowerShell)
Get-FileHash wTerm-0.1.3-x64-setup.exe -Algorithm SHA256
```

Compare against the SHA in the release asset list.
