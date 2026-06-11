# Auto-Update — Design

**Date:** 2026-06-11
**Status:** Approved (pending spec review)

## Problem

wTerm has no auto-update. New versions require a manual download of the DMG/EXE.
We want the app to update itself from GitHub Releases: check on launch, download
silently in the background, and prompt the user to restart when an update is ready.
A manual "Check for updates" action is also wanted.

## Decisions (from brainstorming)

- **Platforms:** macOS **and** Windows.
- **Delivery:** silent background download, then a non-intrusive **"Update ready —
  Restart"** prompt. Installs on quit/restart.
- **Check timing:** on launch **and** a manual "Check for updates" button.
- **Source:** public GitHub Releases of `ddnazzah/wTerm` (no token needed to pull).
- **Library:** `electron-updater` (the standard for electron-builder apps).

## Prerequisites already satisfied

- macOS builds are **Developer ID signed + notarized** (v0.1.2) — required for mac
  auto-update.
- A release workflow already builds the mac DMG + win NSIS and uploads them to a
  GitHub Release.

> Note: the git remote still points at the old name `terminal-workspace.git`;
> GitHub redirects it, but the canonical repo is `ddnazzah/wTerm` and that is what
> the updater config uses.

## Architecture

Four areas change: build config, release workflow, main-process updater, renderer UI.

### 1. Build config (`package.json` → `build`)

- Add a publish provider so electron-builder emits update manifests:
  ```json
  "publish": { "provider": "github", "owner": "ddnazzah", "repo": "wTerm" }
  ```
  With this present, the build generates `latest-mac.yml` and `latest.yml` even
  under `--publish never` (they are written to the output dir, just not uploaded).
- **macOS target** becomes `["dmg", "zip"]`. electron-updater updates macOS from the
  **zip**; the dmg remains the first-time download. The zip is signed/notarized by
  the existing pipeline (see workflow note below).
- **Windows** NSIS already supports electron-updater — no target change.

### 2. Release workflow (`.github/workflows/release.yml`)

Keep the existing "build with `--publish never`, then a separate job uploads by glob"
model. **Extend the upload globs** so the GitHub Release also contains the files the
updater reads:

- macOS: `latest-mac.yml`, `*.zip`, `*.zip.blockmap`
- Windows: `latest.yml`, `*.exe`, `*.exe.blockmap`

The signing/notarization step must cover **all** mac artifacts (the zip too), not just
the dmg — verify this when implementing.

### 3. Main process — `src/main/updater.ts` (new)

- New dependency: `electron-updater`.
- `initAutoUpdater(win: BrowserWindow): void`, called once after the main window is
  ready:
  - **Guard `if (!app.isPackaged) return`** — electron-updater throws in dev (no
    `dev-app-update.yml`), so it is a no-op under `npm run dev`.
  - `autoUpdater.autoDownload = true`
  - `autoUpdater.autoInstallOnAppQuit = true`
  - `autoUpdater.checkForUpdates()` on launch.
  - Event wiring, each forwarded to the renderer over IPC as an `UpdateStatus`:
    - `checking-for-update` → `{ state: 'checking' }`
    - `update-available` → `{ state: 'downloading', version }`
    - `update-not-available` → `{ state: 'up-to-date' }`
    - `download-progress` → `{ state: 'downloading', percent }`
    - `update-downloaded` → `{ state: 'ready', version }`
    - `error` → `{ state: 'error', message }`
- IPC handlers:
  - `updates:check` → `autoUpdater.checkForUpdates()` (manual button; no-op + returns
    `{ state: 'dev' }` when not packaged so the UI can disable gracefully).
  - `updates:install` → `autoUpdater.quitAndInstall()`.

### 4. Renderer UI

- **Update-ready prompt:** a small banner/toast shown when status becomes `ready`,
  with the new version and a **Restart** button → `window.api.updates.install()`.
  Dismissible; reappears on next launch since the download is already staged.
- **Settings → Check for updates:** a button that calls `window.api.updates.check()`
  and reflects status text: *Checking… / Up to date / Downloading NN% / Ready to
  install / Error*. Disabled with a "dev build" hint when `state === 'dev'`.
- A tiny `useUpdates()` hook subscribes to the status IPC channel and exposes
  `{ status, check, install }` to both surfaces.

### 5. IPC & types (`src/shared/types.ts`, `src/preload/index.ts`)

- Add `IPC.updates = { check: 'updates:check', install: 'updates:install', status: 'updates:status' }`.
- Add:
  ```typescript
  export type UpdateState =
    | 'idle' | 'checking' | 'up-to-date' | 'downloading' | 'ready' | 'error' | 'dev'
  export interface UpdateStatus {
    state: UpdateState
    version?: string
    percent?: number
    message?: string
  }
  ```
- Preload exposes:
  ```typescript
  updates: {
    check: () => Promise<UpdateStatus>,
    install: () => void,
    onStatus: (cb: (s: UpdateStatus) => void) => () => void,
  }
  ```

## Data flow

1. App launches (packaged) → `initAutoUpdater` → `checkForUpdates()`.
2. electron-updater fetches `latest-mac.yml` / `latest.yml` from the GitHub Release.
3. If newer: auto-downloads the zip (mac) / exe (win), emitting `download-progress`.
4. On `update-downloaded`: main sends `{ state: 'ready', version }` → renderer shows
   the Restart prompt.
5. User clicks Restart → `updates:install` → `quitAndInstall()` relaunches into the
   new version. (If they don't, `autoInstallOnAppQuit` applies it on next quit.)
6. Manual button → `updates:check()` runs the same flow on demand.

## Error handling

- All `autoUpdater` errors are caught and surfaced as `{ state: 'error', message }`;
  the app keeps running normally (auto-update never blocks startup).
- Not-packaged / dev → `state: 'dev'`, UI disables the check button with a hint.
- Network failure on check → `error` state; retried on next launch or manual check.

## Testing

Auto-update **cannot be unit-tested or verified in dev** — it requires a packaged,
signed app talking to a real GitHub Release. Verification plan:

1. Typecheck gate (`npm run typecheck`) and a successful `npm run build`.
2. Live, release-gated end-to-end test (manual, post-merge):
   - Cut and publish a `v0.1.3` test release via the workflow (with the new globs).
   - Install `0.1.2`, launch it, and confirm: detects 0.1.3 → downloads → shows the
     Restart prompt → relaunches into 0.1.3.
   - Repeat on Windows.

This is explicitly an operator-run step, not something verifiable on the dev machine.

## Out of scope (YAGNI)

- Staged/percentage rollouts or release channels (beta/stable).
- Delta updates beyond electron-updater's built-in blockmap diffing.
- In-app changelog rendering (just show the version number).
- Linux auto-update (no Linux target currently shipped).
