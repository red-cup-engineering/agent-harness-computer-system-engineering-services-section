# Claude Harness Services Section

This locus is the Claude Code harness field. It does not implement an
agent loop as one controller. It exposes independently addressable operational
Actor models which a durable reaction may discover by recursive specification
and hire for its next enabled proof pore.

The section also owns the Claude Code harness projection
(`src/claude-harness-projection.mjs`), which MetroPlat hosts as its
`claude-harness-project` and `claude-harness-check` verbs. A node’s `.claude/` is
output, read from the agency registry: every skill record becomes a node skill,
every office seated at dignitas that holds skills becomes a named agent (rendered
by installing-claude-as-an-agent), every event the agent-lifecycle-event schema
names is admitted into the hosting MetroPlat’s settlement, and that MetroPlat’s
faces become the node’s MCP servers. Nothing under `.claude/` is written by
hand; the record is the source, and projecting again is the correction.

An explicitly empty colleague roster is valid. It means the root session is
seated but no subordinate office currently has admitted non-legacy authority;
the projector must not manufacture colleagues merely to keep a roster nonempty.

Standing law this section exists to enforce, corrected into place 2026-07-28:
a session may dispatch only a named agent already projected into
`.claude/agents/` from a defined office — never a bare, unprimed model
prompted fresh on the spot. Priming happens once, here, at projection time;
a dispatch spends none of the Leader's attention re-explaining scope, law, or
instruments the projected agent already holds from its own office record.

## Headless carrier

`src/agency-work.mjs` is the work rail's Claude Code carrier: the carrier
contract (agent-harness `src/carrier/`) in the Claude Code dialect
(`src/claude-code-session.mjs`). A duty allocated to the Claude character runs
as one headless `claude -p` session on the subscription this host is signed in
to, in the transient user unit `claude-task-<id>`, with its artifacts under
`<house root>/data/state/claude-tasks/<id>/`. The session:

- wears the allocated office's own projection (`--agents`/`--agent`, rendered
  as installing-claude-as-an-agent renders it);
- reaches only this node's MetroPlat (`--mcp-config` with the projected
  `.mcp.json`, strict), and is stopped if that server does not connect;
- runs in `dontAsk` with tools allowed by its effects: reading for receiving
  and every duty whose method keeps no duty worktree, editing only in its own
  task worktree for one that does (`carrier/workspace.mjs`: a read-only tree per
  task for reading acts, never the shared checkout; a writing act's change is
  committed and named a candidate to the merge queue);
- returns its outcome under the work item's response constraint
  (`--json-schema` from its `returns`);
- is observed, not assumed: the model and effort come from the session's own
  transcript, and the subscription's windows from its rate-limit event.

The host (feltos-enterprise-host `agency-work.mjs`) runs it for
`METROPLAT_CLAUDE_WORKER` carrying `METROPLAT_CLAUDE_MODELS`, bounded to the
offices its character holds and those they preside over. Without those keys the
host composes no Claude carrier.

On Bare Cedar Fog the founder declined the carrier on 2026-10-03, for now and
reversibly: the node's deployment names no Claude worker. It is admitted only on
the founder's word; the switch is recorded in the 561 Group note *Carriers and
capacity* (2026-10-03).

## Field

| Actor | Operation | Boundary |
| --- | --- | --- |
| MetroPlat | `claude-harness-project`, `claude-harness-check` | The agency registry and one MetroPlat settlement to one node's `.claude/` and `.mcp.json` |

## Legacy holdings

`lib/legacy/` keeps the earlier Claude Code harness implementations together
with their provenance. They remain available for feature recovery, but they
are not competing live harness packages.

The `2026-08-27-inference-locus-corpus/` holding preserves the Cairn,
generator, and remote-machine material recovered from the former
inference-provider tree. That material is historical harness engineering, not
an inference service, so its archival home is here.

[`LEGACY-RECOVERY.md`](LEGACY-RECOVERY.md) records which capabilities have
maintained replacements, which recovery is next, and which historical
behaviors must not be transplanted into the live harness.
