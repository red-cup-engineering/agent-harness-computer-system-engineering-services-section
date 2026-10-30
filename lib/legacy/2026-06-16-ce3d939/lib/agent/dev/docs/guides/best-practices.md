# @emsenn/agent - best practices

A how-to for consuming `@emsenn/agent` well. The package is one descent of
module subpaths over the relationality charge substrate; consume it through the
named subpaths, keep I/O at your edge, and let the bilattice do the settling.

## Import the named subpaths, not deep dist paths

Import from the published subpaths declared in `exports`. Never reach into
`dist/`, `.mjs` files by path, or any internal module - those are not part of
the contract and will move.

```ts
// good
import { fiber, provisions, articulating, settledCharge } from "@emsenn/agent/algebra";
import { residuate, admitTool, office } from "@emsenn/agent/fleet/algebra";
import { sheafCharges, opposed } from "@emsenn/agent/fleet/topology";
import { decide, type Proposal } from "@emsenn/agent/decision";

// bad - not part of the contract, will break
import { fiber } from "@emsenn/agent/dist/algebra/agent-algebra.mjs";
```

The root `@emsenn/agent` re-exports each module under its own namespace
(`algebra`, `topology`, `fleet`, `session`, `swarm`, `harness`, `trace`,
`decision`, `claude`) for discoverability. Prefer the subpaths for the flat
symbol surface; use the root namespace only when you genuinely want several
modules at once.

```ts
import * as agent from "@emsenn/agent";
agent.algebra.articulating(/* ... */);
agent.fleet.algebra.residuate(/* ... */);
```

Note: `@emsenn/agent/federation` is a published subpath but is NOT in the root
namespace barrel. Reach the federation layer by its subpath only.

## Which subpath to reach for

- The individual agent (identity, predication, descent, handedness, capability
  fiber, prose->observations): `@emsenn/agent/algebra`.
- Measuring change between two settled states: `@emsenn/agent/analysis`
  (`transition`).
- Settling agents into a graph; dreaming: `@emsenn/agent/topology`.
- A collective's work, offices, dispatch, governance: `@emsenn/agent/fleet/algebra`.
- Settling a collective's many charges into consensus / opposition cohomology:
  `@emsenn/agent/fleet/topology`.
- Episodic working memory (findings, recall): `@emsenn/agent/session`.
- A harness as a meme-topology: `@emsenn/agent/harness`.
- Claude models / Claude Code / the CLI harness diamond: `@emsenn/agent/claude`,
  `/claude/code`, `/claude/code/cli-harness`.
- Articulated traces and the accretive utterance log: `@emsenn/agent/trace`.
- Budgeted decision-as-morphism: `@emsenn/agent/decision`.
- Cross-observer federation over assertion worlds: `@emsenn/agent/federation`.

## I/O as values: hand it in, do not let it reach out

The library modules are pure. They do no I/O they were not handed. There is no
`fetch`, no clock, no `fs` reach inside the algebra, topology, session, trace,
decision, or federation modules - the only I/O in the package lives in the four
bin-script `main` functions (`agent-admit`, `agent-govern`, `agent-dispatch`,
`agent-consensus`), where stdin/path reads happen at the CLI edge and the parsed
request is passed inward as a value.

Follow the same discipline as a consumer:

- Time enters as a value. `Session`, `Finding`, and `captureLanguage` take an
  `at` field/option; pass your own timestamp - do not expect the library to read
  a clock.

  ```ts
  import { session, finding, affirmed } from "@emsenn/agent/session";
  const now = new Date().toISOString();          // read the clock at YOUR edge
  const s = session({ id: "s1", agent: "a1", at: now });
  const f = finding({
    session: s.id,
    subject: ["repo", "main"],
    predicate: "builds",
    charge: affirmed("ci log #42"),
    at: now,
  });
  ```

- Observer and provenance enter as values. `captureLanguage(text, { observer,
  at, subject })` takes the observer identity rather than inventing one.

- Files and network are yours to read. Read the file, fetch the payload, parse
  it, then hand the parsed value to the library function. The library settles
  charges from the world you induce; it never goes and gets one. Charges are
  measured from an induced world, never seeded - an unobserved subject reads
  `absurd`, not a denial.

## sideEffects: false and tree-shaking

`package.json` declares `"sideEffects": false`. Every module is pure: importing
a symbol pulls in nothing else, and bundlers may drop any export you do not use.

To get the benefit, import only the symbols you need from the narrowest subpath:

```ts
import { decide } from "@emsenn/agent/decision";   // tree-shakeable
```

Pulling the whole root namespace (`import * as agent from "@emsenn/agent"`) and
touching one method defeats this - you reference the whole barrel. Prefer named
subpath imports in code you bundle.

## Subpaths and the semver promise

This package is `private` and at version `0.0.0` - treat the whole surface as
pre-1.0 and expect movement. Within that:

- `@emsenn/agent/swarm` is presently an empty module (`export {}`). It is the
  migration target for `lib/swarm`'s agent-domain modules; its surface will grow
  and is not stable. Do not build against it yet.
- The `claude` diamond docstrings say plainly that legacy session/world/
  governance-store/mcp/hooks modules are being deleted as their proper homes
  land. Importing from `@emsenn/agent/claude*` means tracking that carving.
- Anything not named in `exports` (the raw `dist/` tree, per-file `.mjs`
  internals) carries no promise at all. Importing it implies you accept it
  breaking on any change.

## Tests are theorem-shaped

Each `*.test.mts` names a falsifiable claim, not a procedure. A test title is a
theorem the module must satisfy, for example:

- "federate is an idempotent commutative G-Set union by assertion content"
- "refusal is the gate's own claim of the contrary predicate, not a denial"
- "absence of recognition reads absurd, never active"
- "captureLanguage lifts each predication cell to a charged observation"

Read the test names as the module's specification. When you change behavior or
add one, write the title as a claim that is true or false about the code - if
you cannot phrase it that way, you have not pinned down what you are asserting.
The suite builds first (`pnpm test` runs the build, then the type-checked test
compile, then `node --test`), so tests run against the emitted artifacts, not
the sources.

## Common pitfalls

- Reading `absurd` as `false`. `absurd` is no evidence (the knowledge bottom);
  `active` is a denial. `recall` over an unobserved subject is `absurd`, and an
  unrecognized federation source reads `absurd` - never an `active` denial. Test
  for the value name you mean.

- Expecting contradictions to be resolved. `recall` and the knowledge join keep
  contradictions: two opposing findings settle to `stable` (top), surfaced for
  you to handle, not silently collapsed to one side.

- Trying to re-seed or re-admit a charge. There is no verb that re-admits a
  charge, polarity, or denial. Found a world by explicit induction and measure
  from it.

- Confusing the two fleet layers. `fleet/algebra` does no settling - dignitas/
  incumbency settling and the Q-enough sheaf consensus live in `fleet/topology`.
  Reach for `topology` when you need consensus or the opposition obstruction
  (H1 of the observer graph), `algebra` for dispatch, offices, and governance
  gating.

- Looking for the individual fiber in the fleet. `fiber`/`provisions` are the
  individual agent's substrate from `@emsenn/agent/algebra`; `fleet/algebra`
  only re-exports them. Likewise the descent cycle lives in `algebra`, folded in
  because any thinking agent wants it.

- Looking for the LLM sub-domain here. It moved out to `@emsenn/llm`. This
  package is the agent domain; the claude diamond covers only the claude models
  and their harness as meme-topologies, not LLM transport.

- Treating bin-script exit codes as the decision. The scripts emit the charge as
  DATA and exit 0 whenever a decision was computed. To gate on a denied charge
  in a pipeline, pass the script's gating flag (e.g. `--fail-on-denied`).
