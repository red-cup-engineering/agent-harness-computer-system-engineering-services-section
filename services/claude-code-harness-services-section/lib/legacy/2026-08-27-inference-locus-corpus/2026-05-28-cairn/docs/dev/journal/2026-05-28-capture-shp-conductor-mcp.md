---
date: 2026-05-28
kind: derivation
$thing: claude-code-harness
---

# Phase 3: capture everything, talk to the swarm, project as semantic hypertext

## Built (grounded in repo prior art, not from scratch)

- **Capture ALL activity** (`capturing` + `capture.mjs`): the IO-ARTICULATION rule (`external I/O → utterance → articulating → claim`) over the whole surface.
  Every tool call / completion / hook event transduces into a captured claim the swarm can process.
  Per `spotcomp/IO-ARTICULATION.md`.
  (Real `.claude` hook wiring = Phase 4.)
- **Semantic hypertext packets** (`projecting` → `library/packet/library/semantic-hypertext-packet`): built to `spotcomp/SHP.md` exactly — `class` names the producing morphism, `data-e`/`data-a`/`data-v` carry EAVT coordinates, full HTML doc, UTF-8, **no scripts**, RFC-7992 inhabitant profile, deterministic + monotone, projected from a settled frontier; inverse `parse` is the admission side.
  Pathing per emsenn: `projecting` (general morphism) → `packet` (general object) → SHP (a packet kind). **Why HTML:** packets are always finite/Scott-continuous data; JSONL = substrate, **HTML = inter-LLM wire** (validatable grammar), Markdown = human-operator kind only.
- **Conductor MCP** (`conductor-mcp.mjs`): `daydream` / `inquire` / `derive` — tools to TALK TO the swarm (utterance-producing acts dispatching to morphisms), not to act in-repo.
  Thin stdio transport; `.mcp.json` registration = Phase 4.
  (Pattern from the prior relationality `mcp_server.py`: tools = earned acts.)
- **Modeled-player upgrade** (`being` → `agent`): per `spotcomp/MODELED-PLAYERS.md` `P = (id, Cap, handedness, Gov, In, Out)`.
  `In`/`Out` are EAVT traces — the member's OWN logs.

## emsenn's spiral framing (the two hands)

The two handednesses are the two hands of **`experiencing/`** (within `doing/`): - **`learning/`** — the inward hand (brain): observes the shared trace, posits, dreams. - **`sensing/`** — the outward hand (a **drone**): observes the environment (repo, web), actuates reads/searches, takes the outside world into its own observation, reports claims back.

The spiral: **sensing → being → doing → experiencing → sensing** — the fractal/loop.
`agent.kind` now names the hand (`learning` | `sensing`); a `sensing` agent gets outward handedness (observe repo/web, actuate read-repo/web-search).
The **drone/advisor loop** — a drone learns an unfamiliar token from repo/web so the next encounter gets an advisor context-injection — is the forward use of this seam.

## Next structural seam (journaled, not yet built)

Realize `experiencing/` as an explicit substructure under `doing/`, with `learning/` and `sensing/` as its two sub-morphisms, and wire the sensing→being→doing→experiencing spiral as a cycle.
The drone crawl (repo read / web search → captured claims → consolidated memory → advisor injection on token recurrence) is the headline feature it unlocks.

## Verified facts

`npm test` green. capture transduces tool calls/completions into claims and appends them; SHP projects to scriptless HTML with `class`=morphism + `data-e/a/v` and round-trips through parse; the conductor MCP exposes daydream/inquire/derive and `inquire` drives a real swarm study; the learning and sensing hands carry the right handedness and their own inbox/outbox traces.

## Admissions (`hacking/`, flagged)

- `capturing` / `projecting` / `daydreaming` / `inquiring` / `deriving` names are coinages.
- MCP transport is minimal; full protocol + `.mcp.json` registration = Phase 4.
- Modeled-player is an additive partial (MODELED-PLAYERS D9 blocks final conformance).
- `experiencing/` substructure + the drone crawl/advisor loop are the next seam.
- Real `.claude` hooks, real cost math, real sheaf-Laplacian remain deferred.
