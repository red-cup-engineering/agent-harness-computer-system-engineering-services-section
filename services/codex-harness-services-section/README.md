# Codex Harness Services Section

This locus is the OpenAI Codex harness field. It does not implement an
agent loop as one controller. It exposes independently addressable operational
Actor models which a durable reaction may discover by recursive specification
and hire for its next
enabled proof pore.

The section also owns the Codex runtime projector. Machine-specific actors
provide configuration only; this section projects that configuration into a
disposable project-local `.codex` directory. Neither the user-level Codex home
nor a machine actor is a competing harness implementation.

## Durable task dispatch

This section is the service of the codex node micro-enterprise
(`lib/agency/enterprises/codex-node.json`). The node keeps its queue in its own
root, `<settlements root>/codex-node`, and not in the house root (561 Group note
of 2026-09-30, "Micro-enterprises hold their own work", slice 3).

`codex-task` queues its assignment in the node's `codex-tasks` journal and
returns. It does not start the task. The node's own loop does that: its record
names `codex-node-turn` under `turns`, and the host's `enterprise-loops`
schedule runs that operation on every turn. Each turn starts the newly queued
tasks, in turn, as slots free. Codex sessions doing allocated office work (the
work rail's Codex provider) keep their artifacts in the same root, whichever
micro-enterprise's work they do. Tasks and artifacts from before the move are
still read from the house root. The house root also supplies the told fiber
each session wears.

A session runs `codex exec` outside the node's cgroup, in the transient user
unit `codex-task-<id>`. Concurrency is derived from current host cores,
available memory and the admitted usage or provider ceiling.
`METROPLAT_CODEX_CONCURRENCY` overrides it with an explicit positive number.
Each task owns `<node root>/data/state/codex-tasks/<id>/`, which is kept after
completion. It holds `prompt.txt`, `events.jsonl`, `stderr.txt`,
`last-message.txt` and the atomically published `exit-code` completion marker,
and may also hold runner diagnostics.

Every task owns a worktree of its own, `~/.local/state/561-group/codex-worktrees/<task-id>`
(`METROPLAT_CODEX_WORKTREES` moves the root): a detached worktree at `origin/main`
with submodules at their gitlinks, packages linked offline (a read-only task
installs nothing), borrowing the node's objects. Its path is the session's `-C`
and working directory. The shared checkout is the node's live repository and
data root and is never a Codex session's workspace: the exec argument builder
refuses any working directory inside a primary checkout, and when a task's
worktree cannot be opened the task fails and nothing runs. The slot a task holds
is only its place in the provider's concurrency budget. The work rail's Codex
carrier (`codexAgencyWorkProvider`) gives each execution and each receiving act
a worktree the same way, and every session is told its workspace rule
(`CODEX_WORKSPACE_RULE`).

When a task finishes, its trace is rebased onto `origin/main` and pushed. If it
conflicts, the change is replayed whole onto current main with the conflicts
marked, and the task's own session is resumed (`resolution-<n>/` under the task
directory) to resolve them, carrying the change into main's current shape. What
it leaves free of markers is committed with the task's message and joined. A
trace is published as `codex/stranded/<id>` only if it still conflicts, or if it
has no session thread to resume. The trace's `integration.replays` records each
attempt. `codex-task-integrate` is the node's integration service for its own
tasks. Once its change is named a candidate (or it changed nothing) the task's worktree
is removed; a task that failed, or whose trace stranded, keeps it for inspection,
and only the last ten kept worktrees stay. The task's branch stays in the
repository either way. A completed or stranded task frees its slot for the next
queued task.

The node's first turn in a process recovers every task an earlier process left
`queued` or `running`:
- a completion marker is projected into a `done` or `failed` row;
- a still-active unit is awaited;
- work with neither a completion marker nor a live unit is failed as
  interrupted rather than run again.

When user systemd is unavailable, dispatch falls back to an in-process child
that uses the same durable artifacts, and the session result records that
fallback.

## Office context

`project-office-context <binding>` writes a project office's source context to the binding's `target`. Codex's workspace-write sandbox holds `.codex` read-only, so the target lies outside it (Bare Cedar Fog: `.office-context/office-context.md`). A current briefing is confirmed without a write; a stale one that cannot be written exits 3 and must be projected outside the sandbox. See [the 2026-10-09 note](content/text/documents/articles/notes/2026/10/09/2026-10-09-note-on-codex-office-context-memory-and-sign-in.md).

## Desktop app recovery evidence

[The 2026-10-12 recovery note](content/text/documents/articles/notes/2026/10/12/2026-10-12-note-on-recovering-the-codex-desktop-app-when-sessions-will-not-start.md) retains the historical incident observations and repair account. Its app-state assumptions and destructive repair steps need independent qualification against the current app before reuse.

## Field

| Actor | Operation | Boundary |
| --- | --- | --- |
| `codex-harness-projection-service` | `project-codex-harness <configuration> <output>` | One machine actor configuration to an explicit disposable runtime output, plus owned lifecycle-hook slices into an explicit project root; never an implicit user `.codex` tree |
| `codex-office-agent-projection-service` | `install-codex-as-an-agent <office> <node>` | One enterprise office record and its held skills to one project-scoped Codex custom agent |

## Codex enterprise

`services/codex-enterprise-service/` is the Codex enterprise engine: its MCP
server, MAPE office, A2A executor, ActivityPub face and harness projectors. It
reads the enterprise's data from this section: `lib/agency/` (enterprise,
offices, duties, actuators, loci, harness policy, skills, agent card),
`lib/actors/` (the configuration a machine's Codex actor supplies to the
projector), and `data/records/` (work and supplier-exchange records).
`lib/systemd/` holds the unit templates for its ActivityPub and A2A faces.

## Legacy holdings

`lib/legacy/` keeps the earlier Codex harness packages together with their
provenance. They remain available for feature recovery, but they are not
competing live harness packages.

[`LEGACY-RECOVERY.md`](LEGACY-RECOVERY.md) records the completed comparison:
the maintained replacements and the platform, ambient-home, and open-transport
behaviors that must not be revived as harness code.
