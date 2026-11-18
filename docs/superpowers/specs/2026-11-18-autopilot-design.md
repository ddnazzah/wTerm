# Autopilot — sessions that keep working instead of waiting

## Goal

A Claude session in wTerm often finishes a turn by asking the user something whose
answer is obvious ("Shall I write the tests?", "Option A or B? I recommend A").
Every such stop parks the session until the user comes back, and those idle hours are
lost.

Autopilot answers those stops on the user's behalf, taking the recommended route,
until the session's goal is met — then reports once. It stops and asks only for the
things the user's rules reserve for them.

## Decisions

| Question | Decision |
|---|---|
| Where it runs | Inside wTerm, on the existing agent hook server (`src/main/agent/`). |
| What the goal is | **The session's own prompts.** No form. The supervisor reads the user turns from the transcript; the first prompt sets the goal and every later one refines it. |
| How it is switched on | Setting `autopilot.defaultOn` (default **on** once hooks are installed) plus a per-session toggle. Nothing to re-enter per task. |
| How a session is continued | Claude Code's own `Stop` hook contract: the hook answers `{"decision":"block","reason":"<reply>"}` and the agent carries on with `reason` as its next instruction. No keystrokes are typed into the PTY. |
| Who decides | A supervisor: one headless `claude -p` call per stop, on the user's existing login. No API key to manage. |
| What it never decides | Push, PR, merge, force-push, deleting branches/data, credentials, spending money, anything destructive or outward-facing. Those escalate. |

## Flow

```
agent turn ends
  → Claude runs the Stop hook (relay script)
  → relay POSTs to wTerm and WAITS for the answer (Stop only)
  → wTerm: is Autopilot on for this terminal?
       no  → 204, agent stops as today
       yes → supervisor(transcript, decision log) → continue | done | escalate
                continue → 200 {"decision":"block","reason": reply}  → agent keeps working
                done     → 204 + report notification
                escalate → 204 + "needs you" notification with the question
```

## Components

### 1. Relay: answer Stop synchronously (`hook-server.ts`, `hook-settings.ts`)

- The server keeps answering `204` immediately for every event except `Stop` on an
  Autopilot terminal. For that one it holds the request until the supervisor decides.
- The relay script prints the response body to stdout. This is safe because the only
  event that ever gets a body is `Stop`; `UserPromptSubmit` (whose stdout is injected
  into the prompt) always gets `204` and so prints nothing.
- The relay's curl timeout rises from 2s to `SUPERVISOR_TIMEOUT_S + 10`, and the
  installed `Stop` entry carries a matching `timeout`, so Claude does not kill the
  hook first. Connection-refused (wTerm closed) is still instant and still exits 0.
- `parseHookMessage` additionally keeps `transcript_path` for `turnDone`.

### 2. Transcript reader (`src/main/autopilot/transcript.ts`)

Reads the JSONL at `transcript_path` and returns a bounded view:
all user prompts (the goal) and the last assistant turns, capped by a byte budget
(`TRANSCRIPT_BUDGET_BYTES`). Tool results are summarised to one line each.
Unreadable or missing file → error, which the supervisor treats as escalate.

### 3. Supervisor (`src/main/autopilot/supervisor.ts`)

- Spawns `claude -p --output-format json` with the prompt on stdin, from a scratch
  cwd, with `WTERM_TERMINAL_ID` removed from its env (its own hooks then carry no
  terminal id and the server drops them — no recursion). No tools are allowed.
- The user's global `~/.claude/CLAUDE.md` still loads, which is the point: the
  supervisor decides by the same rules the user wrote for themselves.
- Prompt: the goal (user prompts), the recent assistant output, the decision log so
  far, and the escalation list above. It must return JSON:
  `{ action: "continue"|"done"|"escalate", reply: string, summary: string }`.
- Output is schema-checked. Malformed output, non-zero exit, or timeout
  (`SUPERVISOR_TIMEOUT_S`) → **escalate**. The safe failure is "stop and tell the
  user", never "keep going blindly".

### 4. Policy (`src/main/autopilot/policy.ts`) — pure, no I/O

Applied to the supervisor's verdict before it is acted on:
- **Cap:** after `MAX_CONTINUATIONS` replies in one goal, escalate.
- **Loop:** the same reply twice in a row, or the agent's last message unchanged
  since the previous stop, → escalate.
- **User took over:** a `UserPromptSubmit` from the user resets the counters (new or
  refined goal) — it does not switch Autopilot off.

### 5. Session state + report (`src/main/autopilot/store.ts`, renderer)

Per terminal: `enabled`, `continuations`, and the decision log
(`{ at, action, reply, summary }`). In memory, keyed by terminal id; lost on restart
is acceptable for v1.

- **Done** → OS notification "Goal reached: <summary>" and the log is the report.
- **Escalate** → existing `attention` indicator with `detail` = the open question.
- Renderer: an Autopilot badge on the session row, the toggle in its context menu,
  and a popover listing the decision log, so every choice made on the user's behalf
  is visible after the fact.

## Not in scope (v1)

- Answering permission prompts. Autopilot sessions rely on the permission mode
  they were started with; a `Notification` still raises attention as today.
- Board-dispatched workers (they already run to completion).
- Persisting logs across restarts; mobile bridge display.

## Testing

Unit:
- `transcript`: real-shaped JSONL fixtures — goal extraction, budget truncation,
  tool-result summarising, corrupt lines skipped, missing file.
- `supervisor` output parsing: valid verdicts, prose-wrapped JSON, wrong action,
  missing fields → escalate.
- `policy`: cap reached, repeated reply, unchanged agent tail, reset on user prompt.
- `hook-settings`: Stop entry gets `timeout`; install stays idempotent; uninstall clean.

Integration:
- Hook server with a fake supervisor: Stop on Autopilot terminal returns the block
  JSON; Stop on a normal terminal returns 204 immediately; `UserPromptSubmit` never
  returns a body; supervisor timeout returns 204 and raises attention.
- Relay script run against the live server prints exactly the body for Stop and
  nothing otherwise.

Manual (sandbox instance, see wterm-e2e-verification-sandbox): a real Claude session
given a three-step task that asks a question after step one runs to the end and
produces one report.
