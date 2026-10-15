# Agent Harness Computer System Engineering Services Section

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
