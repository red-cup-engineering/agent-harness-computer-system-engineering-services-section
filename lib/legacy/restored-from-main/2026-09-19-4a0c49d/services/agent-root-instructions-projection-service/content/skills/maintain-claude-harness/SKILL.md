---
name: maintain-claude-harness
description: Change how Claude sessions and their subagents behave here (rules, skills, agents, hooks, permissions, workflows, root instructions) at the authored source that owns each surface, then reproject; never edit a generated file. Load before touching anything under .claude/, ~/.claude/, or a harness policy JSON.
---

# Maintain the Claude harness from its authored sources

A ruling that lives only in a session dies with it, and a ruling typed into a
generated file dies at the next projection. Put each behavior where its owner
is, run the projector, and check the projection. Codex has the same shape:
`maintain-codex-harness`. Both harnesses are thin consumers of the shared
sources below; never mirror one harness's implementation into the other or make
one runtime harness depend on the other.

## What is authored, and where a ruling goes

| Behavior | Authored owner (edit here) | Projected output (never edit) |
| --- | --- | --- |
| How engineering is done (method rows, one attempt then altitude, replace early-alpha code) | `agent-root-instructions-projection-service/content/engineering-method.md` in agent-harness-computer-system-engineering-services-section | the managed block between `BEGIN/END Bare Cedar Fog managed engineering method` markers in `~/.claude/CLAUDE.md` and `CODEX_HOME/AGENTS.md` |
| Shared root-instructions law (conversation style, repository posture, semantic-duplication policy, the house-law pointer list, the standing "never any rush" framing, the bootstrap skill) | `agent-root-instructions-projection-service/content/shared-house-law.json` | `AGENTS.md` sections; the Claude root instructions read the same law |
| House law (how work is done, org layering, import stratification, session bootstrap) | `.claude/rules/*.md` (authored carriers, named by the shared law's `houseLaw` pointers) | none; they are read directly and linked from projections |
| Procedures (skills) | `content/skills/<name>/SKILL.md` under `agent-root-instructions-projection-service` (in agent-harness-computer-system-engineering-services-section) is the authored carrier for these shared skills, verified directly against `shared-source-roots.mjs`'s `instructionProjection`, which reads exactly this directory and stamps a `Generated from ... Edit the package source.` header onto each copy it writes out | each harness's own skill projection: `.claude/skills/<name>/SKILL.md` for Claude, `.agents/skills/<name>/skill.md` for Codex — both carry the stamped header and are discarded and rewritten on the next projector run |
| Claude agent roster, spawn discipline, root office and seating | `bare-cedar-fog-claude-services-section/content/harness/claude-agent-harness.json` (plus offices under `content/offices`, characters and incumbencies at bare-cedar-fog-services-section `content/`) | `.claude/agents/*.md`, `.claude/.claude-agent-manifest` |
| Lifecycle hooks | `bare-cedar-fog-claude-services-section/content/harness/claude-lifecycle-hook-policy.json` | the `hooks` block of `.claude/settings.json` |
| Permissions | `bare-cedar-fog-claude-services-section/content/harness/claude-permission-policy.json` | the `permissions` block of `.claude/settings.json` |
| Workflows | `.claude/workflows/*.js` (authored operators) | none |
| MCP servers | `.mcp.json` (owner-directed roster) | none |
| Repository `CLAUDE.md` | authored by hand at the repo root; the enterprise installer splices only its marked standing block | the marked block only |

A ruling about engineering approach goes in the engineering method. A ruling
about how the house works goes in the rule file the shared law already points
at. A procedure goes in its skill. A change to who is dispatched, what runs on
a hook, or what is permitted goes in the policy JSON. Nothing goes in a lot
brief that should reach every session: the brief restates law only for the
current lot's gates.

When an applicable rule identifies a concrete architectural violation and its replacement, repair the shared owner directly.

## Reproject after every source change

From bare-cedar-fog-claude-services-section:

```text
npm run project:agent-harness   # roster, manifest, and ~/.claude/CLAUDE.md managed method
npm run project:hooks
npm run project:permissions
npm run check:agent-harness && npm run check:hooks && npm run check:permissions
```

From bare-cedar-fog-codex-services-section, `npm run project:agent-harness`
regenerates `AGENTS.md`, `.agents/skills`, `.codex/config.toml`, and
`CODEX_HOME/AGENTS.md`. A change to the engineering method or the shared law
is a change to `@red-cup-engineering/agent-root-instructions-projection-service`:
publish it through `publish-package`, repin both harness sections to the exact
new version, then reproject both. A projection that prints a refusal names a
stale source; repair that source, never the output it complains about.

## Forward tests

- A ruling stated in a session appears in the authored owner from the table,
  and both projections reflect it after one projector run each.
- `git diff` after a projector run touches only generated outputs; an
  authored edit made to a generated file is discarded by the next run.
- The zero-agent harness (owner-directed): `agents.enabled` is false, the
  colleague roster is empty, `.claude/agents` does not exist, and
  `check:agent-harness` passes; a commissioned worker is a founder-ordered
  exception recorded on the work rail, not a rostered office.
- A lot brief that restates the engineering method is defective; the method
  reaches the lot through `~/.claude/CLAUDE.md`.
