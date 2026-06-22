# wTerm 0.3.2

A small patch release for wTerm — a multi-project, multi-terminal workspace IDE. This build sharpens the project sidebar so project names read clearly at rest.

## Downloads

- **macOS (Apple Silicon)** — `wTerm-0.3.2-arm64.dmg`
- **Windows (x64)** — `wTerm-0.3.2-x64-setup.exe`

If you're on 0.1.3 or later, the app updates itself — you'll get 0.3.2 automatically.

## What's changed in 0.3.2

- **Brighter project sidebar.** Unselected project names were dim enough to be hard to read; they now sit at a higher contrast (with a clearer hover state) while the selected project stays distinct.

## macOS install instructions

The macOS build is signed with an Apple **Developer ID** certificate and **notarized by Apple**, so it opens normally — no Gatekeeper workarounds needed.

1. Open the DMG and drag **wTerm** to **Applications**.
2. Launch it from Applications or Spotlight.

That's it — the first launch goes straight through, and the app keeps itself up to date from here on.

## Windows first-launch instructions

The Windows installer is **unsigned**. SmartScreen will show "Windows protected your PC" on first launch:

1. Click **More info**.
2. Click **Run anyway**.

The installer (`wTerm-0.3.2-x64-setup.exe`) is a standard NSIS installer — pick an install location and it'll create Start Menu and desktop shortcuts.

## What's in this build

See the [README](./README.md) for the full feature list. Highlights:

- Phone companion over Tailscale with Web Push
- Agent session restore for any agent (`claude`, `cursor-agent`, `aider`, …)
- Window zoom, redesigned settings, side-by-side docked editor
- Monaco code editor with docked / floating / full-screen view modes
- Git-aware file tree with keyboard navigation
- Drag-to-reorder projects
- Auto-update from GitHub Releases
- Multi-project, multi-terminal workspace with persistent layout
- Single hand-tuned Halcyon theme across app chrome, terminal, and editor
- Built-in GitHub integration

## Known limitations

- macOS: Apple Silicon only (no Intel build)
- Windows: x64 only (no ARM build)
- No Linux build
- The phone companion needs wTerm running on an awake Mac, plus Tailscale on both ends.
- Agent restore only reopens tabs that had a mapped agent **running** at quit; a tab idling at a prompt restores nothing. Two agent tabs in the same folder resume that folder's latest conversation.

## Verifying the download (optional)

```bash
# macOS / Linux
shasum -a 256 wTerm-0.3.2-arm64.dmg

# Windows (PowerShell)
Get-FileHash wTerm-0.3.2-x64-setup.exe -Algorithm SHA256
```

Compare against the SHA in the release asset list.
