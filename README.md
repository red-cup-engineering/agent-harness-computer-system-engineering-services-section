# Agent Harness Computer System Engineering Services Section

<!-- 561-group-standards:badges:start -->
[![Red Cup Engineering](https://img.shields.io/badge/561%20Group-Red%20Cup%20Engineering-c0392b)](https://github.com/red-cup-engineering)
[![License: MIT](https://img.shields.io/badge/license-MIT-c0392b)](LICENSE)
[![Indigenous data: CARE](https://img.shields.io/badge/Indigenous%20data-CARE-4b6f44)](https://github.com/red-cup-engineering/.github/blob/main/GOVERNANCE.md)
[![Tips welcome](https://img.shields.io/badge/tips-welcome-d4a017)](https://github.com/561-group/.github/blob/main/TIPS.md)
<!-- 561-group-standards:badges:end -->

This section engineers the reusable systems which equip and constrain one
agent computer system at its runtime boundary. An agent harness projects the
agent's configuration, capabilities, offices, permissions, and observations;
it is not itself an agent platform or a multi-agent system.

Provider-neutral harness mechanisms and provider-specific runtime adapters
live together here so their shared contracts can be tested without placing
harness engineering beneath an inference provider.

## Services

- `src/carrier/` is the carrier contract of the work rail: one durable
  agent-CLI session runner (`session.mjs`: task artifacts, transient user
  units, the provider's host-wide capacity lease, carry-on and recovery) and
  the contract an allocated office duty is executed and independently received
  through (`agency-carrier.mjs`: execution, office-bound authority, receiving,
  outcome accounting, allowance). Each CLI is a dialect of the runner.
- `src/host-resource-hook.mjs` is the host-resource controller: one zero-dependency PreToolUse
  hook on Bash, shared by Claude Code and Codex, that denies the commands that exhaust a machine
  (`find` over the disk or a home, `git worktree add`, `git clone` outside a scratchpad, unscoped
  `git status`/`log --all`/`ls-files`/`submodule update` in a large repository) and runs the disk-
  and CPU-heavy ones one at a time under a host-wide `flock`, at `nice 10` and idle I/O class. It
  fails open and never waits itself. The node projection (`claude-harness-project`) writes it into
  `.claude/` and `.codex/`; `scripts/install-host-resource-hook.mjs` installs a reference to the
  same owning source for one user where no projection runs. `--settings` selects the configuration;
  the former copied-hook `--dest` is retired. Unrelated handlers in shared groups are retained.
- `codex-harness-services-section` owns the Codex dialect (`codex exec`), the
  Codex node's durable task rail and the Codex runtime projection.
- `claude-code-harness-services-section` owns the Claude Code dialect
  (`claude -p`), its headless carrier, and the Claude Code roster and
  permission projection.

Machine-specific policies remain with their machines. Generated `.codex` and
`.claude` trees, session observations, caches, and deployment state are
runtime material rather than source holdings of this section.

Research about agent harnesses lives in the paired AI science section at
`artificial-intelligence-science-services-section/services/agent-science-services-section/services/agent-harness-science-services-section/`.

Historical implementations, retired-tool evidence, duplicate snapshots, and
recovery decisions are accounted for in
[`HISTORICAL-DISPOSITION.md`](HISTORICAL-DISPOSITION.md). Maintained code must
not use those legacy holdings as executable fallback or current authority.

Run each changed package's existing direct `check` and `test` commands, plus
its pack command when the package is distributed. The section does not wrap
those contracts in an aggregate command.

## Reusable distribution and historical capture custody

The `files` contract distributes the maintained source, scripts, schemas and
provider subtrees. Nested package manifests, import maps, algorithms, bins,
normative records and synthetic conformance seeds retain their existing
ownership and distribution. A directory called `legacy`, `data` or `services`
is not by itself a reason to exclude its contents.

One inspected historical stream is instance material:
`services/claude-code-harness-services-section/lib/legacy/2026-08-27-inference-locus-corpus/2026-05-28-cairn/articulating/library/aperiodic-articulation-category/hacking/library/claude-code/capturing/capturing.jsonl`.
The colocated `.npmignore` excludes exactly this stream both when the parent
harness is packed and when the nested Cairn package is packed independently.
The stream remains unchanged in its original repository custody. Its schema
and pure capturing morphism remain distributed; a synthetic test stream is
created only in a temporary test directory, never substituted for the original.

The historical `capture.mjs` transduces handler/payload input into claims and
appends them to that stream; the snapshot's capture hook and transcript reader
also write it, and its prompt, dream and conductor paths read it. These are
historical instance I/O, not package-install requirements or maintained
callers. Maintained `src/` and `scripts/` do not import that stream. Installing
the reusable package neither provisions this history nor enables the old
capture loop. Any future recovery must first allocate explicit instance input,
output, custody and caller-migration contracts to a maintained owner. This
packaging correction does not revive or change the historical algorithms.

`test/package-capture-boundary.test.mjs` exercises native npm packaging with a
synthetic sentinel at the excluded path. It checks the complete before/after
path, size and mode inventories for both packaging contexts: the only removed
entry is the instance stream. Existing source bytes are not rewritten by the
packaging rule. Run the direct `check` and `test` commands and `npm pack
--ignore-scripts` before receiving the package into a consumer. Source
publication, package verification and actual consumer receiving are separate
acceptance conditions.

## Source-positioned harness utterances (2026-10-18)

`./utterances` now places one observed session-and-time token before its
prompt-text claim in each source-addressed utterance. Repeating the same text
in a session at a different observed time creates a different address rather
than silently erasing the second instruction, while matching complete source
coordinates across carriers may still deduplicate. Unknown source timestamps
refuse instead of creating a spurious common identity. Time-zone-aware
chronology is numeric, not lexical collation. This is a technological
source-position readout derived from Obsmetrologia's positional Mark law,
**not** an independently witnessed inter-carrier identity proof.

The previous text/session-only NI values are historical v1 addresses;
v2 values must be received as new IDs, not silently substituted in prior
attestations or learning records. Raw carrier caches store source prompts
and rederive their identities on read. Same-instant collisions and sources
whose timestamp differs between carriers remain explicit limits until a
native event-occurrence token or independently admitted relation is carried.
