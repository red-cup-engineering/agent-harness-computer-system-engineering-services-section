# Claude Code Harness Legacy Recovery

This map compares the maintained Claude harness services with the historical
material under `lib/legacy/`. A legacy file is evidence about an earlier
capability, not source code for the maintained system.

The parent section's `HISTORICAL-DISPOSITION.md` classifies the complete
snapshot set, duplicates, adjacent provider holdings, and retired-tool evidence.

## Recovered capabilities

| Capability | Maintained implementation | Legacy evidence |
| --- | --- | --- |
| Named colleague roster generated from office records | `services/claude-harness-projection-service/src/projector.mjs` | `2026-08-27-inference-locus-corpus/generating-the-claude-harness/SKILL.md` |
| Incumbency-backed session characters for root and colleague offices | `services/claude-harness-projection-service/src/projector.mjs` | Remote PyFARS office and harness tasks under `2026-08-27-inference-locus-corpus/remote/` |
| Exact generated-agent content checks | The office installer's `--check` mode, called by `checkExactRoster` | Generator requirements that the seated agent remain byte-identical to a fresh office projection |
| Machine-owned permission projection | `services/claude-harness-projection-service/src/permissions.mjs` | Cairn's broader live-harness configuration intent |
| Owner-scoped declarative lifecycle hooks | `services/claude-harness-projection-service/src/hooks.mjs` plus Bare Cedar Fog's lifecycle policy and metadata-only observer | Cairn's separation of `SessionStart`, `UserPromptSubmit`, and `Stop`, with executable legacy bodies excluded |
| Bounded static per-prompt orientation | Bare Cedar Fog's `emit-claude-short-reminder.mjs`, sourced from the maintained harness policy and capped at 512 UTF-8 bytes | The useful `additionalContext` output shape from Cairn's prompt ingress, without prompt capture or remembered claims |
| Privacy-bounded session activity | `services/session-transcript-dialects-service` plus Bare Cedar Fog's `claude-session-activity-provider` | Cairn `capture.mjs` and `capture-hook.mjs` capture intent, with their content-retention behavior removed |
| Privacy-bounded tool-request observations | Bare Cedar Fog's `claude-session-activity-provider/src/observe-tool-invocations.mjs` | Cairn's tool-call capture intent, reduced to tool name, transport, time, and digested identities with no execution claim |

## Classified but not recoverable

Dynamic context handoff is not currently admitted. The legacy sources are raw
session artifacts and derived memory with no maintained authority-owning source
record or disclosure contract. A future handoff would require an opt-in,
source-bounded, size-bounded record that cannot manufacture authority from
remembered text; until that substrate exists, there is nothing safe to project.

## Historical behavior not to transplant

- Cairn's `capture-hook.mjs` and `prompt-ingress.mjs` retain raw prompts, tool
  arguments, and assistant output at fixed machine paths. The maintained
  transcript seam deliberately exposes none of that content.
- `session-start-inject.mjs` injects an unbounded persisted HTML artifact into
  model context without current source, authority, or size admission.
- `dream.mjs` and `lifecycle.mjs` append derived claims through experimental
  gates. Their memory model is not an admitted harness capability.
- `conductor.mjs`, the modeled swarm, and the cognitive MCP tool surface are
  agent-system or multi-agent controller experiments, not single-agent
  harness projection.
- `enactors.mjs` routes directly among historical free inference endpoints.
  Provider execution belongs to the maintained inference-service boundary.

These exclusions preserve the useful engineering intent—deterministic
projection, lifecycle seams, observation, and bounded context—without
reviving raw-content retention, hidden state, controller authority, or stale
provider routing.
