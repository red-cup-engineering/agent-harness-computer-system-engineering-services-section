# Session-end scratch release (proposal, not wired)

Proposed 2026-10-25, after the Leader: "it's wild that you will create gigabytes
of scratchpad shit a day and then just, leave it". Nothing below is installed.

## What is true today

Claude Code keeps a session's working data at
`/tmp/claude-1000/<project slug>/<session id>/` (its `scratchpad/` and `tasks/`).
Nothing removes it when the session ends. The only remover is the codex-home
service's scratch scope on its hourly timer, by age: two days, or six hours
while the Windows volume behind the WSL disk is under its floor
(codex-home-service CH-16, CH-18). Until 2026-10-25 that scope never ran,
because the retention scope before it failed on every run and ended the process
(codex-home-service CH-31 now runs scopes independently), and the workspace's
Claude root was in no list. It is listed in the Bare Cedar Fog record now, and
a running session's folder is kept by its `--session-id` / `--resume` (CH-32).

The hooks installed are `SessionStart`, `SubagentStart`, `UserPromptSubmit`
(house context, `~/.claude/settings.json`) and `PreToolUse` (section custody and
host resource, the workspace's `.claude/settings.local.json`). There is no
`SessionEnd` or `Stop` hook. `content/requirements/a-claude-code-session-opens-and-moves-work-for-each-agent-it-dispatches.json`
records that `SessionEnd` and `SubagentStop` never reach the node; a `SessionEnd`
hook was wired for session presence on 2026-07-04 (`src/session-presence.mjs`) and
is not in today's settings. The house holds no research or requirement for
sessions removing their own scratch at their end.

## Proposal

A `SessionEnd` hook (not `Stop`, which fires after every turn) that asks the
codex-home service to retire this one session's folder at once, through the
same proof the timer uses, instead of deleting it:

1. The hook reads `session_id`, `cwd` and `reason` from its stdin payload and
   names the folder `<scratch root>/<session_id>` for the scratch root the
   codex-home record declares for the project (never a path built from `cwd`).
2. It calls a one-entry entrance of codex-home-service (to be added: today its
   scratch scope retires by age only) that runs the existing decision with the
   idle limit set to zero. The entry stays when it is declared kept, open in
   another process, has a filesystem mounted inside, holds a git checkout with
   uncommitted changes or commits on no remote, or belongs to a process that
   still carries the same session id (a resumed or forked session). A held entry
   is left for the timer, which applies the same guards by age.
3. It never runs `rm -rf` itself, never reads `/home/emsenn/bare-cedar-fog`, and
   exits 0 whatever it decides, so an ending session is not delayed by it.
4. It is installed the way the house-context and host-resource hooks are, by a
   harness installer with a dry-run, not by editing settings by hand.

## Why it stops here

- The one-entry entrance does not exist in codex-home-service yet.
- A session that ends can be resumed, and `--resume` expects the scratchpad it
  left. Removing at the end therefore replaces the owner-approved bound (two days,
  six hours under pressure) with a shorter one. That is the Leader's decision,
  not an agent's.
- Installing the hook edits `~/.claude/settings.json`, which holds the
  Leader's own settings; the installers merge and preserve unrelated hooks, and
  this one should be added through them.

## Receiving condition

With the hook installed, a session that ends with no held checkout leaves no
folder under its scratch root within a minute, a session with an unpushed
checkout leaves exactly that folder and the timer's note names the reason, and
a session still running under the same id is untouched.
