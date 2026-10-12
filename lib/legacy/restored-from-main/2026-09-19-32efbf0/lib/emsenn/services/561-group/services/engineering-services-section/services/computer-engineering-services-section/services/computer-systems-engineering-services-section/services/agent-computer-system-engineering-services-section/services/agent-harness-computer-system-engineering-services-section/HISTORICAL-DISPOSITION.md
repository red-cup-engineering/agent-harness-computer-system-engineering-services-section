# Agent Harness Historical Disposition

This ledger names the historical agent-harness material that remains outside
the maintained services. It is the closure record for the 2026-08-27 corpus
cleanup: a path omitted from the live service tree is not thereby forgotten,
and a path retained under `lib/legacy/` is evidence rather than executable
fallback code.

The legacy holdings are immutable snapshots. Exact duplicates and generated
artifacts are recorded here instead of being pruned piecemeal from a snapshot.

## Canonical loci

| Locus | Status | Boundary |
| --- | --- | --- |
| This engineering section | recovered | The only maintained single-agent harness implementations: provider-neutral contracts plus Claude and Codex adapters. |
| Paired `agent-harness-science-services-section` | research-only | Canonical dated research and an index of adjacent or legacy evidence. |
| Bare Cedar Fog Claude and Codex services | recovered | Machine-owned policies and consumers of the canonical projectors, not reusable harness implementations. |
| Claude Code and OpenAI provider service sections | adjacent | Provider execution and transport; not harness ownership. |

## Claude historical holdings

| Holding | Classification | Disposition |
| --- | --- | --- |
| `services/claude-code-harness-services-section/lib/legacy/2026-08-17-triage-dev-llm-claude-harness/` | superseded | Preserve the decommissioned TypeScript package. Its `dist/` directory is generated build output retained only because it is part of the immutable snapshot. |
| `services/claude-code-harness-services-section/lib/legacy/llm-claude-harness-typescript-source/` | superseded | Preserve as a materially different package revision; it is not an exact duplicate of the dated triage package. |
| `services/claude-code-harness-services-section/lib/legacy/2026-08-27-inference-locus-corpus/` | recovered and rejected | Primary dated provenance for the Cairn, harness-generation, and remote PyFARS evidence. The roster/projection intent has been recovered; raw capture, durable memory, controller, and provider-routing behavior is rejected in `LEGACY-RECOVERY.md`. |
| `services/claude-code-harness-services-section/lib/legacy/claude-code-harness/` | superseded | Sibling Cairn snapshot: 127 same-relative-path files are byte-identical and six shared records differ. Preserve until a repository-wide archival policy permits provenance-preserving snapshot compaction. |
| Claude provider `claude-code-services-section/lib/legacy/claude-code/` | rejected | Historical SWARM/raw-transcript carrier. It stays with its provider snapshot; no live code depends on it and none of it is an executable fallback. |

The Bare Cedar Fog colleague roster previously read office definitions directly
from the Board's `2026-08-03-executive-office` legacy capture. Those records are
not current organizational authority, and one declared record (`white-army`) no
longer exists. The live roster must remain closed until current office records
are deliberately established outside `lib/legacy/`.

## Codex historical holdings

| Holding | Classification | Disposition |
| --- | --- | --- |
| `services/codex-harness-services-section/lib/legacy/2026-08-17-triage-dev-llm-openai-codex-harness/` | superseded | Preserve the dated TypeScript package; `dist/` is snapshot-bound generated output. |
| `services/codex-harness-services-section/lib/legacy/llm-openai-codex-harness-typescript-source/` | superseded | Preserve as a divergent source revision. Only `src/process.mts` is byte-identical across the two packages. |
| JavaScript services `lib/legacy/organizing-with-openai-codex/` | superseded | Older materially different Codex package revision; no live dependency. |
| OpenAI provider `lib/legacy/2026-08-17-triage-dev-organizing-with-openai-codex/` | superseded | Provider-locus revision with generated output; no live dependency. |
| 561 Group operations `lib/legacy/2026-08-17-triage-dev-ops.561.group/` | rejected and research-only | Whole operations provenance capture. Codex hooks, profiles, traces, plans, `data/state`, and API inventories are historical evidence; persistent supervision and open transport are not harness capabilities. |
| Board executive-office Codex installer copies | superseded | The two installer scripts inside the immutable Board snapshot are byte-identical. They are historical projection evidence, not a maintained installer. |

The exact duplicate OpenAI Agents document in the direct 2026-05 orchestration
holding and the nested 2026-06 archive import is likewise retained as snapshot
provenance rather than treated as two current sources.

## Retired tool copies and research

- Active vendored copies of Aider, Cline, and SWE-agent have been removed.
- The Aider source checkout embedded in the immutable 2026-06-17 engineering
  archive is a third-party snapshot, not a current dependency or maintained
  harness. It is classified as superseded external evidence and must not be
  imported, installed, or executed.
- FARS and personal Aider/Cline/SWE-agent analyses are authored research, not
  copies of those tools. They remain in their owning research loci with their
  original provenance.
- Historical PyFARS Cline workflow material remains inside its enclosing
  immutable snapshots and has no live dependency.

## Adjacent historical research

The former FeltOS `agent-harnesses` paths used by MetroPlat were removed during
corpus consolidation. Surviving material is distributed among curated
relationality legacy snapshots, personal triage, and the canonical harness
science index. MetroPlat must not advertise those vanished paths as a live
research registry. Individual findings can be promoted later into canonical
dated science notes with explicit provenance.

Multi-agent orchestration, agent-platform, OpenClaw, character/persona, and
provider-runtime material remains in its own scientific or operational locus.
It is adjacent evidence, not content to sweep into a single-agent harness merely
because an old path used the word `harness`.

## Closure rules

1. Maintained code may not import, execute, or use `lib/legacy/` as runtime or
   organizational authority. A research inventory may record a legacy path only
   when the field explicitly identifies it as historical provenance.
2. Historical prose may cite a legacy path when it clearly labels the source as
   historical evidence.
3. Generated runtime trees (`.claude`, `.codex`, observations, caches, traces,
   state inventories, and build output) are not maintained source holdings.
4. A duplicate inside an immutable snapshot is classified here, not silently
   deleted from the snapshot.
5. A future recovery must name its source, the maintained owner, and whether the
   historical behavior was recovered, superseded, rejected, research-only, or
   still awaiting extraction.
