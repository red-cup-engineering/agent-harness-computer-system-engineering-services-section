---
date: 2026-05-28
kind: derivation
$thing: claude-code-harness
---

# Context-spacesuit + working memory: the residuation pair, on the harness

## What this adds and why

emsenn asked for (1) a memory system that works -- the swarm infers, from a session transcript, what the conductor should know, and *places* it where needed -- and (2) richer context-spacesuit machinery to orchestrate.
Studied, these are one thing from two sides: the **residuation pair** the harness already rides.
Memory-growth is extension (the *answering* half: positing into the fiber); suit-composition is restriction (the *referencing* half: projection out of the fiber).

Grounded in: - `lab/archive/relating-repo/.../terms/context-spacesuit.md` -- the suit IS the agent's fiber; loading = extension; constraining perception = restriction; different suits = different Umwelten. - `.../texts/context-spacesuits-in-agentic-ai.md` -- six suit components (Identity, Constraints, Capabilities, Perception, Memory | Mission); the 515x context-overhead finding; the cure = a zero-token deterministic kernel + a ~1.5K minimal suit, everything else looked up on demand. - `development/experimental/spotcomp/src/continuous-learning-profile.mjs` -- the boundaries, which I re-implemented as local conformance tests rather than importing (self-containment): `answeringReferencingCycle`, `memoryBoundary` (typed resource + provenance + governed), and the decisive `implementationBoundary.noContextPresenceAsDurableLearning` and `codeRemainsProbe`.

## The decisive boundary

`noContextPresenceAsDurableLearning`: being in the spacesuit is NOT learning.
This forces a clean split that naive memory systems get wrong -- the read path and the write path are different morphisms: - `suiting` (read / referencing / restriction) composes a suit and **writes nothing durable**. - `consolidating` (write / answering / extension) is the **only** thing that posts memory, and only as a typed `memory` row carrying provenance (`evidence`) and a `placement`, behind a governance gate.

That split is why the suit can evolve without the substrate drifting -- the exact cure to the memory drift that opened the engagement.
The kernel (scripts) does zero-token work; the logs are the substrate (`codeRemainsProbe`).

## What was built (inside the claude-code carrier)

- Objects: `hacking/library/memory` (typed provenanced fragment), `suiting/library/context-spacesuit` (the six-component loadout, `instance-of: fiber`, with a `tokenEstimate`), `hacking/consolidating/hacking/library/session-trace` (a transcript).
- Morphisms: `hacking/consolidating` (session-trace -> memory[], swarm-enacted, gated, PURE) and `suiting` (available-memory + task + budget -> context-spacesuit, restriction, PURE).
- `lifecycle.mjs` at the catalog root: `sessionStart` (suit up, no write) and `sessionEnd` (consolidate, the only durable write -- memory store + placement anchor).
  The evolution loop.

## Verified facts (not hopes)

- `npm test` (`node --test conformance/*.test.mjs`) is green -- 17 tests.
  (The bare-directory form `node --test conformance/` mis-discovers on Node 22.22 and is not the supported command; the same files pass when named, so this is a runner quirk, not a catalog defect.)
  The new laws: suiting writes nothing durable; session-end appends exactly its rows; every memory row carries provenance + placement; the governance gate can drop ungoverned candidates; consolidated memory becomes referenceable in a later suit (the answering/referencing cycle closes); the suit respects its token budget and projects a subset of available memory.
- `node lifecycle.mjs --session-start <task>` prints a minimal suit and grows no log; `node lifecycle.mjs --session-end <text>` appends provenanced memory; a second `--session-start` then carries that memory -- the loop is observable.

## Admitted (`hacking/`), flagged for emsenn

- The morphism names `consolidating` / `suiting` are my coinages (the *concepts* -- context-spacesuit, the answering/referencing cycle -- are repo-derived).
  Parked under `hacking/`.
- The governance gate is a deterministic stub; wiring it to the real operations/budget math (`OPERATIONAL-MATH-FUNCTIONS.md` cost-compose / budget-check) is a later pass.
- Memory filing here is memory-store + placement-anchor; reconciling fully with the §4 e/a dual-filing for memory rows is a later refinement.
