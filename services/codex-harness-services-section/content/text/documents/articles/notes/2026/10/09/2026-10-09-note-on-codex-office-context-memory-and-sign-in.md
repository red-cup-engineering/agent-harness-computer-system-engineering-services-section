---
title: Note on Codex office context, memory and sign-in
date-created: 2026-10-09
tags:
- codex-harness
- projection
- office-context
- memory
- sign-in
---

A Codex session on Bare Cedar Fog receives its office context from a briefing the section's own projector writes. The briefing is source context only, never runtime authority (`services/codex-harness-projection-service/src/projector.mjs`, header comment and `authority: "source-context-only"` in `.codex/office.json`).

## The failure

On 2026-10-09 a Codex CEngO session ran `scripts/project-office-context.mjs` inside the `workspace-write` sandbox. The projector wrote its temporary file at `/home/emsenn/info/.codex/office-context.md.2.tmp` and failed with EROFS. The sandbox holds the workspace's `.codex` directory read-only, so no process inside it can write there, whatever the projector does. The briefing on disk was the one from 2026-10-08 23:59, and the session started without current context. The projector's atomic write (temporary file beside the target, then rename) cannot work in a read-only directory, and it reported a bare filesystem error rather than saying the briefing was stale.

## The theory of the repair

- A briefing is a pure function of source records: the office, its duties and its skills. A current briefing needs no write. Confirming currency is a read.
- Projection belongs before the sandbox or into a path the sandbox may write. The binding owns that choice, because the binding is where the machine's configuration lives and the projector is generic.
- A stale briefing that cannot be written is a distinct, reportable state, not a filesystem error.

## What changed

In `services/codex-harness-projection-service`:

- `src/projector.mjs`: `projectOfficeContext` compares the new text with the target and returns `written: false` without touching the filesystem when they are equal. When a write fails with EROFS, EACCES or EPERM it throws an error with code `OFFICE_CONTEXT_STALE` that names the target and the two remedies.
- `scripts/project-office-context.mjs`: the binding may carry `target`, resolved against the binding's directory, default the sibling `office-context.md` as before. A stale, unwritable briefing exits 3 with the message and no stack.
- `test/office-context.test.mjs`: a current briefing in a read-only directory is confirmed unwritten; a stale one raises `OFFICE_CONTEXT_STALE` and leaves the prior briefing intact.

In the project carrier (`/home/emsenn/info/.codex`, the project-scoped Codex configuration):

- `office.json` names `target: ../.office-context/office-context.md`. That directory is in the workspace, outside `.codex`, and ignored by its own `.gitignore`. A session in the sandbox can regenerate the briefing there.
- `config.toml` developer instructions point at the new path and state the exit-3 meaning. The stale briefing at the old path was removed.

The projector and its tests live only in the house snapshot. `red-cup-engineering/computer-services-section` main holds no `codex-harness-projection-service`, so there is no org-repository tree to branch a pull request from; carrying the service into that repository, with its actuators, is a separate act and is returned as a slice.

## Memory

Rule `no-harness-private-memory` forbids Codex a private memory. `.codex/config.toml` already holds `features.memories = false`, `memories.generate_memories = false` and `memories.use_memories = false`. `/home/emsenn/.codex/memories_1.sqlite` exists and holds no memories: `stage1_outputs` and `jobs` have zero rows, and the only content is the migrations table and one `consolidation_progress` row. The user-level `config.toml` (a link to the Windows copy `C:\Users\emsen\.codex\config.toml`) carries no memory settings, so a Codex session started outside a trusted project directory is not covered; the project setting binds sessions in this workspace only. Changing the Windows file is the Leader's decision, since it governs every Codex project on the machine.

## Codex MetroPlat sign-in

The Codex MCP returned AuthRequired because Codex has no password principal. The Claude harness has one: organ `bare-cedar-fog-claude-sign-in` (platform `metroplat`, a `password:<sha256>` account, username `emsenn.claude`, `of` the Claude character), with the password held as a named credential and rendered into `claude-harness.env` (`561-group-services-section/lib/agency/organs/bare-cedar-fog-claude-sign-in.json`; red-cup-engineering/computer-services-section#131). By the same structure a Codex sign-in needs:

1. An organ `bare-cedar-fog-codex-sign-in` on the character `bare-cedar-fog-codex` (`actor:NbEkNFALJ-DGHuaHksujM0a3w5aWbIkQ0wW6Jrmgslg`), platform `metroplat`, with its password-principal account and username. The principal is being issued by hai-zhou; this note does not create it.
2. A named credential for its password, held by bare-cedar-fog and rendered into a `codex-harness.env`, never into the repository or `~/.codex`.
3. A carrier for the token. Codex has no `headersHelper`; its streamable-HTTP MCP servers take a bearer token from an environment variable or fixed headers. The token is therefore obtained by the sign-in flow in #131 before the session starts and handed to the session's environment, and a long session outlives the token unless the launcher refreshes it. The node's launcher (`src/codex-exec.mjs` `startArguments`, which already passes `mcp_servers.<name>.required`) is the place it attaches.

Until the organ exists, a Codex session reaches MetroPlat only through the machine client or not at all.

## Open

- Whether Codex honors `memories` keys from a project-scoped config, or only from the user-level file, is not established here.
- The pre-session projection for node-launched worktrees, where `.codex/office-context` is absent because it is generated, is not wired into worktree opening. A worktree session regenerates the briefing at the new target on its first run of the script.
