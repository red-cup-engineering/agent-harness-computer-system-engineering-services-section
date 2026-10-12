---
date: 2026-05-28
kind: derivation
$thing: claude-code-harness
---

# The cognitive layer: cognitive-verb MCP, internal dreaming, recognition-weighted memory

## Built

- **Recognition-weighted memory** (`recognizing`, per `spotcomp/RECOGNITION.md`): trust derived from
  PROVENANCE (the recognition-fiber, read from `evidence`), never from `{e,a,v,t}`. Tiers: **sense**
  (your prompts, tool/world results) > **remembered-sense** > **learning** (dream/inference). Learning
  decays with age; sense does not -- so world-truths dominate over time, and on conflict **sense beats
  learning**. `suiting` now ranks by weight and collapses each `(subject,predicate)` to its
  highest-trust value -- the structural fix for the dream's `json` error losing to your `HTML` sense.
- **Internal dreaming** (`dreaming`): NO network. Deterministic local-derivation rules (MLD-style:
  composition, generalization, contradiction-surfacing) recombine the structured memory. It can only
  reorganize what was observed -- it cannot invent facts -- so its output is learning-tier and yields
  to sense. Because it is free and deterministic, dreaming now runs in the **Stop hook** (per-turn
  consolidation) instead of being a manual network step. `dream.mjs` rewritten to internal; `enactors`
  stays only for the OUTWARD verbs.
- **Cognitive verbs** (morphisms + cognitive MCP `conductor-mcp.mjs`):
  - inward (no network): `thinking` (one descent), `remembering` (recognition-weighted recall),
    `wondering` (surface `⊤`/gap questions), `daydreaming` (internal dream), `imagining` (hypothetical
    recombination, low-trust), `ruminating` (bounded re-derivation -- self-reflection, not endless loop).
  - outward (network): `inquiring` (swarm study), `deriving` (settle a goal), `exploring` (sensing
    drones crawl repo/web -- the "new exploring", reader injected).

## Grounding (prior art used, not reinvented)

- `RECOGNITION.md` / `TRACE-AXES.md`: recognition-fiber + provenance as the trust axis.
- Relationality **acts** (`StepRecognition`, `Reflex`, `flow_observation`, `evaluate_judgement`): cognitive verbs as trace-rewriting morphisms.
- MLD (`CATEGORICAL-MACHINERY §291`, `strong-mld-via-composed-duality`): local-derivability basis for internal dreaming (finite rule set here; full MLD-class derivation gestured at, not proved).
- Rumination note (`.../neuroreflexivity/...
  `): the bound between rumination and self-reflection -> `ruminating` halts when it stops producing.

## Verified facts

`npm test` green.
Recognition: sense outranks learning, learning decays, sense persists, and a sense/learning conflict in `suiting` resolves to the sense value.
Internal dreaming derives by composition + contradiction-surfacing with NO network (runs under sandbox).
The verbs behave; `thinking` settles a cell in one descent.
The cognitive MCP exposes all nine tools; inward tools need no network.
The Stop hook now dreams internally each turn and recomposes the wake spacesuit.

## Admissions (`hacking/`, flagged)

- Verb names + inward/outward split are coinages aligned to the relationality acts.
- Internal dreaming uses a finite local-rule set; full MLD-class-preserving derivation is prior art.
- Recognition weight is a provenance heuristic; recognition-cell settlement (`RECOGNITION.md`) is a declaration obligation, not proved.
- `.mcp.json` registration of `conductor-mcp.mjs` activates next session (fake via `node` until then).
- Turning raw utterances into structured claims is still a sensing act; internal dreaming consolidates already-structured memory.
  The cheap structural parse of raw prompts -> claims is a later seam.
