# Session todos

A background job reads recent Claude Code sessions and suggests things the user
must do. wTerm shows them in a global Todos tab, grouped Now / Tomorrow / Future.

## Flow

```
launchd (login + every 30 min)
  -> collect.mjs: read new transcript bytes, build a trimmed digest
  -> claude -p (Haiku, no tools, no session saved): structured todos
  -> append to session-todos/suggestions.jsonl
wTerm main
  -> watch suggestions.jsonl, import, write session-todos/todos.json
  -> push todos:changed to the Todos tab
```

Everything lives in `<userData>/session-todos/`:

| File | Writer | Purpose |
| --- | --- | --- |
| `suggestions.jsonl` | collector | Append-only `add` and `resolve` events |
| `state.json` | collector | Per-transcript byte cursors, tracked open todos |
| `status.json` | collector | Last run, last success, last error |
| `todos.json` | wTerm | Todo records and the import offset |

## Decisions

- **One writer per file.** The collector never touches wTerm's files, so a user's
  tick cannot be overwritten and todos still accumulate while wTerm is closed.
- **Not in `state.json`.** The mobile bridge broadcasts the whole `AppState`, so
  todos stored there would reach the phone. Phone support is out of scope.
- **Todos appear immediately.** There is no approval queue; the user dismisses
  wrong ones. Dismissed and done todos are never reopened by a later import.
- **A due date decides the bucket.** A todo with a `dueDate` sits in Future until the
  day before, Tomorrow that day, and Now from the day itself. Tomorrow and Future
  otherwise just mean later.
- **Dated todos go to Apple Reminders, one way.** wTerm owns the sync because it
  owns todo status. Each open dated todo gets a reminder in a `wTerm` list, alerting
  at 9am on the day, so macOS alerts even with wTerm closed. Closing the todo
  completes the reminder. Ticking a reminder changes no todo, and a deleted reminder
  is not recreated. macOS only.
- **One todo per title.** Sessions often discuss the same job, so an exact title
  match against any tracked todo is dropped, whichever session raised it.
- **Tomorrow rolls over.** A `tomorrow` todo shows under Now from the local day
  after it was created. This is derived at display time, not stored.
- **Sessions can close their own todos.** The collector tells the model which
  todos are open for a session, so it does not repeat them and can report them
  resolved. Without this the Now list goes stale.
- **Send to board is manual and lands in Backlog.** A card body can become a
  worker prompt, and todo text derives from transcripts, so it must never reach
  Ready without the user choosing to move it.

## Trust boundaries

Transcripts are untrusted input to the model, and model output is untrusted input
to everything after it.

- The model runs with no tools, so injected instructions cannot act.
- Obvious secrets are redacted before the digest leaves the machine.
- The collector accepts only session ids present in the digest and resolve ids
  it is tracking for that session.
- wTerm revalidates every event on import. `sessionId` must be a UUID because it
  is interpolated into a shell command when a session is resumed.
- The notification carries only a count, never model text.
- Todo text reaches AppleScript only as `osascript` arguments, never inside the
  script, so a crafted title stays plain text.

## Failure behaviour

- A failed model call does not advance cursors, so the next run retries.
- Digest overflow leaves the newest sessions' cursors in place for the next run.
- `status.json` records the error and the tab shows a banner. The tab also warns
  when the last success is old, or when the collector has never run.
- A torn or malformed line in `suggestions.jsonl` is skipped, never fatal.
- A failed reminder sync shows a banner in the tab and retries on the next change,
  collector run, or launch.

## Not included

Phone support, an approval queue, manual todo creation, moving todos between
buckets, and a count badge on the top-bar button. The job does not run while the
Mac is off.
