# claude-code-harness

`@561/claude-code-harness` · version `2026-05-28-cairn`

A self-contained [TRC](#the-trc--thing-discipline) catalog that makes **Claude Code a memory-bearing conductor of an LLM swarm**, built on this repo's four-regime categorical mathematics.
It is the running form of one idea: *Claude Code is not a tool that has a harness — it is the consciousness of an organism whose brain is a swarm of cheap LLM enactors, whose body is the tool/IO surface, and whose memory is settled, not stored.*

> **Status: experimental, honest-about-it.** Almost everything is wrapped in `hacking/` — the code *runs and is tested*, but the deep categorical claims (regime placements, closure-ordinal proofs, MLD-class derivation, recognition-cell settlement) are *gestured at, not proved*.
> Names like the regime-prefixed dreams are coinages aligned to the grammar.
> Where the math is open, it is admitted, not faked.

---

## Quick start

```bash
npm test                                   # 41 conformance tests (hermetic, no network)

node lifecycle.mjs --session-start "task"  # compose the context spacesuit (no durable write)
node lifecycle.mjs --session-end "text"    # capture + consolidate a turn
node dream.mjs                             # INTERNAL dream (no network): consolidate memory, recompose the wake suit
node conductor-mcp.mjs --demo              # exercise the inward cognitive tools

# requires a free LLM endpoint key in env (GROQ_API_KEY / NVIDIA_API_KEY / CEREBRAS_API_KEY):
node live-demo.mjs "a claim to settle"     # a real multi-provider swarm settles a claim
```

## The live loop (wired via hooks + MCP)

When this repo's `.claude/settings.json` and `.mcp.json` are active, the harness sits *between the user's keyboard and the model's eyes*:

| event | hook | what happens |
|---|---|---|
| `SessionStart` | `session-start-inject.mjs` | injects `wake-spacesuit.html` as context — the agent wakes carrying what it dreamed |
| `UserPromptSubmit` | `prompt-ingress.mjs` | the prompt enters as a (sense-weighted) utterance; the harness composes an SHP context-spacesuit and injects it |
| `Stop` | `capture-hook.mjs` | captures the reply, then runs an **internal dream** (network-free) and recomposes the wake suit |

The conductor also gets **cognitive MCP tools** (`conductor-mcp.mjs`): `remember`, `wonder`, `imagine`, `ruminate`, the four dreams, `inquire`, `derive`, `explore`.

## Architecture

Two towers of `$thing`s descend the four-regime grammar (`articulating → predicating → positing → settling`):

- **Meaning tower** (what is known): `articulating` (utterance → potential cell, forces FOUR) → `predicating` → `positing` (knowledge-order join) → `settling` (finite LFP) → `eavt-row`.
- **Action tower** (what is done): `being` → `doing` → `working` → `governing`, under the `claude-code` carrier.
  Agents are **modeled-players** with `learning` (inward) / `sensing` (outward, drone) hands.

On top of these:

- **Memory = settled consensus, not a sidecar.** `capturing` (IO → utterance → claim), `consolidating` / `studying` (swarm settles claims; consensus = knowledge-meet, disagreement = open `⊤`), `suiting` (compose a minimal **context-spacesuit** from relevant memory).
- **Recognition weighting** (`recognizing`): trust by provenance — **sense > remembered-sense > learning**; learning decays, sense persists; conflicts resolve to sense.
- **SHP** (`projecting` → `semantic-hypertext-packet`): an `<article>` HTML packet that *is a TRC/TDP over the wire*.
  Finite (data-only) for inspection; **Scott-continuous** when it also carries schema + scripts a capable recipient can run.
  HTML is the inter-LLM wire; Markdown is for humans.
- **Cognitive verbs** + **the dream regime-tower** — see below.

### The dream regime-tower

Four dreams, one per regime, placed *structurally* at the four depths of the descent.
Finite dreaming is the categorical **shadow** of aperiodic dreaming through the two middles:

| dream | regime | κ | does | network |
|---|---|---|---|---|
| `aperiodic-dreaming` | aperiodic | ≥ω₁ | channels genuinely NEW facts via the LLM ("outside the self") | yes |
| `transfinite-dreaming` | transfinite-bounded | ω<κ<ω₁ | derives new PREDICATES from co-occurrence | no |
| `scott-continuous-dreaming` | Scott-continuous | =ω | consolidates EVIDENCE per cell to the directed-sup limit | no |
| `finite-dreaming` | strict-finite | <ω | RECOMBINES existing claims to a finite fixed point | no |

Generativity climbs the tower; only the aperiodic dream needs the network, because only it adds generators not derivable from inside the fibers.

## The TRC `$thing` discipline

Every typed resource is a `$thing` with three co-located parts at one POSIX path (per the canonical TRC spec): `<slug>.schema.json` (the fiber type), `<slug>.jsonl` (EAVT positing events — the fiber's elements), and, for morphisms, `scripts/<slug>.mjs` (a knowledge-monotone closure rule).
The **path is the categorical identity**.
Scripts import dependencies by `#alias` (never relative path), so the whole catalog is **relocatable**: `git mv` it into the OS `claude-code` slot and nothing breaks.
Schemas use absolute `$id` URIs for the same reason.

## Conformance

`npm test` runs `conformance/*.test.mjs`: every `$thing` is a complete three-part resource; schemas are valid and carry `$schema`/`$id`/`title`/`kind`; morphisms have scripts; no substrate `.mjs` imports by relative path or reaches outside the catalog; the import map resolves; and the math holds (FOUR; the four-stage descent; recognition weighting; network-free dreaming; the dream tower; SHP round-trip).

## Grounding (prior art this is built on)

`development/experimental/spotcomp/`: the canonical **TRC spec**, `IO-ARTICULATION.md` (the capture rule), `SHP.md` (the packet form), `RECOGNITION.md` (trust by provenance), `MODELED-PLAYERS.md` (swarm members), `CATEGORICAL-MACHINERY.md` (MLD).
The handrolled SPOTCOMP spec is authoritative; the experimental `trc-layout` tooling is **not** used here.

## The split with `@561/swarm-intelligence`

This harness is a **generated carrier over the swarm substrate**: `swarm-intelligence` is the generator, and `claude-code-harness` is `claude-code` bound into it as a recognized-conductor modeled-player.
The authority for what lives where — the two-axis disambiguation (descent/fibration vs regime/closure = the bigraded diamond), the generator→generated cut, the dream coincidence theorem, and Q-enriched memory — is [`swarm-intelligence/docs/GENEALOGY.md`](../swarm-intelligence/docs/GENEALOGY.md).
Inference, endpoints, the descent chain, SHP, the context-spacesuit, swarm study, sensing, memory, and dreaming are the swarm's; the harness keeps the MCP tool surface, the live hooks, transcript capture, and the conductor office/persona, delegating the rest.

## Layout

```
package.json            # the #schema/#script import map (the relocatability mechanism)
conductor-mcp.mjs       # cognitive MCP server (tools to THINK, not to act in-repo)
lifecycle.mjs           # sessionStart / sessionEnd / swarmStudy / tick
dream.mjs               # internal (network-free) dream entrypoint
enactors.mjs            # the impure boundary: real free LLM endpoints (outward verbs only)
{prompt-ingress,capture-hook,session-start-inject}.mjs   # the live hooks
conformance/            # the test suite
tools/                  # utilities (e.g. read a Claude-native transcript)
docs/dev/journal/       # the build log: each conceptual move, dated, with admissions
articulating/ …         # the $thing catalog: the two towers + claude-code carrier
```

Read the journals in `docs/dev/journal/` for the why behind each piece — they record what is real, what is admitted, and the corrections that shaped it.
