# Agent Session Restore — Design

## Context

wTerm restores only Claude tabs today, and only when wTerm itself launched
`claude` with an injected `--session-id` (see `pty/claude-session.ts`). A
terminal where the user *typed* an agent by hand — `claude`, `cursor-agent`,
`aider`, etc. — is not restored: on restart the PTY is gone and the tab drops.

The user wants: "if I have 10 terminals running agents, reopen wTerm and get
those 10 back, resumed." It must work for **any** agent, not just Claude, and be
clean + unbreakable.

Two approaches were ruled out:
- **`CLAUDE_CODE_SESSION_ID` env var** — verified empirically that Claude ignores
  it in both `-p` and interactive PTY mode (only the `--session-id` *flag*
  works). So we cannot pin an id onto a hand-typed command via the environment.
- **Per-agent / per-shell command wrappers** that inject a unique id — fragile,
  agent-specific, against the clean/unbreakable goal.

## Approach: capture-and-replay

wTerm already installs shell integration (`pty/shell-integration.ts`) emitting
OSC 133 `C`/`D` markers from `preexec`/`precmd`. The `preexec` hook already has
the command line in hand (zsh `$1`, bash `$BASH_COMMAND`, fish `$argv`). We
extend it to also report **what command is running and in which folder**, and on
restart we **re-run that command in that folder** so the agent resumes itself.

### 1. Capture (shell-integration.ts)
Extend each shell's `preexec` hook to emit, alongside OSC 133 `C`:
```
ESC ] 697 ; Cmd ; <base64(commandline)> ; <base64($PWD)> BEL
```
(base64 to survive arbitrary command text / spaces / quotes.) The existing
`precmd` OSC 133 `D` already signals "command finished".

### 2. Track (renderer → main)
In `terminal-pane.tsx`, register an xterm OSC handler for `697` (xterm
reassembles split chunks for us). On `Cmd`, decode and call a new IPC
`terminals:running-command(projectId, id, { command, cwd } | null)`. On the
existing OSC 133 `D` (command finished) send `null`. Main stores the current
running command on the in-memory PtyManager entry / terminal record.

### 3. Persist (state.ts + types.ts)
Add to `TerminalRecord`: `agent?: { command: string; cwd: string }` — the agent
command that was running, with its absolute cwd. `writeFile` persists any
terminal that has `agent` set (in addition to today's `claudeSessionId` tabs).
The Home workspace stays unpersisted as today.

### 4. Restore (use-projects.ts + a small resume map)
On launch, for each persisted terminal with `agent`, look up the first token of
`agent.command` in the **resume map** (a setting, editable, with safe defaults).
- Matched → recreate the tab with `cwd = relative(projectRoot, agent.cwd)` and
  `startupCommand = <resume form>`.
- Not matched → skip (conservative allowlist; nothing destructive auto-reruns).

Default resume map (editable in Settings → Terminal):
| match | resume command |
|-------|----------------|
| `claude` | `claude --continue` |
| `cursor-agent` | `cursor-agent --resume` |
| `aider` | `aider` |
| `codex` | `codex --continue` |

`claude --continue` resumes the most recent conversation in that folder
(verified). Other defaults are best-effort and user-editable.

### 5. Setting
`Settings → Terminal`: "Restore agent sessions on restart" (default **on**) plus
an editable table of `match → resume` rows. Stored in renderer settings
(localStorage), passed to the restore step.

## Properties
- **General:** any agent the user adds to the map; Claude not special-cased.
- **Unbreakable:** rides on existing OSC 133 infra; worst case a tool re-runs
  fresh instead of resuming — never an error or corrupted state. If a shell has
  no integration (`unknown` kind), capture simply doesn't happen and nothing
  restores — same as today.
- **No regression:** the existing `claudeSessionId` startup path is untouched;
  restore handles both (`agent` and `claudeSessionId`).

## Tradeoff (accepted)
Resume fidelity is each agent's own folder-based resume, so two agent tabs in the
*same* folder both resume that folder's latest conversation. Exact for the normal
one-agent-per-project flow.

## Files
- `src/main/pty/shell-integration.ts` — emit OSC 697 from the 3 preexec hooks
- `src/renderer/src/components/workspace/terminal-pane.tsx` — OSC 697 handler + report
- `src/main/pty/manager.ts` — track running command per entry (optional cache)
- `src/main/ipc/terminal.ts` + `src/preload` + `src/shared/types.ts` — `running-command` IPC, `agent` field
- `src/main/store/state.ts` — persist terminals with `agent`
- `src/renderer/src/hooks/use-projects.ts` — restore agent tabs via the map
- `src/renderer/src/state/settings.ts` + `settings-modal.tsx` — resume-map setting + UI

## Verification
Run `pnpm dev`, start `claude` (and a second agent) by hand in two project tabs,
quit, relaunch → both tabs reopen running their resume command in the right
folder. `pnpm typecheck` + `pnpm test`. Manually confirm a tab idling at the
prompt restores nothing, and an unmapped command does not auto-rerun.
