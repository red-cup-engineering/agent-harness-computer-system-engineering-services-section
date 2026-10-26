# Session-end scratch release

Leader, 2026-10-25: "it's wild that you will create gigabytes of scratchpad shit a
day and then just, leave it", and then: a timer or clock is the wrong design;
expiry shall fire on events, at session end and on a capacity or pressure crossing.

## Event sources

| Event | Source | State |
| --- | --- | --- |
| A Claude Code session ends | `SessionEnd` hook, `src/session-end-scratch-hook.mjs` | wired by `scripts/install-session-end-scratch-hook.mjs` |
| Free space crosses `headroom.floorBytes` (VM, or the Windows volume behind the disk image) | none | missing |
| Memory or I/O pressure (PSI trigger) | none | missing |

## SessionEnd (wired)

Claude Code keeps a session's working data at
`/tmp/claude-1000/<project slug>/<session id>/`. The hook reads `session_id` and
`reason` from its payload, finds the session's own process from the
`--session-id=` / `--resume` on its command line, and starts, detached,
`codex-home retire --session=<id> --after-pid=<pid>` (codex-home-service CH-35). The
hook removes nothing itself, waits for nothing, and exits 0 whatever happens.

`retire` waits for that process to exit (it still holds its folder while SessionEnd
fires), then runs the scratch scope's decision for that one folder with no idle wait.
The folder stays, and is left for the scratch scope, when it is kept by the record,
has a filesystem mounted inside, is open in another process, belongs to a process
still carrying the same session id, or holds a git checkout with uncommitted changes
or commits on no remote. The id is a plain name, never a path. A `/clear` or resume
ends an id inside a process that keeps running and is skipped.

The hook runs from an installed copy (default
`~/.local/lib/561-group/session-end-scratch-hook/`), so a checkout change cannot
remove it, and refers to the installed codex-home service and its record. The
installer merges into `~/.claude/settings.json`, keeps unrelated hooks and a
`.before-session-end-scratch-hook` backup, is idempotent, and has `--dry-run` and
`--uninstall`.

Before this, the hooks installed were `SessionStart`, `SubagentStart`,
`UserPromptSubmit` (house context) and `PreToolUse` (section custody, host
resource); a `SessionEnd` hook was wired for session presence on 2026-07-04
(`src/session-presence.mjs`) and was not in the settings.

## Capacity and pressure (missing)

- Free space has no change notification: neither ext4 inside the VM nor the Windows
  volume (a 9P mount) offers an event for it, and the one authoritative reading of the
  Windows volume (wsl-host `observeBackingVolumeCapacity`) starts `powershell.exe`,
  which the host forbids.
- A PSI trigger (`/proc/pressure/io` or `memory` opened for write with a threshold,
  then polled for `POLLPRI`) is an event, but needs a long-running listener; Node has
  no `POLLPRI` poll, so it would be a small Python or C helper rendered as a user unit
  by the codex-home service. It would call `codex-home apply --scope=scratch`. Not
  built; PSI measures stall, not the capacity floor the Leader named.
- Until a capacity event source exists, the only thing that crosses the floor is the
  existing hourly unit, which this work leaves as it was; retiring it belongs to the
  session that owns the host's clocks.
