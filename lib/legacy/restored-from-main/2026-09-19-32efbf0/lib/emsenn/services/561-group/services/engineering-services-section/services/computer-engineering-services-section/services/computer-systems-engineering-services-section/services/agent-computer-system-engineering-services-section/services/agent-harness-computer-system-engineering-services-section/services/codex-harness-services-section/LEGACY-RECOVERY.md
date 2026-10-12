# Codex Harness Legacy Recovery

The two holdings under `lib/legacy/` preserve variants of the same historical
TypeScript package. They are evidence, not competing maintained services.

The parent section's `HISTORICAL-DISPOSITION.md` classifies the wider Codex
snapshot lineage, exact duplicates, operations debris, and adjacent holdings.

## Recovered or superseded capabilities

| Historical intent | Maintained boundary |
| --- | --- |
| Configure Codex for a project | `services/codex-harness-projection-service` projects an allowlisted disposable `.codex` tree to an explicit target and checks drift |
| Project lifecycle handlers | `projectCodexHooks` merges an explicitly supplied owner slice while preserving unrelated project hooks |
| Expose enterprise actions to Codex | `services/codex-actuator-client-service` selects bounded digest-bearing evidence and uses an injected transport without owning a platform server |
| Seat enterprise offices as Codex agents | `services/codex-office-agent-projection-service` renders project-scoped custom agents from maintained office records |

## Historical behavior not to transplant

- `codex_config` reads and mutates an implicit user-level
  `~/.codex/config.toml`. Maintained projection requires an explicit target and
  does not claim the user's ambient Codex home.
- `codex_process` supervises a persistent warm `codex mcp` child, carries
  mutable process state across requests, and exposes raw JSON-RPC. That is a
  platform/process-supervision service, not a single-agent harness capability.
- `operations_manifold_request` provides arbitrary loopback HTTP GET/POST.
  Open-world transport and provider routing belong to their owning platform
  services, not the harness.
- The legacy MCP hub combines configuration mutation, process supervision,
  transport, and agent access in one controller. The maintained services keep
  projection and bounded actuation independently addressable.

No eligible single-agent Codex harness capability remains unclassified or
unrecovered in the preserved holdings.
