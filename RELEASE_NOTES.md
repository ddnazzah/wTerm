# wTerm 0.3.0

A feature release for wTerm — a multi-project, multi-terminal workspace IDE. This build adds a **phone companion** (drive your terminals from your phone over Tailscale), **agent session restore for any agent** (reopen `claude`/`cursor-agent`/`aider` tabs already resumed), plus window zoom, a redesigned settings panel, and a side-by-side docked editor.

## Downloads

- **macOS (Apple Silicon)** — `wTerm-0.3.0-arm64.dmg`
- **Windows (x64)** — `wTerm-0.3.0-x64-setup.exe`

If you're on 0.1.3 or later, the app updates itself — you'll get 0.3.0 automatically.

## What's changed in 0.3.0

- **Work from your phone.** wTerm runs a small local web server and serves a mobile web app (PWA) that attaches to your live terminals — read output, run commands, and create / kill / rename terminals or switch projects, all kept in sync with the desktop. Reach it from anywhere over a private [Tailscale](https://tailscale.com) network (no public exposure). Pair once with a 6-digit code / QR in **Settings → Mobile**, and get a Web Push notification when a backgrounded terminal needs attention. Optionally keep the Mac awake while a phone is connected.
- **Agent session restore (any agent).** If a terminal was running an agent — `claude`, `cursor-agent`, `aider`, … — when you quit, wTerm reopens that tab on the next launch and re-runs the agent in the same folder so it resumes where you left off. It works for agents you type by hand, captured via shell integration, with an editable `name = resume command` map in **Settings → Terminal**. (Pinned Claude `--session-id` tabs still resume exactly as before.)
- **Quieter, sharper agent status.** The "needs input" notification now fires only when an agent actually returns to the prompt — long tool runs no longer trip false alarms. The sidebar shows a glow only while an agent is working and a clear cue when it's waiting on you.
- **Window zoom** — `⌘=` / `⌘-` / `⌘0` zoom the whole window; the factor persists.
- **Redesigned settings** — a VS Code-style category rail (Appearance, Terminal, Editor, Formatting, Mobile, Updates, About).
- **Side-by-side docked editor** and **collapsible Git / PR / Actions sections** in the right sidebar.

## macOS install instructions

The macOS build is signed with an Apple **Developer ID** certificate and **notarized by Apple**, so it opens normally — no Gatekeeper workarounds needed.

1. Open the DMG and drag **wTerm** to **Applications**.
2. Launch it from Applications or Spotlight.

That's it — the first launch goes straight through, and the app keeps itself up to date from here on.

## Windows first-launch instructions

The Windows installer is **unsigned**. SmartScreen will show "Windows protected your PC" on first launch:

1. Click **More info**.
2. Click **Run anyway**.

The installer (`wTerm-0.3.0-x64-setup.exe`) is a standard NSIS installer — pick an install location and it'll create Start Menu and desktop shortcuts.

## Setting up the phone companion

1. Install Tailscale on this Mac and your phone (same account).
2. Expose the bridge over HTTPS once: `tailscale serve --bg 8788` (needs MagicDNS + HTTPS certificates enabled in the Tailscale admin console).
3. On your phone, open the address shown in **Settings → Mobile** and enter the pairing code (or scan the QR).

HTTPS is required so the phone app can register a service worker, install to the home screen, and receive push notifications.

## What's in this build

See the [README](./README.md) for the full feature list. Highlights:

- Phone companion over Tailscale with Web Push (new in 0.3.0)
- Agent session restore for any agent (new in 0.3.0)
- Window zoom, redesigned settings, side-by-side docked editor (new in 0.3.0)
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
shasum -a 256 wTerm-0.3.0-arm64.dmg

# Windows (PowerShell)
Get-FileHash wTerm-0.3.0-x64-setup.exe -Algorithm SHA256
```

Compare against the SHA in the release asset list.
