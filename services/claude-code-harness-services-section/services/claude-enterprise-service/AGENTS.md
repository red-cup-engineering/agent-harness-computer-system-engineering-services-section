# bare-cedar-fog-claude-services-section

The stable `urn:ame:bare-cedar-fog-claude` customer enterprise serving Morgan
Sennhauser through Claude Code on bare-cedar-fog (this laptop, this repo's
primary settlement host, `/home/emsenn/info`).

This enterprise's own membrane declares `content/` as its lasting-instances
root. `content/harness/claude-agent-harness.json` is this enterprise's Claude
agent harness policy: the actor id, the root office a session here already
holds (`executive-officer-to-the-leader` — never projected as a subordinate
colleague), and the exact roster of colleague offices this harness projects
as named, fully-primed subagents.

`scripts/project-claude-agent-harness.mjs` activates the policy: it hires
Red Cup Engineering's `claude-harness-projection-service` (the Claude Code
harness field's own runtime projector — see
`lib/emsenn/services/561-group/services/red-cup-engineering/services/software-services-section/services/model-services-section/services/logical-inference-services-section/services/llm-services-section/services/anthropic-services-section/services/claude-services-section/services/claude-code-services-section/services/claude-code-harness-services-section/`)
to install each colleague office as a subagent at the repository root's
`.claude/agents/`, by calling installing-claude-as-an-agent once per office —
never by writing an agent file here, never by inventing a substitute
projector. This enterprise provides configuration only.

Standing law this projection exists to enforce (Leader correction,
2026-07-28): a session may dispatch only a named agent already projected into
`.claude/agents/` from a defined office. The repository root's own
`.claude/hooks/agent-dispatch-gate.mjs` is the mechanized half of that law —
it denies an `Agent` dispatch whose `subagent_type` is not in this harness's
projected roster, read from `.claude/.claude-agent-manifest`.

Run `npm run project:agent-harness` (or `node scripts/project-claude-agent-harness.mjs`)
from this package to (re)install the roster after a change to the policy or
to any colleague office record. `npm run check:agent-harness` verifies the
installed roster is exactly the policy's roster and nothing more.

## ActivityPub network face

This enterprise has a real Union Actor face at
`https://bare-cedar-fog.561.group/actors/claude`, served the same way the
codex enterprise's face is: Red Cup Engineering's
`activitypub-services-section` provider (Fedify, chain-custody state on
`eip155:5615610`), seated as the user unit
`bare-cedar-fog-claude-activitypub.service` (port 19864) on the
network-custody host `cold-red-gate`, routed by `claude:19864` in the site's
`ACTIVITYPUB_PROVIDER_ROUTES`. The unit's source of truth is
`lib/systemd/bare-cedar-fog-claude-activitypub.service`;
`scripts/seat-claude-activitypub-face.sh` (run from the laptop) installs
keys, unit, and route idempotently and prints live-network receipts.
`src/activitypub-network-mcp.mjs` (bin
`serve-claude-activitypub-network-mcp`, registered in the repo root's
`.mcp.json`) is the session's MCP bridge to that face: observe the claude
actor/inbox/outbox, observe UFTN entry surfaces, and make bounded exchanges
with other Union Actors. Actor identity keys and the inbox bearer token live
in `~/.config/red-cup-engineering/bare-cedar-fog-claude/` on both hosts,
never in this repo.
