# Terminal Workspace 0.1.0

First public build. Apple Silicon only (`arm64`).

## Download

`Terminal-Workspace-0.1.0-arm64.dmg`

## First-launch instructions (important)

This build is signed with a personal self-signed certificate and is **not notarized by Apple**. macOS Gatekeeper will block it on first launch with one of:

- "Terminal Workspace can't be opened because Apple cannot check it for malicious software"
- "Terminal Workspace is from an unidentified developer"
- "Terminal Workspace is damaged and can't be opened" (Apple Silicon, after download)

You have two ways to get past this. Pick one.

### Option A — right-click Open (try this first)

1. Drag **Terminal Workspace** to **Applications** from the DMG.
2. In Finder, open **Applications**.
3. **Right-click** (or Control-click) **Terminal Workspace** → **Open**.
4. In the dialog, click **Open** again.

You only need to do this once. macOS remembers the choice and future launches go straight through.

### Option B — remove the quarantine flag (use if A doesn't work)

If you see the "damaged and can't be opened" message, Option A won't work — the quarantine bit needs to be cleared from Terminal:

```bash
xattr -dr com.apple.quarantine /Applications/Terminal\ Workspace.app
```

Then launch normally from Applications or Spotlight.

## What's in this build

See [README](./README.md) for the full feature list. Highlights:

- Multi-project, multi-terminal workspace with persistent layout
- Background-bell notifications (Claude Code, aider, npm prompts wake you)
- Sidebar unread dots that aggregate to the project row when collapsed
- Powerlevel10k-friendly font stack

## Known limitations

- macOS arm64 only (no Intel, Linux, or Windows builds)
- PTY processes don't survive app restart (daemonized PTYs are on the roadmap)
- No auto-update — grab new DMGs from the Releases page

## Verifying the download (optional)

```bash
shasum -a 256 Terminal-Workspace-0.1.0-arm64.dmg
```

Compare against the SHA in the release asset list.
