# @emsenn/agent - overview

## What this package models

`@emsenn/agent` operationalizes the agent domain as one package. It merges what
used to be the separate `agent-*`, `claude-*`, `trace-topology`, and
`decision-topology` library packages into a single descent of module subpaths.
(The LLM sub-domain moved out to its own package, `@emsenn/llm`; it does not
live here.)

The domain it operationalizes: agents as charge-bearing predicators. An agent
is something that observes, predicates, posits, and settles - and that can be
identified, given capabilities, charged with duties, embodied, harnessed,
collected into fleets, and asked to decide. Every claim in the package is a
bilattice-charged predication resting on the relationality substrate
(`@emsenn/relationality`): observations affirm or deny, knowledge is joined
rather than overwritten, and contradiction is held (settles to `stable`, the
top of the knowledge order) rather than collapsed.

## Core mental model

Read the package as two strata stacked the same way at every scale:

- An **algebra** layer: pure carriers and folds on charges. No I/O, no
  persistence, no settling-into-a-world. It says what a thing *is* and what it
  *knows*.
- A **topology** layer: the settling layer above an algebra. It founds worlds
  by explicit induction, settles many charges into one (consensus, cohomology,
  graph structure), and carries the meme-topology bedrock the trace and
  federation tiers recall from.

The recurring discipline: charges are **measured from an induced world, never
seeded**. There is no verb anywhere that re-admits a charge, a polarity, or a
denial. An unobserved subject reads `absurd` (no evidence), not `active` (a
denial). Refusal is the gate stating its own contrary claim, not a denial of
yours.

The four-object grammar of cognition recurs throughout: articulating ->
predicating -> positing -> settling. That descent (the thinking cycle) is folded
into the algebra because any agent that thinks wants it; it is not a separate
concern. `dream` (free association) is its generative dual, living in the
topology layer.

## The modules and what each is responsible for

The root module (`@emsenn/agent`) re-exports each subpath under its own
namespace for discoverability. Import the subpaths directly for the flat symbol
surface of each module.

### `@emsenn/agent/algebra`

The pure algebraic substrate. Identity/capability/duty marks; agent cells as
bilattice-charged predication (`prehend`, `articulation`); the capability/
provision fiber (`fiber`, `provisions`); the descent thinking cycle
(`articulating`, `predicating`, `positing`, `settling`, `settledCharge`);
tasks, terms, and observations; handedness - an embodied agent's
`(recv, send, actuate, observe)` four-tuple as Player/Opponent duality, the
bridge from agents to games, with symmetric peers as the special case; and
`language` - reading prose into charged observations (`parseLanguage`,
`captureLanguage`, `extractObservations`, `project`).

### `@emsenn/agent/analysis`

Measurement of change between settled agent-world states. `transition` computes
the `ChargeShift` between two settled states. Pure measurement, not mutation.

### `@emsenn/agent/topology`

Agents, capabilities, offices, and delegation as a meme-topology carrier, with
settlement to the agent graph (`induceAgentTopology`, `perform`, `bearing`,
`star`, `affordances`, `regulate`). Includes `dream` - free association as the
generative dual of the descent cycle, in several regimes (strict-finite,
Scott-continuous, transfinite, aperiodic).

### `@emsenn/agent/fleet/algebra` and `@emsenn/agent/fleet/topology`

The fleet sub-domain: a collective of agents.

- `fleet/algebra` is the pure substrate. The work-type quartet
  (`WORK_TYPES`, `workTypeOf`, `deriveWorkType`); residuation dispatch matching
  agent provisions to work requirements (`residuate`, `dispatchReadiness`);
  the EAV work model (`workItem`, `assignWork`, `workProject`, `OfficeRegistry`);
  offices as authority fibers (`office`); to-office assignment and
  office-incumbent dispatch readiness; the eligibility decision charge; and
  governance operation-gating and tool admission (`governOperation`,
  `admitTool`). No settling, no persistence.
- `fleet/topology` is the collective settling layer above it: bilattice
  network-sheaf consensus (`sheafCharges`, `sheafObservations`), the opposition
  obstruction (H1 of the observer graph, via `opposed`), and component pooling.
  This is the settling/cohomology the algebra layer deliberately defers.

The individual agent's capability/provision fiber lives one layer down, in
`algebra`, and is re-exported by `fleet/algebra` for convenience.

### `@emsenn/agent/session`

An agent's bounded working session - the unit of episodic working memory. A
`Session` holds a sequence of `Finding`s (charge-bearing observations about
subjects). `recall` over a subject is the knowledge-join of its findings'
charges: everything the session came to know, contradictions kept. Identity is
`bottom()`, so an unobserved subject recalls as `absurd` and conflicting
findings settle to the held contradiction (`stable`). Pure models and folds on
meme-algebra - no I/O, no persistence; projecting a finding to a durable trace
is the topology/app layer's job.

### `@emsenn/agent/swarm`

The swarm-orchestration substrate - the migration target for the agent-domain
modules of `lib/swarm`. Currently an empty module (`export {}`) that keeps the
subpath namespaceable while modules are carved over onto this descent.

### `@emsenn/agent/harness`

An agent's harness as a meme-topology carrier (`harness`,
`induceAgentHarnessTopology`, with `equipsPredicate` / `speaksPredicate`). The
generic harness; the Claude Code CLI harness is its specialization in the
`claude` diamond.

### `@emsenn/agent/claude`, `/claude/code`, `/claude/code/cli-harness`

The claude/claude-code/cli-harness diamond, nesting one level deeper at each
step:

- `claude` - the Claude models as a meme-topology (`claudeModel`,
  `claudeModels`, `CLAUDE_MODELS`, `induceClaudeTopology`). Only the models live
  here; transport, store, suit, and harness slots belong to the diamond's lower
  nodes.
- `claude/code` - Claude Code as a meme-topology: an agent embodying a claude
  model (`claudeCode`, `induceClaudeCodeTopology`, `embodiesPredicate`,
  `runsPredicate`).
- `claude/code/cli-harness` - the diamond floor: the Claude Code CLI harness,
  resolving MCP servers, skills, commands, subagents, hooks, and settings
  (`claudeCodeCliHarness`, `induceClaudeCodeCliHarnessTopology`,
  `AGRODAO_HUB`).

### `@emsenn/agent/trace`

Articulated traces stated on the meme-topology bedrock - the shared layer
between the meme- and web- tiers. Trace entries articulate utterances
(`utterEntry`, `utterTrace`, `foldTrace`); admission judgments settle by
knowledge join (`settleJudgments`); the `UtteranceLog` is the accretive
in-memory store the web tier recalls from. Worlds are founded only by explicit
induction; charges are measured, never seeded.

### `@emsenn/agent/decision`

Decision as a morphism over a meme-topology section: read a valuation charge,
draw a linear budget, emit a typed action or a typed abstention. The substrate
is domain-neutral; a specialization supplies `Proposal`s (action + linear cost +
scalar merit + justifying charge) and `decide` allocates the finite budget
across them, returning a complete, auditable `DecisionRun`.

### `@emsenn/agent/federation`

Agent's cross-observer layer (formerly the standalone `@emsenn/memetics-
federation`): coordination-free federation over append-only assertion worlds.
Assertion identity; world union/admission gated by source recognition
(`federate`, `admit`, `recognizerFrom`); per-observer section reads (`section`,
`sectionSpace`, `disagreements`); governance regimes (`governAction`,
`selectRegime`, `REGIMES`); and structural bottleneck cost graphs
(`costGraphSummary`). It rests on the relationality substrate
(`ChargeValueName`) like the rest of agent. (Note: `federation` is not
re-exported under the root namespace barrel; reach it by its subpath.)

## How the modules depend on each other

The layering runs from pure substrate upward:

- `algebra` is the floor. The individual agent's predication, descent,
  handedness, and capability/provision fiber are here.
- `analysis`, `topology`, and `session` build directly on `algebra` / the
  relationality charge substrate.
- `fleet/algebra` re-exports the agent's `fiber`/`provisions` from `algebra` and
  adds the collective's work, office, dispatch, and governance algebra.
  `fleet/topology` settles `fleet/algebra` into consensus and cohomology.
- `trace` and `federation` sit on the meme-topology bedrock, providing the
  accretive store and cross-observer worlds.
- `harness` and the `claude` diamond specialize the topology layer for embodied,
  harnessed agents.
- `decision` is a domain-neutral morphism layered over any meme-topology
  section.

Every layer reads charges from `@emsenn/relationality`'s bilattice algebra;
nothing in the package overwrites a charge or seeds one outside an induced world.

## Bin scripts

The package ships four executables that put the algebra at a CLI edge:
`agent-govern`, `agent-admit`, `agent-dispatch`, `agent-consensus`. Each reads a
request from stdin or a path, computes a library decision, and writes the
bilattice charge as DATA (exiting 0 whenever a decision was computed; gate on a
denied charge with a flag such as `--fail-on-denied`). The I/O lives only in the
script's `main`; the library itself stays pure.
