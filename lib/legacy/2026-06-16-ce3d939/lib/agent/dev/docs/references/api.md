# @emsenn/agent — API reference

> Generated from source by `jsnode-doc-computer reference`. Each entry is the exported symbol's verbatim signature and its leading JSDoc; regenerate after changing the public surface.

## Modules

- `@emsenn/agent/algebra`
- `@emsenn/agent/analysis`
- `@emsenn/agent/claude`
- `@emsenn/agent/claude/code`
- `@emsenn/agent/claude/code/cli-harness`
- `@emsenn/agent/decision`
- `@emsenn/agent/federation`
- `@emsenn/agent/fleet/algebra`
- `@emsenn/agent/fleet/topology`
- `@emsenn/agent/harness`
- `@emsenn/agent/session`
- `@emsenn/agent/topology`
- `@emsenn/agent/trace`

## `@emsenn/agent/algebra`

### `AgentProvisions` — interface

```ts
export interface AgentProvisions
```

An agent's provisions: the capabilities it brings, and any authorities it currently holds (an office confers these — see agent-fleet-algebra).

### `articulating` — function

```ts
export function articulating(input: Task | Utterance): ArticulationCell
```

Articulating (aperiodic-articulation): utter a task into a value-free cell.

### `articulation` — function

```ts
export function articulation(input: ArticulationInput): ArticulationCarrier
```

Constructs a frozen ArticulationCarrier from an input: builds the claim utterance (unary when no object, relational otherwise) and the four reification utterances binding the locus, event, subject, predicate, and object via the articulation vocabulary.

### `ArticulationCarrier` — interface

```ts
export interface ArticulationCarrier
```

The result of an articulation: the originating input, the articulated claim utterance, the reification utterances recording who articulated what, and the combined list of all utterances (claim plus reification).

### `ArticulationCell` — interface

```ts
export interface ArticulationCell
```

A value-free articulation cell — the claim, not yet charged.

### `ArticulationInput` — interface

```ts
export interface ArticulationInput
```

The inputs to an articulation: the locus that acts, the event identifying the act, and the subject, predicate, and optional object of the claim being uttered.

### `articulationVocabulary` — variable

```ts
export const articulationVocabulary
```

The frozen predicate vocabulary for articulation reification: the marks naming who articulates an event and the event's subject, predicate, and object.

### `captureLanguage` — function

```ts
export function captureLanguage(text: string, options: LanguageCaptureOptions = {}): LanguageCapture
```

Capture prose as charged observations: one per predication cell, plus (optionally) the language-editing verdict as its own observation.

### `chargeAt` — const

```ts
export const chargeAt = (h: Handedness, c: HandednessCoordinate): ChargeValueName => …
```

The capacity charge a handedness carries at a given coordinate.

### `coordinateSide` — const

```ts
export const coordinateSide = (c: HandednessCoordinate): HandednessSide => …
```

Which side of `(-)^⊥` a coordinate sits on: input (opponent) or output (player).

### `dualHandedness` — function

```ts
export function dualHandedness(h: Handedness): Handedness
```

The dual `(-)^⊥` of a handedness: swaps the Opponent input side with the Player output side — recv↔send, observe↔actuate — the agent-side reading of the CGS dualizing operation. A symmetric peer is a fixed point of this dual.

### `emptyValuation` — function

```ts
export function emptyValuation(): PredicationValuation
```

The empty valuation — no cells observed.

### `extractObservations` — function

```ts
export function extractObservations(text: string, options: LanguageCaptureOptions = {}): readonly Observation[]
```

The observations alone — the common case.

### `fiber` — function

```ts
export function fiber(names: readonly string[] | undefined): Fiber
```

Build a fiber from plain coordinate names — each becomes a `potential` provision. Pass a `Fiber` record directly for non-trivial charges.

### `Fiber` — type-alias

```ts
export type Fiber = Readonly<Record<string, ChargeValueName>>
```

A fiber of charge values over coordinate names.

### `handedness` — function

```ts
export function handedness(input: HandednessInput = {}): Handedness
```

Build a handedness from explicit per-coordinate capacity charges; any omitted coordinate defaults to `absurd` (⊥, the agent lacks it). Pass capacities to describe an asymmetric embodied participant (e.g. a drone that can `observe` but not `actuate`).

### `Handedness` — interface

```ts
export interface Handedness
```

An agent's handedness: the capacity charge it carries at each of the four coordinates. This is the agent's individual face on the same bilattice charge the rest of the package uses.

### `HandednessCoordinate` — type-alias

```ts
export type HandednessCoordinate = "recv" | "send" | "actuate" | "observe"
```

One of the four handedness coordinates of an embodied agent: `recv` and `observe` (opponent/input side), `send` and `actuate` (player/output side).

### `handednessCoordinates` — const

```ts
export const handednessCoordinates = (): readonly HandednessCoordinate[] => …
```

The four handedness coordinates as a frozen tuple: `recv`, `send`, `actuate`, `observe`.

### `handednessFrom` — function

```ts
export function handednessFrom(present: readonly HandednessCoordinate[]): Handedness
```

A handedness from a set of coordinates the agent provides; the rest are `absurd`.

### `HandednessInput` — interface

```ts
export interface HandednessInput
```

Optional per-coordinate capacity charges for building a handedness; any omitted coordinate defaults to `absurd`.

### `HandednessSide` — type-alias

```ts
export type HandednessSide = "opponent" | "player"
```

Which side of the Player/Opponent duality `(-)^⊥` a coordinate sits on: `"opponent"` for the input side, `"player"` for the output side.

### `isHandedness` — function

```ts
export function isHandedness(value: unknown): value is Handedness
```

Type guard for `Handedness`: true when the value is an object tagged `"agent.handedness"` with string charges at all four coordinates.

### `isSymmetricPeer` — const

```ts
export const isSymmetricPeer = (h: Handedness): boolean => …
```

Whether a handedness is a symmetric peer: true when `symmetricPeerJudgment` yields a witness.

### `JsonLike` — type-alias

```ts
export type JsonLike = | null | boolean | number | string | readonly JsonLike[] | { readonly [key: string]: JsonLike }
```

The JSON-serializable value space: null, boolean, number, string, a readonly array of such values, or an object whose string keys map to such values.

### `LanguageCapture` — interface

```ts
export interface LanguageCapture extends LanguageParse
```

A LanguageParse extended with the observations lifted from it: one charged observation per predication cell, plus optionally one carrying the language-editing verdict.

### `LanguageCaptureOptions` — interface

```ts
export interface LanguageCaptureOptions
```

Options for captureLanguage: the observer id to stamp on each observation, the observation timestamp (at), an override subject (defaults to the parsed section's subject), and whether to append the editing-verdict observation (includeEditingVerdict, default true).

### `LanguageParse` — interface

```ts
export interface LanguageParse
```

The result of parsing prose: the original text, the settled SectionSpec (one subject and its charged predication cells), the section's prose realization, and the language-editing verdict from lint.

### `observation` — function

```ts
export function observation(input: { readonly observer: string; readonly task: Task; readonly charge: ChargeCarrier; readonly at?: JsonLike; readonly note?: JsonLike; }): Observation
```

Build a frozen `Observation`, dropping absent optional fields.

### `Observation` — interface

```ts
export interface Observation
```

An observer's charged claim about a task, with optional provenance.

### `parseLanguage` — function

```ts
export function parseLanguage(text: string): LanguageParse
```

Parse prose into a settled section, its prose realization, and an editing verdict.

### `peerHandedness` — const

```ts
export const peerHandedness = (): Handedness => …
```

The symmetric-peer handedness: every coordinate provided (`potential`), a fixed point of the dual.

### `PositedValue` — interface

```ts
export interface PositedValue
```

A charge posited onto a cell, with optional provenance.

### `positing` — function

```ts
export function positing( valuation: PredicationValuation, input: { readonly cell: PredicationCell; readonly posit: ChargeCarrier; readonly source?: JsonLike }, ): PredicationValuation
```

Positing (scott-continuous-posit): join a charge onto a cell in the valuation. Re-positing the same cell knowledge-joins — monotone accumulation, ⊤ kept.

### `predicating` — function

```ts
export function predicating(articulation: ArticulationCell, decomposition: Task = articulation.task): PredicationCell
```

Predicating (transfinite-predication): decompose the articulation to a cell.

### `PredicationCell` — interface

```ts
export interface PredicationCell
```

A concrete predication cell — the subject/predicate/object the charge settles on.

### `PredicationValuation` — interface

```ts
export interface PredicationValuation
```

A valuation — the set of cells and their accumulated charges.

### `prehend` — function

```ts
export function prehend(subject: string, object: string): Prehension
```

Constructs a frozen Prehension relating subject to object: builds an utterance over the subject-object pair under the "agent.prehends" predicate and returns it tagged "agent.prehension".

### `Prehension` — interface

```ts
export interface Prehension
```

A prehension: the constitutive relation by which a subject grasps an object, carrying the subject and object names and an utterance marking the subject-object pair with the "agent.prehends" predicate.

### `project` — function

```ts
export function project(text: string): string
```

Round-trip prose through the section model back to realized prose.

### `provisions` — function

```ts
export function provisions(input: { readonly capabilities?: readonly string[]; readonly authorities?: readonly string[]; }): AgentProvisions
```

Build an agent's provision fibers from plain capability/authority name lists.

### `settledCharge` — function

```ts
export function settledCharge(valuation: PredicationValuation): ChargeCarrier
```

The settled charge of a valuation — knowledge-join of every cell's charge.

### `settling` — function

```ts
export function settling(input: { readonly valuation?: PredicationValuation; readonly increments: readonly PositedValue[]; readonly fuel?: number; }): SettlingOrbit
```

Settling: run a bounded orbit positing each increment, to a fixed point. The orbit is strict-finite if it consumed every increment within fuel, else a partial-prefix.

### `SettlingOrbit` — interface

```ts
export interface SettlingOrbit
```

The result of settling: the orbit's settled valuation, the number of increments consumed (rounds), whether it reached a fixed point (every increment posited within fuel), and the resulting regime ("strict-finite" if closed, "partial-prefix" if cut short).

### `SettlingRegime` — type-alias

```ts
export type SettlingRegime = "strict-finite" | "partial-prefix"
```

Whether the settling orbit closed within its fuel (strict) or was cut short.

### `stableKey` — function

```ts
export function stableKey(value: unknown): string
```

A content-addressed key for any value: order-independent over object keys, so structurally equal values key equally.

### `symmetricPeerJudgment` — function

```ts
export function symmetricPeerJudgment(h: Handedness): SymmetricPeerJudgment
```

Judge whether a handedness is a *symmetric peer* — a fixed point of the dual, i.e. `recv = send` and `observe = actuate`. Embodied participants are generically asymmetric; the obstruction records which axes break symmetry.

### `SymmetricPeerJudgment` — type-alias

```ts
export type SymmetricPeerJudgment = SymmetricPeerWitness | SymmetricPeerObstruction
```

The result of judging symmetric-peerhood: either a `SymmetricPeerWitness` or a `SymmetricPeerObstruction`.

### `SymmetricPeerObstruction` — interface

```ts
export interface SymmetricPeerObstruction
```

Evidence that a handedness fails to be a symmetric peer: carries the handedness and the coordinate axes (`recv/send`, `observe/actuate`) whose two sides disagree.

### `SymmetricPeerWitness` — interface

```ts
export interface SymmetricPeerWitness
```

Evidence that a handedness is a symmetric peer - a fixed point of the dual where `recv = send` and `observe = actuate` - carrying the witnessed handedness.

### `task` — function

```ts
export function task(input: { readonly subject: Term; readonly predicate: JsonLike; readonly object?: JsonLike; readonly prompt?: string; readonly metadata?: Readonly<Record<string, JsonLike>>; }): Task
```

Normalize loose input into a `Task`, coercing the subject path and validating JSON-serializability of the predicate/object.

### `Task` — interface

```ts
export interface Task
```

A unit of cognition for the agent to think about: a subject term, a predicate, and an optional object, plus an optional prompt and metadata. The subject/predicate/object triple projects to the cell coordinates the predication category settles.

### `taskCell` — function

```ts
export function taskCell(task: Task): { readonly subject: string; readonly predicate: JsonLike; readonly object: JsonLike }
```

Project a task to the cell coordinates the predication category settles. The object defaults to the subject key when unstated (a reflexive cell).

### `Term` — type-alias

```ts
export type Term = string | readonly JsonLike[]
```

A term: a path of parts (`["agent", "drone-1"]`) or a bare string.

### `termKey` — function

```ts
export function termKey(term: Term): string
```

A term's flat key — path parts joined by `/`.

### `Utterance` — type-alias

```ts
export type Utterance = readonly [subject: string, predicate: string]
```

A `[subject, predicate]` utterance pair — the articulation's surface form.

## `@emsenn/agent/analysis`

### `ChargeShift` — interface

```ts
export interface ChargeShift
```

A single cell's charge change between two settled carriers: the cell, its before and after charge values, and knowledgeShift, the signed integer in -2..2 giving the movement in knowledge-order height.

### `transition` — function

```ts
export function transition(before: MemeTopologyCarrier, after: MemeTopologyCarrier): TransitionCarrier
```

The charge transition between two carriers, read at the knowledge-least section. Absence is data: cells that enter or leave the carrier appear as shifts from or to the absurd charge.

### `TransitionCarrier` — interface

```ts
export interface TransitionCarrier
```

The result of a transition: holds shifts, the set of every cell whose charge changed between two carriers. Cells that did not change are absent, and cells entering or leaving the carrier appear as shifts to or from the absurd charge.

## `@emsenn/agent/claude`

### `atTierPredicate` — function

```ts
export function atTierPredicate(): string
```

model --at-tier--> tier : the formality tier the model occupies.

### `CLAUDE_MODELS` — variable

```ts
export const CLAUDE_MODELS: readonly ClaudeModelInput[]
```

The claude models and their formality tiers. fable is the newest flagship and joins opus at F0.

### `claudeModel` — function

```ts
export function claudeModel(input: ClaudeModelInput): ClaudeModelCarrier
```

Builds a ClaudeModelCarrier from a ClaudeModelInput: derives the model term, resolves the realized agent (defaulting to the id), and emits the realizes and at-tier utterances as a frozen carrier.

### `ClaudeModelCarrier` — interface

```ts
export interface ClaudeModelCarrier
```

A claude model as a settled carrier: its namespaced model term, id, tier, realized agent id, and the utterances asserting model --realizes--> agent and model --at-tier--> tier.

### `ClaudeModelId` — type-alias

```ts
export type ClaudeModelId = "opus" | "sonnet" | "haiku" | "fable"
```

The claude models this node settles. Open string elsewhere; this union pins the ones we actually run.

### `ClaudeModelInput` — interface

```ts
export interface ClaudeModelInput
```

Input coordinates for one claude model: its id, the formality tier it occupies, and the agent id it realizes (defaulting to the model id).

### `claudeModels` — function

```ts
export function claudeModels(): readonly ClaudeModelCarrier[]
```

Each known claude model as a carrier.

### `ClaudeTopologyCarrier` — interface

```ts
export interface ClaudeTopologyCarrier extends MemeTopologyCarrier
```

A meme-topology carrier branded as the claude-topology node: a MemeTopologyCarrier settled from claude model utterances.

### `extendClaudeTopology` — function

```ts
export function extendClaudeTopology( carrier: ClaudeTopologyCarrier, delta: readonly UtteranceCarrier[], ): ClaudeTopologyCarrier
```

Extends an existing ClaudeTopologyCarrier with delta utterances: delegates to the base extend and re-brands the result as the claude-topology node.

### `induceClaudeModelsTopology` — function

```ts
export function induceClaudeModelsTopology(): ClaudeTopologyCarrier
```

Settle all known claude models into one topology carrier.

### `induceClaudeTopology` — function

```ts
export function induceClaudeTopology( utterances: readonly UtteranceCarrier[], ): ClaudeTopologyCarrier
```

Settles utterances into a ClaudeTopologyCarrier: delegates to the base induce and brands the result as the claude-topology node.

### `induceModelTopology` — function

```ts
export function induceModelTopology(m: ClaudeModelCarrier): ClaudeTopologyCarrier
```

Settle a single model's coordinates into a topology carrier.

### `modelTerm` — function

```ts
export function modelTerm(id: string): string
```

Namespaced mark for a claude model: "model.<id>". Matches the object form agent-topology identity already prehends (`prehend(agent, "model.opus")`).

### `ModelTier` — type-alias

```ts
export type ModelTier = "F0" | "F1" | "F2"
```

Formality tiers, per the agent-algebra tier-routing reading.

### `realizesPredicate` — function

```ts
export function realizesPredicate(): string
```

model --realizes--> agent : the inference surface an agent is realized through. The agent term is agent-topology's — this is the diamond edge to the apex.

### `tierTerm` — function

```ts
export function tierTerm(tier: string): string
```

Namespaced mark for a formality tier: "tier.<F>".

## `@emsenn/agent/claude/code`

### `claudeCode` — function

```ts
export function claudeCode(input: ClaudeCodeInput): ClaudeCodeCarrier
```

Builds a frozen ClaudeCodeCarrier from input coordinates: derives the term, defaults the agent to the id, and emits the embodies (agent) and runs (model) utterances.

### `ClaudeCodeCarrier` — interface

```ts
export interface ClaudeCodeCarrier
```

A settled Claude Code instance: its namespaced term, id, embodied agent, claude model, and the frozen embodies/runs utterances that admit onto the meme floor.

### `ClaudeCodeInput` — interface

```ts
export interface ClaudeCodeInput
```

Input coordinates for a Claude Code instance: the instance id, the agent id it embodies (defaulting to the id), and the claude model id the agent runs on.

### `claudeCodeTerm` — function

```ts
export function claudeCodeTerm(id: string): string
```

Namespaced mark for a Claude Code instance: "claude-code.<id>".

### `ClaudeCodeTopologyCarrier` — interface

```ts
export interface ClaudeCodeTopologyCarrier extends MemeTopologyCarrier
```

A meme-topology carrier branded as the claude-code topology: the settled relational structure over claude-code utterances.

### `embodiesPredicate` — function

```ts
export function embodiesPredicate(): string
```

claude-code --embodies--> agent : the agent the application acts as. The agent term is agent-topology's — the diamond edge up to the apex.

### `extendClaudeCodeTopology` — function

```ts
export function extendClaudeCodeTopology( carrier: ClaudeCodeTopologyCarrier, delta: readonly UtteranceCarrier[], ): ClaudeCodeTopologyCarrier
```

Extends an existing ClaudeCodeTopologyCarrier with a delta of utterances, returning the re-settled topology.

### `induceClaudeCodeInstanceTopology` — function

```ts
export function induceClaudeCodeInstanceTopology( c: ClaudeCodeCarrier, ): ClaudeCodeTopologyCarrier
```

Settle a single Claude Code instance's coordinates into a topology carrier.

### `induceClaudeCodeTopology` — function

```ts
export function induceClaudeCodeTopology( utterances: readonly UtteranceCarrier[], ): ClaudeCodeTopologyCarrier
```

Settles a set of utterances into a ClaudeCodeTopologyCarrier by inducing the meme topology over them.

### `runsPredicate` — function

```ts
export function runsPredicate(): string
```

claude-code --runs--> model : the claude model the embodied agent runs on. The model term is claude-topology's.

## `@emsenn/agent/claude/code/cli-harness`

### `AGRODAO_HUB` — variable

```ts
export const AGRODAO_HUB
```

The default hub a discovered mcp-server points at.

### `claudeCodeCliHarness` — function

```ts
export function claudeCodeCliHarness( input: ClaudeCodeCliHarnessInput, ): ClaudeCodeCliHarnessCarrier
```

Builds a CLI harness carrier from input: composes the harness and claude-code middles on the same body, resolves each mcp-server to its hub, and emits the utterances - the two is-harness/is-claude-code edges, the middles' own coordinates, and one edge per CLI slot (including each mcp-server's points-at-hub edge).

### `ClaudeCodeCliHarnessCarrier` — interface

```ts
export interface ClaudeCodeCliHarnessCarrier
```

A settled CLI harness carrier: its term, id, agent, model, default hub, and the resolved CLI slots (mcp-servers, skills, commands, subagents, hooks, settings), together with the utterances that express the harness and both middles on the meme floor.

### `ClaudeCodeCliHarnessInput` — interface

```ts
export interface ClaudeCodeCliHarnessInput
```

Input for one CLI harness: the id, the agent it equips/embodies, the claude model it runs on, the channels it speaks, the default hub, and the CLI slot lists (mcp-servers, skills, commands, subagents, hooks, settings).

### `ClaudeCodeCliHarnessTopologyCarrier` — interface

```ts
export interface ClaudeCodeCliHarnessTopologyCarrier extends MemeTopologyCarrier
```

A meme-topology carrier settled from CLI harness utterances: a branded MemeTopologyCarrier identifying the claude-code-cli-harness floor.

### `cliHarnessTerm` — function

```ts
export function cliHarnessTerm(id: string): string
```

The term for a CLI harness node: prefixes the id with "claude-code-cli-harness.".

### `commandTerm` — function

```ts
export function commandTerm(id: string): string
```

The term for a command slot node: prefixes the id with "command.".

### `extendClaudeCodeCliHarnessTopology` — function

```ts
export function extendClaudeCodeCliHarnessTopology( carrier: ClaudeCodeCliHarnessTopologyCarrier, delta: readonly UtteranceCarrier[], ): ClaudeCodeCliHarnessTopologyCarrier
```

Extends a settled CLI harness topology carrier with a delta of further utterances, returning the re-settled carrier.

### `firesHookPredicate` — function

```ts
export function firesHookPredicate(): string
```

floor --fires-hook--> hook : a CLI hook slot. Returns "harness.fires-hook".

### `hasCommandPredicate` — function

```ts
export function hasCommandPredicate(): string
```

floor --has-command--> command : a CLI command slot. Returns "harness.has-command".

### `hasMcpServerPredicate` — function

```ts
export function hasMcpServerPredicate(): string
```

floor --has-mcp-server--> mcp-server : a CLI MCP server slot.

### `hasSettingPredicate` — function

```ts
export function hasSettingPredicate(): string
```

floor --has-setting--> setting : a CLI setting slot. Returns "harness.has-setting".

### `hasSubagentPredicate` — function

```ts
export function hasSubagentPredicate(): string
```

floor --has-subagent--> subagent : a CLI subagent slot. Returns "harness.has-subagent".

### `hookTerm` — function

```ts
export function hookTerm(id: string): string
```

The term for a hook slot node: prefixes the id with "hook.".

### `hubTerm` — function

```ts
export function hubTerm(id: string): string
```

The term for a hub node: prefixes the id with "hub.".

### `induceClaudeCodeCliHarnessTopology` — function

```ts
export function induceClaudeCodeCliHarnessTopology( utterances: readonly UtteranceCarrier[], ): ClaudeCodeCliHarnessTopologyCarrier
```

Settles a set of utterances into a CLI harness topology carrier by inducing the meme floor over them.

### `induceHarnessInstanceTopology` — function

```ts
export function induceHarnessInstanceTopology( h: ClaudeCodeCliHarnessCarrier, ): ClaudeCodeCliHarnessTopologyCarrier
```

Settle one CLI harness's coordinates (both middles + CLI slots) into a carrier.

### `isClaudeCodePredicate` — function

```ts
export function isClaudeCodePredicate(): string
```

floor --is-claude-code--> claude-code : the ⊂ edge to claude-code-topology.

### `isHarnessPredicate` — function

```ts
export function isHarnessPredicate(): string
```

floor --is-harness--> harness : the ⊂ edge to agent-harness-topology.

### `McpServerInput` — interface

```ts
export interface McpServerInput
```

Input for one mcp-server slot: the server id and an optional hub it points at (defaulting to AGRODAO).

### `mcpServerTerm` — function

```ts
export function mcpServerTerm(id: string): string
```

The term for an mcp-server slot node: prefixes the id with "mcp-server.".

### `pointsAtPredicate` — function

```ts
export function pointsAtPredicate(): string
```

mcp-server --points-at--> hub : the hub the server discovers (AGRODAO). The one edge that makes You↔MCP↔AGRODAO a settled fact.

### `providesSkillPredicate` — function

```ts
export function providesSkillPredicate(): string
```

floor --provides-skill--> skill : a CLI skill slot. Returns "harness.provides-skill".

### `ResolvedMcpServer` — interface

```ts
export interface ResolvedMcpServer
```

An mcp-server slot after resolution: the server id paired with the concrete hub it points at.

### `settingTerm` — function

```ts
export function settingTerm(id: string): string
```

The term for a setting slot node: prefixes the id with "setting.".

### `skillTerm` — function

```ts
export function skillTerm(id: string): string
```

The term for a skill slot node: prefixes the id with "skill.".

### `subagentTerm` — function

```ts
export function subagentTerm(id: string): string
```

The term for a subagent slot node: prefixes the id with "subagent.".

## `@emsenn/agent/decision`

### `Abstained` — interface

```ts
export interface Abstained
```

A declined decision: a proposal passed over without acting, retaining its cost, merit, and justification charge alongside the enumerated reason it was not funded.

### `AbstainReason` — type-alias

```ts
export type AbstainReason = "below-threshold" | "budget-exhausted" | "non-positive-cost"
```

Why a decision morphism abstained instead of acting: the enumerated grounds for declining to commit.

### `Acted` — interface

```ts
export interface Acted<A>
```

A funded decision: the proposal's typed action committed to, carrying the cost drawn, the merit expected, and the bilattice charge that justified it.

### `actedOf` — function

```ts
export function actedOf<A>(run: DecisionRun<A>): readonly Acted<A>[]
```

The acted decisions of a run, retaining cost/merit/justification.

### `actionsOf` — function

```ts
export function actionsOf<A>(run: DecisionRun<A>): readonly A[]
```

The actions taken in a run, in allocation order — the emit set.

### `decide` — function

```ts
export function decide<A>( proposals: readonly Proposal<A>[], budget: LinearBudget, options: DecideOptions = {}, ): DecisionRun<A>
```

Allocate a linear budget across proposals. Each proposal is examined in capital-efficiency order. A proposal with non-positive cost is never funded (`non-positive-cost`); one whose merit is below the threshold abstains (`below-threshold`); one that no longer fits the remaining budget abstains (`budget-exhausted`) — and the walk continues, so a cheaper later proposal can still be funded. Every proposal yields exactly one `Decision`, so the run is a complete, auditable record.

### `DecideOptions` — interface

```ts
export interface DecideOptions
```

Tuning for `decide`: an optional minimum-merit floor an action must clear before it draws the linear resource.

### `Decision` — type-alias

```ts
export type Decision<A> = Acted<A> | Abstained
```

The verdict on a single proposal: either an `Acted` action or an `Abstained` decline.

### `DecisionRun` — interface

```ts
export interface DecisionRun<A>
```

The complete result of allocating a budget: the resource name, one decision per proposal, and the total spent and remaining stock of the linear resource.

### `LinearBudget` — interface

```ts
export interface LinearBudget
```

A linear resource stock, drawn down monotonically as actions are taken.

### `Proposal` — interface

```ts
export interface Proposal<A>
```

A proposed typed action awaiting the budget verdict. - `cost` is the linear resource the action draws (same unit as the budget). - `merit` is expected return in fixed-point micro-units; higher is better. - `justification` is the bilattice charge the valuation read for this action (paraconsistent: a contested charge is carried, not collapsed).

## `@emsenn/agent/federation`

### `AdmissionRefusal` — type-alias

```ts
export type AdmissionRefusal = Readonly<{ claim: Assertion; assertion: string; source: string | null; standing: ChargeValueName; reason: string; }>
```

A gate's own claim of the contrary predicate `refused-admission`: `claim` is that assertion, `assertion` identifies the refused assertion, `source` and `standing` record who and at what charge, and `reason` explains the refusal. Never a denial of the refused assertion.

### `admit` — function

```ts
export function admit( world: WorldInput, subject: string, assertions: Iterable<Assertion>, recognize: RecognitionInput, opts: { onReject?: "quarantine" | "refuse" } = {}, ): Readonly<{ world: World; added: number; skipped: number; inert: number; refused: readonly AdmissionRefusal[] }>
```

Admits assertions into a subject's log gated by source recognition: assertions whose provenance reads potential or stable are added, the rest are quarantined under the subject's inert key or, when onReject is "refuse", recorded as AdmissionRefusal claims. Returns the resulting world with added, skipped, inert, and refused counts.

### `admitLog` — function

```ts
export function admitLog( world: WorldInput, subject: string, assertions: Iterable<Assertion>, opts: { recognize?: RecognitionInput; onReject?: "quarantine" | "refuse" } = {}, ): Readonly<{ world: World; added: number; skipped: number; inert?: number; refused?: readonly AdmissionRefusal[] }>
```

Adds assertions to a subject's log in the world, deduplicating by assertion id: returns the resulting world with counts of added and skipped assertions. When opts.recognize is supplied, delegates to admit to gate assertions by provenance recognition.

### `admitUnder` — function

```ts
export function admitUnder(regimeName: string | undefined, ctx: GovernanceContext): RawAdmission & { regime: string; title: string }
```

Runs the selected regime's admit method over a governance context and returns the resulting raw admission frozen together with the regime's name and title.

### `allAssertions` — function

```ts
export function allAssertions(world: WorldInput): Assertion[]
```

Every assertion across all keys of the world, collected in sorted key order and deduped.

### `assertAssertion` — function

```ts
export function assertAssertion(assertion: Assertion): Assertion
```

Validates that a value is a well-formed assertion - an object with string `e` and `a` - returning it unchanged, or throwing a TypeError otherwise.

### `Assertion` — type-alias

```ts
export type Assertion = Readonly<{ e: string; a: string; v: unknown; t?: unknown; source?: string; signature?: { by?: unknown }; }>
```

An entity-attribute-value claim: `e` is the subject, `a` the predicate, `v` the value, with optional `t` time, `source` of the claim, and `signature` recording who made it.

### `assertionId` — function

```ts
export function assertionId(assertion: unknown): string
```

The content-addressed identifier of an assertion: the stable content id computed over its structure.

### `AssertionTrace` — type-alias

```ts
export type AssertionTrace = readonly Assertion[]
```

An ordered, immutable sequence of assertions.

### `asWorld` — function

```ts
export function asWorld(world: WorldInput): World
```

Normalizes a WorldInput into a World: copies an existing map or a plain record into a fresh map, deduping each entity's assertion trace, and returns an empty world for null/undefined or non-object input.

### `compareStamp` — function

```ts
export function compareStamp(left: unknown, right: unknown): -1 | 0 | 1
```

Orders two stamp values by their derived sort keys, returning -1, 0, or 1 - finite numbers are zero-padded to 16 digits, strings compared directly, and anything else compared by its stableJson form.

### `contentId` — function

```ts
export function contentId(value: unknown): string
```

The sha256 content identifier for a value: hashes the value's canonical stableJson serialization and returns the digest as a hex string.

### `contentKey` — function

```ts
export function contentKey(world: WorldInput): string
```

A stable content-addressed key for the world: a deterministic json encoding of each sorted key paired with its deduped, sorted assertion ids.

### `CONTRARY_PREDICATE` — variable

```ts
export const CONTRARY_PREDICATE
```

The predicate name `contrary-to` used by `contrary-to` claims in a world: such a claim installs read-side contrariety knowledge naming one predicate as contrary to another, and never flips polarity at fold time.

### `ContraryOptions` — type-alias

```ts
export type ContraryOptions = Readonly<{ contrary?: Record<string, string> }>
```

Read-side contrariety declaration: `contrary` maps each predicate to the canonical predicate it is declared contrary to. Both predicates still fold as their own potential cells; only reads derive active/stable across the declared pair.

### `costGraphSummary` — function

```ts
export function costGraphSummary(input: WorldInput | AssertionTrace): Readonly<{ kind: "memetic.federation.cost.graph"; dimensions: Readonly<Record<string, number>>; graph: Readonly<Record<string, unknown>>; bottlenecks: readonly string[]; contentKey: string; }>
```

A cost-graph summary of a federated world: builds the relational entity graph from assertions (edges are subject-predicate-object triples, contrary-to claims excluded as non-relational), then returns structural dimensions (subject/edge/component counts), the graph itself (central vertices, relation counts, cut-vertices, bridge-edges, and path residue), the bottleneck vertices and edges whose removal increases the component count, and a stable contentKey over the dimensions and bottlenecks.

### `dedupe` — function

```ts
export function dedupe(assertions: AssertionTrace): Assertion[]
```

Removes duplicate assertions from a trace by content id, preserving first-seen order, and returns the deduplicated array.

### `deepFreeze` — function

```ts
export function deepFreeze<T>(value: T): T
```

Recursively freezes a value and all of its nested object values in place, then returns the same value now made immutable.

### `DEFAULT_REGIME` — variable

```ts
export const DEFAULT_REGIME
```

The regime name used when no regime is selected: "kyriarchical", the office-capability delegation chain.

### `Disagreement` — type-alias

```ts
export type Disagreement = Readonly<{ subject: string; predicate: string; contrary: string; object: unknown; evidence: readonly [readonly string[], readonly string[]]; claimedBy: readonly string[]; contraryClaimedBy: readonly string[]; value: "stable"; }>
```

A derived disagreement over one `subject` and `object`: two contrary predicates (`predicate` and `contrary`) each hold a potential cell, with `evidence`, `claimedBy`, and `contraryClaimedBy` recording their witnesses, and `value` always `"stable"` since the knowledge-join across the contrariety renders the held pair stable.

### `disagreements` — function

```ts
export function disagreements(world: WorldInput, opts: SettleOptions & ContraryOptions = {}): readonly Disagreement[]
```

Derives the stable disagreements across a world: for each subject, where a settled cell's predicate is declared contrary to a canonical predicate (from `contrary-to` claims and `opts.contrary`) and both the canonical and contrary cells are held over the same object, emits a `Disagreement` recording the subject, the two predicates, their evidence and claimants, and the resulting `stable` value.

### `emptyWorld` — function

```ts
export function emptyWorld(): World
```

A new empty world: an empty map from entity identifier to assertion trace.

### `federate` — function

```ts
export function federate(a: WorldInput, b: WorldInput, opts: { recognize?: RecognitionInput; onReject?: "quarantine" | "refuse" } = {}): World
```

Folds world `b` into world `a`: for each subject key of `b` in sorted order, inert keys are merged with unionInto while ordinary keys are admitted via admitLog under the given recognition and onReject options. Returns the resulting combined world.

### `fold` — function

```ts
export function fold(subject: string, assertions: AssertionTrace, opts: FoldOptions = {}): Folded
```

Folds an assertion trace for one subject into a frozen `Folded`: collapses the subject's assertions into predicate-object cells (honoring retractions unless `opts.retract` is false), sorts them by predicate then object, and returns the entity with its frozen fiber of folded cells.

### `Folded` — type-alias

```ts
export type Folded = Readonly<{ entity: string; fiber: readonly FoldedCell[]; }>
```

The folded result for one entity: the `entity` identifier and its `fiber`, the collection of folded cells over that entity.

### `FoldedCell` — type-alias

```ts
export type FoldedCell = Readonly<{ predicate: string; object: unknown; value: ChargeValueName; witnessIds: ReadonlySet<string>; witnessedBy: ReadonlySet<string>; }>
```

A folded predicate-object cell carrying its resolved charge `value`, the set of assertion ids that witness it (`witnessIds`), and the set of sources that witnessed it (`witnessedBy`).

### `FoldOptions` — type-alias

```ts
export type FoldOptions = Readonly<{ retract?: boolean; }>
```

Options for folding: `retract` toggles whether retracting assertions are honored.

### `frontier` — function

```ts
export function frontier(world: WorldInput, subject: string, opts: SettleOptions = {}): readonly FoldedCell[]
```

Returns the settled fiber of folded cells for a subject in a world: reads the subject's log from the world, settles and folds it, and yields the resulting `FoldedCell` array.

### `FunctionalPredicate` — type-alias

```ts
export type FunctionalPredicate = ReadonlySet<string> | ((predicate: string) => boolean)
```

Specifies which predicates are functional (single-valued): either a set of predicate names or a membership predicate over predicate names.

### `GOV_AXES` — variable

```ts
export const GOV_AXES
```

The six axes along which a governance regime is characterized: persons-and-relations, synchronic-diachronic, constitutive-regulative, binding-source, boundary-source, and recursion-of-meta-governance. Frozen tuple of axis names.

### `governAction` — function

```ts
export function governAction( agent: { name?: unknown; office?: unknown } | null, action: string, target: Record<string, unknown> = {}, options: Record<string, unknown> = {}, ): GovernanceDecision
```

Computes a governance decision for an agent attempting an action on a target: selects a regime (from options.regime, an options.regimeFor mapping over options.structuration, or DEFAULT_REGIME), folds any cone reading into the admit options, admits under that regime, and returns a frozen GovernanceDecision recording the actor, office, claim, value, jural, binding, reason, policy, withdrawals, affirmations, cost witness, and whether the action is admitted.

### `GovernanceCone` — type-alias

```ts
export type GovernanceCone = Readonly<{ points: readonly string[]; states: readonly string[]; valueAt: (point: string, state: string) => ChargeValueName; }>
```

A governance cone presented as a space of points and states: `points` are subjects, `states` are charge states, and `valueAt` gives the charge at a given point and state.

### `GovernanceContext` — type-alias

```ts
export type GovernanceContext = { agent?: { name?: unknown; office?: unknown }; action: string; target?: Record<string, unknown>; options?: Record<string, unknown>; officeName?: string; can?: (agent: unknown, action: string) => boolean; }
```

The input context for a governance evaluation: the acting `agent` (name and office), the `action`, optional `target` and `options` records, the `officeName`, and an optional `can` predicate deciding whether an agent may perform an action.

### `GovernanceDecision` — type-alias

```ts
export type GovernanceDecision = Readonly<{ kind: "memetic.federation.governance.decision"; id: string; actor: string; office: string; action: string; targetKind: string; targetTitle: string; admitted: boolean; regime: string; title: string; claim: string; value: ChargeValueName; jural: "power" | "privilege"; binding: boolean; reason: string; policy: string; withdrawals: readonly string[]; affirmations: readonly string[]; costWitness: unknown; costWitnessKind: string; created: unknown; }>
```

A governance decision record (kind `memetic.federation.governance.decision`): identifies the deciding `actor`, `office`, and `action` against a target, whether it was `admitted`, the governing `regime` and `policy`, the resolved `claim`/`value`, its `jural` mode and `binding` status, `reason`, resulting `withdrawals` and `affirmations`, and the cost witness fields.

### `inertFor` — function

```ts
export function inertFor(world: WorldInput, subject: string): Assertion[]
```

The deduped assertion trace held under a subject's inert key, or an empty array when none exist.

### `inertKeyFor` — function

```ts
export function inertKeyFor(subject: string): string
```

The inert key for a subject: the subject prefixed with the inert marker.

### `isAdmitted` — function

```ts
export function isAdmitted(value: ChargeValueName): boolean
```

Reports whether a charge value admits the action: true only when the value reads "potential".

### `isInertKey` — function

```ts
export function isInertKey(key: string): boolean
```

Whether a key is an inert key, identified by the inert prefix.

### `isReified` — function

```ts
export function isReified(value: unknown): boolean
```

Reports whether a value is a reified assertion reference: true when it is a string beginning with the reified prefix.

### `jcs` — function

```ts
export function jcs(value: unknown): string
```

The canonical (JCS-style) JSON serialization of a value: an alias for stableJson, returning a deterministic string with object keys sorted and undefined values dropped.

### `KNOWN_REGIME_FAMILIES` — variable

```ts
export const KNOWN_REGIME_FAMILIES
```

The frozen list of named regime families recognized but not implemented as REGIMES entries - haudenosaunee-great-law, ubuntu, confucian-li, maori-rangatiratanga, and inuit-qaujimajatuqangit - each carrying a name and a derived flag (all false).

### `logFor` — function

```ts
export function logFor(world: WorldInput, subject: string): Assertion[]
```

The deduped assertion trace held for a subject, or an empty array when the subject is absent.

### `mergeWorlds` — const

```ts
export const mergeWorlds = (...worlds: WorldInput[]): World => …
```

Federates any number of world inputs into one world, left-folding them with federate over an empty world. Returns the accumulated world.

### `migrate` — function

```ts
export function migrate(from: WorldInput, into: WorldInput, entity: string): World
```

Copies one entity's assertion trace from the `from` world into the `into` world under the same entity key, admitting it via admitLog. Returns the resulting `into` world.

### `Provenance` — type-alias

```ts
export type Provenance = Readonly<{ source: string; kind: "source" | "signature" | "witnessed-t" }>
```

The provenance of a witness: the `source` and the `kind` of attestation it derives from - the assertion's source field, its signature, or a witnessed time.

### `provenanceOf` — function

```ts
export function provenanceOf(assertion: Assertion): Provenance | null
```

Reads an assertion's provenance: returns the source and how it was found - from the source field, the signature's by field, or the witnessed t.by field - or null when no readable provenance is present.

### `RecognitionInput` — type-alias

```ts
export type RecognitionInput = undefined | null | Recognizer | Set<string> | readonly string[] | Map<string, unknown> | Record<string, unknown>
```

Accepted forms for declaring source recognition: a recognizer function, a set or array of recognized source names, a map or record of per-source recognition, or null/undefined for none.

### `Recognizer` — type-alias

```ts
export type Recognizer = (source: string) => ChargeValueName | boolean | { value?: unknown; settled?: unknown } | unknown
```

A function deciding the recognition standing of a source, returning a charge value, a boolean, an object carrying `value`/`settled`, or any other recognizer-defined result.

### `recognizerFrom` — function

```ts
export function recognizerFrom(input: RecognitionInput): (source: string) => ChargeValueName
```

Builds a recognizer function from a recognition input: maps a source name to its charge value, coercing functions, sets, arrays, maps, and records into a source -> ChargeValueName read. Unknown sources read absurd; a null input reads every source as potential.

### `regimeNames` — function

```ts
export function regimeNames(): string[]
```

Returns the names of the implemented regimes: the keys of REGIMES.

### `REGIMES` — variable

```ts
export const REGIMES
```

The frozen table of governance regimes keyed by name - kyriarchical, consensus-by-withdrawal, advisory, and contrarian - each carrying a name, title, policy, and an admit(ctx) method that reads a context into a raw admission claim and derived charge value.

### `REIFIED_PREFIX` — variable

```ts
export const REIFIED_PREFIX
```

The string prefix marking a reified assertion identifier: a value beginning with this prefix is an assertion referenced as an entity rather than a plain entity id.

### `reify` — function

```ts
export function reify(assertion: Assertion): string
```

Reifies an assertion into an entity reference: the reified prefix followed by the first 16 characters of the assertion's content id.

### `relate` — function

```ts
export function relate(assertions: AssertionTrace, predicate: string, object: unknown): readonly unknown[]
```

Returns the sorted, frozen set of subjects (`e`) whose assertions under the given predicate have a value equal to the given object, ignoring reified-entity assertions.

### `relateFrom` — function

```ts
export function relateFrom(assertions: AssertionTrace, subject: string, predicate: string): readonly unknown[]
```

Returns the frozen list of distinct values asserted for the given subject and predicate, in trace order, ignoring reified-entity assertions.

### `section` — function

```ts
export function section(folded: Folded): Section
```

Projects a `Folded` into a `Section`: buckets its fiber cells by charge value into the `potential`, `active`, and `stable` lists, each cell reduced to its predicate, object, and witness ids.

### `Section` — type-alias

```ts
export type Section = Readonly<{ potential: readonly SectionCell[]; active: readonly SectionCell[]; stable: readonly SectionCell[]; }>
```

The section over a subject partitioned into three buckets of cells by charge: `potential`, `active`, and `stable`. Admission only ever populates `potential`; active and stable are derived by reads across declared contrary pairs.

### `SectionCell` — type-alias

```ts
export type SectionCell = Readonly<{ predicate: string; object: unknown; witnesses: readonly string[]; }>
```

A single predicate-object pair within a section together with the witness identifiers that support it.

### `sectionConeOf` — function

```ts
export function sectionConeOf(world: WorldInput, subject: string, opts: SettleOptions & ContraryOptions = {}): Readonly<{ section: Section; cells: readonly FoldedCell[]; space: SectionSpace; cellFor: SectionSpace["cellFor"]; stateOfId: SectionSpace["stateOfId"]; }>
```

Computes a subject's full settled view in one pass: returns a frozen record carrying the subject's `section`, its frozen settled `cells`, the derived `space`, and the space's `cellFor` and `stateOfId` accessors, threading any `opts.contrary` declaration into the space.

### `sectionOf` — function

```ts
export function sectionOf(world: WorldInput, subject: string, opts: SettleOptions = {}): Section
```

Computes the `Section` for a subject in a world: takes the subject's settled frontier and buckets its cells by charge value into the potential, active, and stable lists.

### `sectionSpace` — function

```ts
export function sectionSpace( folded: Folded, assertions: AssertionTrace = [], opts: { stateOf?: (assertion: Assertion) => unknown; predicate?: string; absent?: ChargeValueName; contrary?: Record<string, string> } = {}, ): SectionSpace
```

Builds a `SectionSpace` over a `Folded`: indexes its cells by predicate-object key, maps each cell's witness ids to states via `opts.stateOf` (optionally filtered to `opts.predicate`), and returns the sorted points and states with a `valueAt` that derives a charge from a state's own claim plus its claim of the declared contrary predicate, falling back to `opts.absent` where neither is witnessed.

### `SectionSpace` — type-alias

```ts
export type SectionSpace = Readonly<{ points: readonly string[]; states: readonly string[]; valueAt: (point: string, state: string) => ChargeValueName; cellFor: (point: string) => FoldedCell | undefined; stateOfId: ReadonlyMap<string, string>; }>
```

A derived view of a section as a space of points and states: `points` are subjects, `states` are charge states, `valueAt` gives the charge at a point/state, `cellFor` returns the folded cell for a point, and `stateOfId` maps each witness id to its state.

### `selectRegime` — function

```ts
export function selectRegime(name?: string): typeof REGIMES[keyof typeof REGIMES]
```

Resolves a regime by name, falling back to DEFAULT_REGIME when the name is omitted or not a known regime.

### `settle` — function

```ts
export function settle(subject: string, assertions: AssertionTrace, opts: SettleOptions = {}): Folded
```

Settles then folds a subject's assertions: applies `supersede` to the trace using `opts.functional` to keep only the surviving claim per functional predicate, then folds the result into a `Folded`.

### `SettleOptions` — type-alias

```ts
export type SettleOptions = FoldOptions & Readonly<{ functional?: FunctionalPredicate }>
```

Fold options extended with `functional`, declaring which predicates are single-valued when settling.

### `stableJson` — function

```ts
export function stableJson(value: unknown): string
```

A deterministic JSON serialization of a value: arrays keep their order, object keys are sorted lexically and entries whose value is undefined are omitted, so equal values always produce the same string.

### `subjects` — function

```ts
export function subjects(world: WorldInput): string[]
```

The sorted list of subject keys in the world, excluding inert keys.

### `supersede` — function

```ts
export function supersede(assertions: AssertionTrace, functional?: FunctionalPredicate): Assertion[]
```

Resolves functional predicates within a trace: for each functional predicate, keeps only the assertions bearing the latest timestamp, while passing through reified-entity and non-functional assertions unchanged.

### `unionInto` — function

```ts
export function unionInto(world: WorldInput, key: string, assertions: Iterable<Assertion> | AssertionTrace): { world: World; added: number; skipped: number }
```

Merges assertions into the world under a key, skipping any whose assertion id already exists there, and returns the resulting world along with the counts of assertions added and skipped.

### `World` — type-alias

```ts
export type World = Map<string, AssertionTrace>
```

A map from entity identifier to that entity's assertion trace.

### `WorldInput` — type-alias

```ts
export type WorldInput = World | Record<string, AssertionTrace> | null | undefined
```

Accepted forms for constructing a world: an existing world map, a plain record of traces keyed by entity, or null/undefined for an empty world.

## `@emsenn/agent/fleet/algebra`

### `admitTool` — function

```ts
export function admitTool(input: { readonly tool: string; readonly requires?: readonly string[]; readonly authorities: Fiber; }): ToolAdmission
```

Admit a tool call: the tool's `requires` are the authorities (scopes) it demands; `authorities` is what the caller holds. Admission is δ on the authority axis.

### `assignment` — function

```ts
export function assignment(input: { readonly id: string; readonly toOffice: string; readonly capabilities?: readonly string[]; readonly authorities?: readonly string[]; readonly field?: string; readonly status?: AssignmentStatus; }): Assignment
```

Construct an assignment to an office from plain requirement name lists.

### `Assignment` — interface

```ts
export interface Assignment
```

A unit of work owned by an office: identified by id, addressed to an office via toOffice, carrying the capability and authority requirements δ-dispatch reads, a human-facing field description, and a lifecycle status. Work is assigned to-office and never to a session or agent directly.

### `assignmentReadiness` — function

```ts
export function assignmentReadiness( assignment: Assignment, agentCapabilities: Fiber, office: Office, ): DispatchReadiness
```

δ(incumbent, assignment): readiness of the office-holding agent for the work.

### `AssignmentStatus` — type-alias

```ts
export type AssignmentStatus = "open" | "claimed" | "complete"
```

The lifecycle state of an assignment: "open" (unclaimed), "claimed" (picked up by the office's current incumbent), or "complete".

### `assignWork` — function

```ts
export function assignWork( input: Omit<WorkAssignment, "id"> & Partial<Pick<WorkAssignment, "id">>, ): WorkAssignment
```

Constructs a frozen WorkAssignment from input, defaulting id to "assignment:" plus a stableId of the workId, office, assignee id, and duties, validating the workId and office, normalizing the optional assignee, and freezing the duties.

### `CapabilityName` — type-alias

```ts
export type CapabilityName = string
```

The name of a capability an agent may hold: a string.

### `chargeStatus` — function

```ts
export function chargeStatus(charge: ChargeCarrier): ChargeValueName
```

The settled value name of a charge — the office/decision status.

### `ClosureRule` — interface

```ts
export interface ClosureRule
```

A closure rule of the task. `branching` is true for a disjunctive antecedent — a rule that routes execution along different paths depending on which increment arrives first (execution is open).

### `CoordMatch` — interface

```ts
export interface CoordMatch
```

The per-coordinate match at one capability or authority: the coordinate name, its requirement charge ρ, its provision charge σ, and the residuation match ρ ⇒ σ.

### `deriveWorkType` — function

```ts
export function deriveWorkType(task: TaskClosure): WorkType
```

Read a task's work-type off its closure structure.

### `DispatchGap` — type-alias

```ts
export type DispatchGap = "none" | "capability" | "authority" | "both"
```

Diagnosis of which axes fail dispatch readiness: "none" when both axes are ready, "capability" or "authority" when only that axis falls short, "both" when neither is ready.

### `dispatchReadiness` — function

```ts
export function dispatchReadiness(work: WorkRequirements, agent: AgentProvisions): DispatchReadiness
```

Compute dispatch readiness of an agent for a work item, with diagnosable gaps.

### `DispatchReadiness` — interface

```ts
export interface DispatchReadiness
```

The readiness verdict δ(A,T) of an agent for a work item: the per-axis readiness charges δ^C (capability) and δ^N (authority), their truth-meet δ, the ready flag (δ = potential), the gap diagnosis, the contested flag (some match settled to ⊤), and the per-coordinate matches on each axis.

### `DutyName` — type-alias

```ts
export type DutyName = string
```

The name of a duty carried by an assignment: a string.

### `eligibilityCharge` — function

```ts
export function eligibilityCharge(charges: readonly ChargeCarrier[]): ChargeCarrier
```

Aggregate the evidence charges for an eligibility judgment into one decision charge by knowledge-join. The identity is `bottom()` (no evidence either way), so an empty requirement set settles to no-evidence — never to a spurious affirmation. Conflicting evidence (an affirmation and a denial of the same requirement) settles to the held contradiction (`stable`, ⊤), surfaced rather than thrown.

### `executionSettled` — function

```ts
export function executionSettled(task: TaskClosure): boolean
```

execution-settled(T): no rule branches (vacuously true for a task with no rules).

### `GoalCell` — interface

```ts
export interface GoalCell
```

A goal cell of the task. `determinedAtDispatch` is false when its value is not fixed from the initial valuation — it must arrive as a witness increment during settling (meaning is open on this cell).

### `GovernanceDecision` — interface

```ts
export interface GovernanceDecision
```

The result of gating an operation for an agent under a mode: names the agent, operation, and mode, carries the underlying delta `readiness`, the paraconsistent decision `charge`, and the conjunctive `eligible` gate (readiness settled to potential).

### `governOperation` — function

```ts
export function governOperation(input: { readonly agent: string; readonly operation: string; readonly mode: Mode; readonly capabilities: Fiber; readonly office?: Office; }): GovernanceDecision
```

Gate an operation for an agent under a mode. The agent brings `capabilities`; an `office` it holds confers authorities (capability propagation).

### `incumbentProvisions` — function

```ts
export function incumbentProvisions(agentCapabilities: Fiber, office: Office): AgentProvisions
```

The incumbent's provisions: capabilities from the agent (body natural), authorities from the office (body politic). Capability propagation made concrete.

### `isContested` — function

```ts
export function isContested(charge: ChargeCarrier): boolean
```

An incumbency is contested when its charge is anything but plain `potential` (token given, claim not yet contradicted): `active` (denied), `stable` (held contradiction ⊤), or `absurd` (no evidence). Only `potential` is an uncontested hold.

### `JsonLike` — type-alias

```ts
export type JsonLike = | null | boolean | number | string | readonly JsonLike[] | { readonly [key: string]: JsonLike }
```

A JSON-serializable value: null, boolean, number, string, a readonly array of JsonLike, or a readonly string-keyed record of JsonLike.

### `meaningSettled` — function

```ts
export function meaningSettled(task: TaskClosure): boolean
```

meaning-settled(T): every goal cell is determined at dispatch (vacuously true for a task with no goal cells).

### `mode` — function

```ts
export function mode(name: string, operations: Readonly<Record<string, OperationRequirement>> = {}): Mode
```

Construct a governance regime from a name and a per-operation requirement map: throws if `name` is empty, otherwise returns a frozen Mode with a frozen copy of `operations`.

### `Mode` — interface

```ts
export interface Mode
```

A governance regime: per operation, the capabilities and authorities required. An operation absent from the map is unrestricted.

### `office` — function

```ts
export function office(id: string, options: OfficeOptions = {}): Office
```

Construct an office from an id and what it carries. The authority fiber is built through the canonical fiber builder — an office *provisions* authorities, exactly as an agent provisions capabilities. An office with no `authorities` has an empty fiber (reads `absurd` downstream — confers nothing).

### `Office` — interface

```ts
export interface Office
```

An office as one richer fiber - the body politic, holding the structural cells δ-dispatch reads: id, optional label, the authority fiber (deontic profile transferred to the current incumbent), optional forward duties (munus axis), the office's capability section, and metadata.

### `OfficeHolder` — type-alias

```ts
export type OfficeHolder = Readonly<{ office: OfficeName; agent: WorkAgent; charge: ChargeCarrier; status: ChargeValueName; recognitions: readonly OfficeRecognition[]; }>
```

The resolved standing of an agent in an office: carries the office, the agent, the joined charge of its recognitions, the resulting charge value name as status, and the contributing recognitions.

### `OfficeName` — type-alias

```ts
export type OfficeName = string
```

The name of an office: a string.

### `OfficeOptions` — interface

```ts
export interface OfficeOptions
```

Inputs to the office constructor: optional label, the authority names the office confers (built into its authority fiber), forward duties, the capability section, and metadata.

### `OfficeRecognition` — type-alias

```ts
export type OfficeRecognition = Readonly<{ office: OfficeName; agent: WorkAgent; charge: ChargeCarrier; by: string; at?: JsonLike; reason?: JsonLike; }>
```

A single recognition or withdrawal of an agent into an office: carries the office, the agent, a charge carrier, the witness ("by"), and optional timestamp and reason.

### `OfficeRegistry` — class

```ts
export class OfficeRegistry
```

An append-only log of office recognitions and withdrawals: records each recognition as a charge carrier and resolves current office holders by joining the charges per office/agent seat.

### `openAssignmentsForOffice` — function

```ts
export function openAssignmentsForOffice( assignments: readonly Assignment[], officeId: string, ): Assignment[]
```

Open work the office holds — `to-office === office.id`, status `open`.

### `openMode` — variable

```ts
export const openMode: Mode
```

The open mode — every operation unrestricted.

### `OperationRequirement` — interface

```ts
export interface OperationRequirement
```

What an operation requires of whoever performs it.

### `RankedAssignment` — interface

```ts
export interface RankedAssignment
```

An open assignment paired with the office-holder's δ readiness for it: `assignment` is the work, `readiness` the dispatch result of conjoining the work's requirements against the incumbent's provisions.

### `readyWork` — function

```ts
export function readyWork( assignments: readonly Assignment[], office: Office, agentCapabilities: Fiber, ): RankedAssignment[]
```

All open office work, each annotated with its δ readiness, ready-first. This is the office-derived replacement for "list the open items on your board".

### `requirements` — function

```ts
export function requirements(input: { readonly capabilities?: readonly string[]; readonly authorities?: readonly string[]; }): WorkRequirements
```

Build a work's requirement fibers from plain capability/authority name lists (each becomes a `potential` requirement). Pass `Fiber` records directly for non-trivial charges.

### `residuate` — function

```ts
export function residuate(requirement: ChargeValueName, provision: ChargeValueName): ChargeValueName
```

The per-coordinate residuation ρ ⇒ σ as the Belnap material implication ¬ρ ∨_t σ. With ρ = potential (required): matched iff σ = potential; an absent or denied provision fails; a contradictory provision (σ = ⊤) yields ⊤.

### `settlementLeq` — function

```ts
export function settlementLeq(a: WorkType, b: WorkType): boolean
```

The settlement order is the product lattice on (meaning, execution): `a` is below-or-equal `b` iff wherever `a` is settled, `b` is too. process is the top, inquiry the bottom; procedure and derivation are incomparable.

### `stableId` — function

```ts
export function stableId(value: unknown, length = 16): string
```

Derives a stable identifier from any value: JSON-stringifies it, collapses non-alphanumeric runs to hyphens, trims edge hyphens, truncates to length (default 16), and returns "item" when the result is empty.

### `TaskClosure` — interface

```ts
export interface TaskClosure
```

The structural description of a task from which its work-type is read off.

### `ToolAdmission` — interface

```ts
export interface ToolAdmission
```

The result of admitting a tool call: names the tool, carries the authority-axis delta `readiness`, the paraconsistent decision `charge`, and the `admitted` gate (readiness ready).

### `WORK_PREDICATES` — variable

```ts
export const WORK_PREDICATES
```

The frozen set of predicate paths used to relate work facts: maps title, status, office, duty, capability, assignee, and report to their ["work", ...] term tuples.

### `WORK_TYPES` — variable

```ts
export const WORK_TYPES: readonly WorkType[]
```

Ordered from least settled (inquiry) to most settled (process).

### `workAgent` — function

```ts
export function workAgent(input: WorkAgent): WorkAgent
```

Normalizes a work agent: returns a frozen WorkAgent with its id validated as non-empty text, the optional label trimmed, and capabilities and metadata copied into frozen collections.

### `WorkAgent` — type-alias

```ts
export type WorkAgent = Readonly<{ id: string; label?: string; capabilities?: readonly CapabilityName[]; metadata?: Readonly<Record<string, JsonLike>>; }>
```

An agent that can be recognized into offices and assigned work: carries an id, an optional label, optional capability names, and optional metadata.

### `WorkAssignment` — type-alias

```ts
export type WorkAssignment = Readonly<{ id: string; workId: WorkId; office: OfficeName; assignee?: WorkAgent; duties: readonly DutyName[]; status: WorkStatus; at?: JsonLike; evidence?: readonly string[]; metadata?: Readonly<Record<string, JsonLike>>; }>
```

The assignment of a work item to an office: carries an id, the workId, the office, an optional assignee agent, the duties, a status, an optional timestamp, optional evidence, and optional metadata.

### `WorkId` — type-alias

```ts
export type WorkId = string
```

The identifier of a work item: a string.

### `workItem` — function

```ts
export function workItem(input: Omit<WorkItem, "id" | "status"> & Partial<Pick<WorkItem, "id" | "status">>): WorkItem
```

Constructs a frozen WorkItem from input, normalizing its task, validating the title, defaulting id to "work:" plus a stableId of the title and task, defaulting status to "proposed", and copying optional fields.

### `WorkItem` — type-alias

```ts
export type WorkItem = Readonly<{ id: WorkId; title: string; task: WorkTask; office?: OfficeName; status: WorkStatus; priority?: number; evidence?: readonly string[]; metadata?: Readonly<Record<string, JsonLike>>; }>
```

A unit of work: carries an id, title, task, status, an optional office, optional priority, optional evidence, and optional metadata.

### `workProject` — function

```ts
export function workProject(input: WorkProject): WorkProject
```

Constructs a frozen WorkProject from input, validating its id and title, normalizing each work item via workItem and each assignment via assignWork, and copying the offices and optional metadata.

### `WorkProject` — type-alias

```ts
export type WorkProject = Readonly<{ id: string; title: string; work: readonly WorkItem[]; offices: readonly Office[]; assignments: readonly WorkAssignment[]; metadata?: Readonly<Record<string, JsonLike>>; }>
```

A collection of work under a single project: carries an id, title, its work items, its offices, its assignments, and optional metadata.

### `workReport` — function

```ts
export function workReport(input: WorkReport): WorkReport
```

Constructs a frozen WorkReport from input, validating its id, workId, office, and summary, carrying the status, and copying the optional timestamp, evidence, and metadata.

### `WorkReport` — type-alias

```ts
export type WorkReport = Readonly<{ id: string; workId: WorkId; office: OfficeName; status: WorkStatus; summary: string; at?: JsonLike; evidence?: readonly string[]; metadata?: Readonly<Record<string, JsonLike>>; }>
```

A report on the state of a work item from an office: carries an id, the workId, the office, a status, a summary, an optional timestamp, optional evidence, and optional metadata.

### `WorkRequirements` — interface

```ts
export interface WorkRequirements
```

The requirement charges of a work item: per-axis `Fiber` records giving ρ_T(c) over capabilities and ρ_T(X) over authorities. Either axis may be absent, in which case nothing is required on that axis.

### `WorkStatus` — type-alias

```ts
export type WorkStatus = | "proposed" | "assigned" | "active" | "blocked" | "deferred" | "complete" | "withdrawn"
```

The lifecycle state of a work item or assignment: one of "proposed", "assigned", "active", "blocked", "deferred", "complete", or "withdrawn".

### `workSubject` — function

```ts
export function workSubject(id: string): readonly ["work", string]
```

Builds the subject term for a work id: returns the frozen tuple ["work", id] after validating the id as non-empty text.

### `workTask` — function

```ts
export function workTask(input: WorkTask): WorkTask
```

Normalizes a work task: returns a frozen WorkTask carrying its subject and predicate, the optional object and prompt when present, and metadata copied into a frozen record.

### `WorkTask` — type-alias

```ts
export type WorkTask = Readonly<{ subject: WorkTerm; predicate: WorkTerm; object?: WorkTerm; prompt?: string; metadata?: Readonly<Record<string, JsonLike>>; }>
```

The action a work item describes as a subject/predicate/object triple: holds subject and predicate terms, an optional object term, an optional prompt, and optional metadata.

### `WorkTerm` — type-alias

```ts
export type WorkTerm = readonly string[]
```

A term used in a work task triple: a readonly array of strings.

### `WorkType` — type-alias

```ts
export type WorkType = "process" | "procedure" | "derivation" | "inquiry"
```

work-type — the {process, procedure, derivation, inquiry} quartet, DERIVED from a task's closure structure rather than declared. Theory: `topical-archive/social-sciences/economics/work/archive/work-type-as-closure-structure.md`. A task's type is a property of its closure-rule subsystem S_T, fixed by two binary structural predicates: meaning-settled(T): the target valuation is the unique fixed point of the closure operator on the initial valuation — every goal cell is determined at dispatch, with none whose value must arrive as a later witness increment. execution-settled(T): S_T contains no disjunctive (branching) antecedents — every firing is deterministic. The 2x2 is exhaustive — the nuclear-quartet theorem proves no fifth canonical type exists: execution-settled │ ¬execution-settled meaning → process │ procedure ¬meaning → derivation │ inquiry The settlement path inquiry → {derivation, procedure} → process is the progressive binding of free variables: determining a goal cell raises meaning-settledness; collapsing a branch raises execution-settledness.

### `workTypeOf` — function

```ts
export function workTypeOf(meaning: boolean, execution: boolean): WorkType
```

The pure 2x2 map from the two structural predicates to the quartet.

## `@emsenn/agent/fleet/topology`

### `completeGraph` — function

```ts
export function completeGraph(size: number): ObserverEdge[]
```

The complete graph on `size` observers — every observer compared with every other.

### `ComponentConsensus` — interface

```ts
export interface ComponentConsensus
```

The settled consensus over one connected component of observers: its member indices, the knowledge-join `pooled` charge (everything anyone in the component knows), and the knowledge-meet `common` charge (only what every member shares).

### `definite` — function

```ts
export function definite(charge: ChargeCarrier): boolean
```

A charge with a definite truth direction (potential or active, not ⊥/⊤).

### `ObserverEdge` — type-alias

```ts
export type ObserverEdge = readonly [left: number, right: number]
```

An undirected comparison edge in the observer graph: a [left, right] pair of observer indices whose settled charges are compared for opposition.

### `opposed` — function

```ts
export function opposed(left: ChargeCarrier, right: ChargeCarrier): boolean
```

Two charges in directly opposed truth directions: one positive-only, the other negative-only. ⊥ and ⊤ are never opposed (no definite direction).

### `sheafCharges` — function

```ts
export function sheafCharges( charges: readonly ChargeCarrier[], edges: readonly ObserverEdge[] = completeGraph(charges.length), ): SheafConsensus
```

Network-sheaf consensus over the observer charges and the comparison graph (default: complete graph — every pair compared).

### `SheafConsensus` — interface

```ts
export interface SheafConsensus
```

The network-sheaf consensus read off a fleet of observer charges: per-component consensus, the indices of opposed edges, the H1 obstruction (first Betti number of the opposition subgraph) and whether it is zero (coordinationFree), per-component confidence, and the overall `confident` flag (coordination-free and every component pooled to a definite charge).

### `sheafObservations` — function

```ts
export function sheafObservations( observations: readonly { readonly charge: ChargeCarrier }[], edges: readonly ObserverEdge[] = completeGraph(observations.length), ): SheafConsensus
```

Consensus over any observations that carry a `charge`.

## `@emsenn/agent/harness`

### `AgentHarnessTopologyCarrier` — interface

```ts
export interface AgentHarnessTopologyCarrier extends MemeTopologyCarrier
```

A MemeTopologyCarrier branded as agent-harness topology: the settled meme floor of harness coordinates.

### `equipsPredicate` — function

```ts
export function equipsPredicate(): string
```

harness --equips--> agent : the agent this harness endows with affordances.

### `extendAgentHarnessTopology` — function

```ts
export function extendAgentHarnessTopology( carrier: AgentHarnessTopologyCarrier, delta: readonly UtteranceCarrier[], ): AgentHarnessTopologyCarrier
```

Extends an existing AgentHarnessTopologyCarrier with a delta of utterances, returning the re-settled carrier.

### `harness` — function

```ts
export function harness(input: HarnessInput): HarnessCarrier
```

Constructs a frozen harness carrier from a HarnessInput: emits one equips utterance binding the harness term to its agent and one speaks utterance per channel.

### `HarnessCarrier` — interface

```ts
export interface HarnessCarrier
```

A settled harness carrier: its namespaced term, the agent it equips, the channels it speaks over, and the utterances admitting those coordinates onto the meme floor.

### `HarnessInput` — interface

```ts
export interface HarnessInput
```

Input for constructing a harness: an id, the agent id it equips, and optional channel ids it speaks over.

### `harnessTerm` — function

```ts
export function harnessTerm(id: string): string
```

Namespaced mark for a harness: "harness.<id>".

### `induceAgentHarnessTopology` — function

```ts
export function induceAgentHarnessTopology( utterances: readonly UtteranceCarrier[], ): AgentHarnessTopologyCarrier
```

Settles a sequence of utterances into an AgentHarnessTopologyCarrier.

### `induceHarnessTopology` — function

```ts
export function induceHarnessTopology(h: HarnessCarrier): AgentHarnessTopologyCarrier
```

Settle a single harness's coordinates into a topology carrier.

### `speaksPredicate` — function

```ts
export function speaksPredicate(): string
```

harness --speaks--> channel : a channel (medium/protocol) the harness communicates over. The channel term is content-topology's channel — speaking is communication, so the medium is a content coordinate, not a harness one.

## `@emsenn/agent/session`

### `affirmed` — function

```ts
export function affirmed(witness: unknown): ChargeCarrier
```

Affirm a witnessed claim (a `potential` charge).

### `denied` — function

```ts
export function denied(witness: unknown): ChargeCarrier
```

Deny a witnessed claim (the negation — an `active` charge).

### `finding` — function

```ts
export function finding(input: { readonly session: string; readonly subject: Term; readonly predicate: string; readonly object?: unknown; readonly charge: ChargeCarrier; readonly at?: string; readonly note?: unknown; }): Finding
```

Constructs a frozen Finding binding a session id, subject term, predicate, and charge, with optional object/at/note. Defensively copies and freezes the subject array.

### `Finding` — interface

```ts
export interface Finding
```

A charge-bearing observation made during a session.

### `recall` — function

```ts
export function recall(findings: readonly Finding[], subject: Term): ChargeCarrier
```

Recall what the session knows about a subject: the knowledge-join of every finding's charge on that subject. Identity is `bottom()` (no evidence), so an unobserved subject recalls as `absurd`; conflicting findings settle to the held contradiction (`stable`, ⊤), surfaced rather than collapsed.

### `recallStatus` — function

```ts
export function recallStatus(findings: readonly Finding[], subject: Term): ChargeValueName
```

The settled value name of recall over a subject.

### `session` — function

```ts
export function session(input: { readonly id: string; readonly agent: string; readonly at?: string; readonly metadata?: Readonly<Record<string, unknown>>; }): Session
```

Constructs a frozen Session from its id, agent, and optional at/metadata. Throws TypeError if id or agent is empty; copies and freezes metadata.

### `Session` — interface

```ts
export interface Session
```

A bounded working session of one agent.

### `subjectKey` — function

```ts
export function subjectKey(subject: Term): string
```

A stable key for a subject term.

### `Term` — type-alias

```ts
export type Term = readonly string[]
```

A subject term: an ordered tuple of path segments naming what a finding observes.

## `@emsenn/agent/topology`

### `affordances` — function

```ts
export function affordances( starCarrier: StarCarrier, perceivable?: readonly TermInput[], ): readonly SectionEntry[]
```

The stable and absurd entries of a star — where the situation is contested or open — optionally restricted to predicates the locus can perceive.

### `agentCarrier` — function

```ts
export function agentCarrier(id: string, prehensions: readonly Prehension[]): AgentCarrier
```

Builds a frozen AgentCarrier from an id and a list of prehensions: derives the agent term from the id and collects each prehension's utterance.

### `AgentCarrier` — interface

```ts
export interface AgentCarrier
```

An agent's individuation state: its term identity, the prehensions by which it grasped other terms, and the utterances those prehensions yielded.

### `agentTerm` — function

```ts
export function agentTerm(id: string): string
```

Builds the canonical agent term string for an id by prefixing it with "agent.".

### `AgentTopologyCarrier` — interface

```ts
export interface AgentTopologyCarrier extends MemeTopologyCarrier
```

A MemeTopologyCarrier branded as an agent's settled topology - the carrier whose sections are an agent's perspective on what it has prehended.

### `aperiodicDream` — function

```ts
export async function aperiodicDream( task: Task, responder: DreamResponder, options: DreamOptions = {}, ): Promise<DreamResult>
```

aperiodic (dual of articulating): utter a fresh charge for a task from an injected responder. The deepest regime — non-Scott-continuous, ω₁ ≤ κ.

### `bearing` — function

```ts
export function bearing(before: MemeTopologyCarrier, after: MemeTopologyCarrier, cell: Cell): BearingJudgment
```

Between two settled states, at a cell, did the claim's potential appear (affirmation), stay put (silence), or withdraw (obstruction)? Evidence is monotone, so withdrawal refuses a bearing name. There is no denial: a contrary fact is its own claim.

### `BearingAffirmation` — interface

```ts
export interface BearingAffirmation
```

A bearing reading where a claim's potential appeared at a cell: the cell with its charge value before and after settlement.

### `BearingJudgment` — type-alias

```ts
export type BearingJudgment = BearingAffirmation | BearingSilence | BearingObstruction
```

The outcome of a bearing read at a cell: an affirmation, a silence, or an obstruction.

### `BearingObstruction` — interface

```ts
export interface BearingObstruction
```

A bearing reading where a claim's potential withdrew at a cell: the cell with its charge value before and after. Evidence is monotone, so withdrawal refuses a bearing name.

### `BearingSilence` — interface

```ts
export interface BearingSilence
```

A bearing reading where a cell's truth-presence stayed put between two settled states: the cell and its unchanged charge value.

### `dreaming` — function

```ts
export function dreaming( input: { readonly observations?: readonly Observation[]; readonly regime?: Exclude<DreamRegime, "aperiodic"> } = {}, options: DreamOptions = {}, ): DreamResult
```

Dispatch the synchronous (non-aperiodic) regimes over a single observation set.

### `DreamOptions` — interface

```ts
export interface DreamOptions
```

Options shared by every dream regime: at is the locus stamped on generated observations, observer is the observer label they carry, and limit caps how many observations are produced.

### `DreamRegime` — type-alias

```ts
export type DreamRegime = "strict-finite" | "scott-continuous" | "transfinite" | "aperiodic"
```

The four dream regimes: the four-regime predication grammar read generatively, each the dual of a descent morphism, classified by closure ordinal κ - strict-finite (κ = ω₀), scott-continuous (κ = ω), transfinite (ω < κ < ω₁), aperiodic (ω₁ ≤ κ).

### `DreamResponder` — type-alias

```ts
export type DreamResponder = (task: Task) => Promise<ChargeCarrier> | ChargeCarrier
```

A responder that charges a fresh task — the injected, non-deterministic source (an LLM) the aperiodic regime draws on. Kept injected so the module stays pure.

### `DreamResult` — interface

```ts
export interface DreamResult
```

The outcome of a dream: the regime that produced it, the generated observations, and the pooled charge (the knowledge-join of every dreamt charge, ⊥ if none).

### `extendAgentTopology` — function

```ts
export function extendAgentTopology( carrier: AgentTopologyCarrier, delta: readonly UtteranceCarrier[], ): AgentTopologyCarrier
```

Extends an existing agent topology with a delta of further utterances, returning the re-settled AgentTopologyCarrier.

### `induceAgentCarrierTopology` — function

```ts
export function induceAgentCarrierTopology(agent: AgentCarrier): AgentTopologyCarrier
```

Settles an AgentCarrier's own utterances into an AgentTopologyCarrier - the agent's perspective as a topology.

### `induceAgentTopology` — function

```ts
export function induceAgentTopology(utterances: readonly UtteranceCarrier[]): AgentTopologyCarrier
```

Settles a list of utterances into an AgentTopologyCarrier by inducing a meme-topology over them.

### `perform` — function

```ts
export function perform(prior: readonly UtteranceCarrier[], input: ArticulationInput): PerformanceCarrier
```

Perform an articulation against a standing corpus: the world before, the world after, both whole. An articulation acts on a world; founding a world is `induce`.

### `PerformanceCarrier` — interface

```ts
export interface PerformanceCarrier
```

The result of performing an articulation against a world: the articulation carrier, the whole world settled before and after, and the posterior corpus of utterances.

### `regulate` — function

```ts
export function regulate(prior: readonly UtteranceCarrier[], input: RegulationInput): RegulationCarrier
```

Reads a regulation judgment over a prior corpus and, if the judgment proposes a correction articulation, performs it - returning the judgment with any resulting performance.

### `RegulationCarrier` — interface

```ts
export interface RegulationCarrier
```

The result of regulating a corpus: the regulation judgment and, when a correction was proposed and performed, the resulting performance.

### `RegulationInput` — interface

```ts
export interface RegulationInput
```

The terms a regulation reads against: the system, the variable being regulated, the state predicate, the setpoint object, and the event naming a correction articulation.

### `RegulationJudgment` — type-alias

```ts
export type RegulationJudgment = RegulationWitness | RegulationObstruction
```

The outcome of a regulation read: a witness when the variable holds its setpoint, or an obstruction when it is unposited or deviating.

### `RegulationObstruction` — interface

```ts
export interface RegulationObstruction
```

A regulation reading where the variable is off its setpoint: the input, the reason, the setpoint's charge value, the standing deviations, and - for an unposited setpoint - a proposed correction articulation.

### `RegulationObstructionReason` — type-alias

```ts
export type RegulationObstructionReason = "unposited" | "deviating"
```

Why a regulation read obstructs: "unposited" when the setpoint is absurd, "deviating" when the variable holds co-states other than the setpoint.

### `regulationRead` — function

```ts
export function regulationRead(carrier: MemeTopologyCarrier, input: RegulationInput): RegulationJudgment
```

Reads a regulation judgment off a settled carrier: finds the setpoint's charge and the variable's deviating co-states, returning a deviating or unposited obstruction otherwise a witness. An unposited obstruction carries a proposed correction articulation.

### `RegulationWitness` — interface

```ts
export interface RegulationWitness
```

A regulation reading where the variable sits at its setpoint with no deviation: the input and the setpoint's charge value.

### `scottContinuousDream` — function

```ts
export function scottContinuousDream(observations: readonly Observation[], options: DreamOptions = {}): DreamResult
```

scott-continuous (dual of positing): consolidate repeated cells by knowledge-join. A cell observed ≥2 times pools its evidence. ω-bounded, coordination-free.

### `star` — function

```ts
export function star(section: SectionCarrier, term: TermInput): StarCarrier
```

Builds a StarCarrier for a term over a section: collects the entries mentioning the term as subject or object and partitions out those reading stable and absurd.

### `StarCarrier` — interface

```ts
export interface StarCarrier
```

A term's situation in the world: every section entry whose subject or object is the term, with the contested (stable) and open (absurd) entries singled out.

### `strictFiniteDream` — function

```ts
export function strictFiniteDream(observations: readonly Observation[], options: DreamOptions = {}): DreamResult
```

strict-finite (dual of settling): compose observations where one's object is the next's subject, the weaker charge holding (meet). κ = ω₀.

### `transfiniteDream` — function

```ts
export function transfiniteDream(observations: readonly Observation[], options: DreamOptions = {}): DreamResult
```

transfinite (dual of predicating): co-predicate every pair sharing a subject, the weaker charge holding (meet). Combinatorial enumeration, ω < κ < ω₁.

## `@emsenn/agent/trace`

### `AdmissionJudgment` — interface

```ts
export interface AdmissionJudgment
```

A named, charged verdict from an admission layer: name identifies the check, value is the bilattice charge value carried as trace data, reason explains the verdict, and path locates the subject that was judged.

### `cellOfTerms` — function

```ts
export function cellOfTerms(subject: TermInput, predicate: TermInput, object?: TermInput): Cell
```

The cell named by term inputs; an absent object reflects the subject, as in bedrock articulation.

### `cellOfUtterance` — function

```ts
export function cellOfUtterance(carrier: UtteranceCarrier): Cell
```

The cell an utterance articulates, as bedrock predication derives it: a relational token mark spans subject —claim→ object, anything else is the diagonal.

### `chargeNameOfCarrier` — function

```ts
export function chargeNameOfCarrier(carrier: ChargeCarrier): ChargeValueName
```

Read a bedrock charge carrier down to its value name.

### `chargeNameOfSides` — function

```ts
export function chargeNameOfSides(truthPresent: boolean, falsityPresent: boolean): ChargeValueName
```

The charge value named by a pair of evidence sides. Total: FOUR covers all four side pairs.

### `chargeSidesOf` — function

```ts
export function chargeSidesOf(name: ChargeValueName): readonly [truthPresent: boolean, falsityPresent: boolean]
```

Which evidence sides a charge value admits: [truth present, falsity present].

### `foldTrace` — function

```ts
export function foldTrace(entries: readonly TraceEntry[]): readonly TraceCellReading[]
```

Fold a trace per distinct cell: induce the world the trace utters, and read each cell's MEASURED charge from the knowledge-least section, with the entries' provenance accumulated per cell at the trace layer. There is no cheaper honest read — the charge of a cell exists only in the induced world, so this is exact and expensive, never a hot path. Ordering law: the cells themselves carry no intrinsic order. The only order the data provides is the trace's own sequence, inherited here as first-appearance order under the quotient. Any other ordering (sorting by a serialized key) is a presentation choice and belongs at the boundary, explicitly.

### `joinKnowledgeNames` — function

```ts
export function joinKnowledgeNames(names: Iterable<ChargeValueName>): ChargeValueName
```

Knowledge-join a sequence of charge value names. Empty joins to "absurd" (the knowledge bottom).

### `JudgmentSettlement` — interface

```ts
export interface JudgmentSettlement
```

The settled reading of a set of admission judgments: value is the knowledge join of every judgment's charge value, judgments holds the inputs, and stableJudgments holds those whose value is "stable" - held contradictions rendered rather than thrown.

### `settleJudgments` — function

```ts
export function settleJudgments(judgments: readonly AdmissionJudgment[]): JudgmentSettlement
```

Settles a list of admission judgments into a frozen JudgmentSettlement: joins their charge values with the knowledge join, preserves the judgments, and collects the "stable" ones separately.

### `TraceCellReading` — interface

```ts
export interface TraceCellReading
```

The folded result for one distinct cell: its subject, predicate, and optional object, the charge value measured at that cell in the knowledge-least section of the induced world, and the provenance of every entry articulating the cell in trace order.

### `TraceEntry` — interface

```ts
export interface TraceEntry
```

One claim in a trace: names a cell as subject -predicate-> object (two-place when object is absent, articulated on the diagonal) plus an opaque provenance carried only at the trace layer. An entry carries no charge - a contrary fact is a separate entry asserting a contrary predicate.

### `UtteranceLog` — class

```ts
export class UtteranceLog
```

An in-memory, append-only log of utterances keyed by the cell each articulates: admits carriers accretively and never overwrites, recalls and tests them by cell, and on explicit reads induces the world they utter or a section of it.

### `utterEntry` — function

```ts
export function utterEntry(entry: TraceEntry): UtteranceCarrier
```

The single utterance a trace entry articulates: relational when the entry is three-place, diagonal when it is two-place.

### `utterTrace` — function

```ts
export function utterTrace(entries: readonly TraceEntry[]): readonly UtteranceCarrier[]
```

The utterances of a whole trace, in entry order.
