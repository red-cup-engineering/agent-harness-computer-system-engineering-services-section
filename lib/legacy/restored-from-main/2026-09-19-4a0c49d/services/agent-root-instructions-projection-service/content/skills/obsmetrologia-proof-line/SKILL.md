---
name: obsmetrologia-proof-line
description: How a theorem enters Obsmetrologia — work order, red blueprint node, Lean proof through the Lean language-server MCP, four-gate audit, receipt, green node, verse. Load before touching lib/obsmetrologia or when the owner names a proof target (hat tiles, a witness, a frontier node).
---

# Extending Obsmetrologia through the proof line

The section owns the line; this skill only points at it. Section root:
`lib/emsenn/services/561-group/services/science-services-section/services/information-science-services-section/services/math-services-section/services/obsmetrological-services-section`
(the Lean package is its `lib/obsmetrologia`, Lean `v4.31.0` pinned in
`lean-toolchain`; the section README names every instrument).

Agency: `lib/agency/` holds the section's offices, characters, and
incumbencies, org-owned and harness-neutral (both harness policies name the
same records). `offices/mathematical-library-steward.json` extends the
library, only through the line, held by `characters/harriet-metz.json`;
`offices/obsmetrologia-consultant.json` answers from the record and may not
edit it, held by `characters/verity-reade.json`. Both are projected agents.

Lean diagnostics go through the `lean-lsp` MCP (`.mcp.json`). When a session
starts without its `lean_*` tools, the fallback is a scratch file under the
scratchpad run with `lake env lean <file>` from `lib/obsmetrologia` (imports
resolve against the built `.lake`), and the miss is admitted with
`admit-friction.mjs --kind missing-capability`.

## The order of work (owner-ruled shape: one audit per domain — blueprints, proofs, verses)

0. **Pre-blueprint: draft from a red node.** Every order seats its next
   targets as red frontier nodes; the next order is drafted from one of them,
   never from a blank page:
   `node scripts/draft-proof-work-order.mjs --label thm:<name>` prints an
   `ObsmetrologiaProofWorkOrder@1` draft carrying the blueprint seat, axiom
   budget, corpus, references, and `frontierOf` (the seeding order); the
   session writes it to `content/work-orders/<id>.json` and fills what only
   the proof settles (title, module, headline, declarations, requirements,
   prohibitions, section, verse, new frontier nodes). The red node is a
   conjecture with a seat; admission refuses the draft until it is an order.
1. **Work order first.** Write `content/work-orders/<id>.json`
   (`ObsmetrologiaProofWorkOrder@1`; copy the shape of
   `hat-metatile-substitution-witness.json`): module, headline, declarations,
   axiom budget (`propext` is the house debt profile; `sorryAx` is refused),
   requirements, prohibitions, open questions, corpus carriers, the blueprint
   seat (chapter file, node file, label, statement, `uses`, frontier nodes),
   the verse module. Then
   `node scripts/admit-proof-work-order.mjs --order content/work-orders/<id>.json`
   — exit 0 prints the admitted specification and its digest; a refusal names
   the gap. A gap is repaired in the order, never by a smarter prover
   (Central Dogma of Fabrication).
2. **Seat the node red.**
   `node scripts/realize-blueprint-node.mjs --order <order>` writes the
   `\notready` node and its `\input` into the owning chapter. A headline
   label that another order seated as a frontier node is promoted: the
   seeding order's node file is re-rendered without it (its own headline
   status read back off its text), so one label lives in one file.
3. **Prove.** Write the module at the path the order names, on the pattern of
   the nearest sibling (`Witness/JeandelRao*.lean`, `StepN/SubstitutionMatrix.lean`,
   `Witness/HatMetatile.lean`). Use the `lean-lsp` MCP (`.mcp.json`) for
   diagnostics, goals, hover, `#print axioms` — not shell and grep. Import the
   module from its root aggregate (`Obsmetrologia/AperiodicOrder.lean` etc.).
4. **Verse.** Write `docs/verso/ObsmetrologiaManual/<Book>/<Name>.lean` with
   `{docstring …}` citations of the order's declarations and register it in
   `docs/verso/ObsmetrologiaManual.lean` (import + `{include 1 …}`).
5. **Audit.** `node scripts/audit-proof-realization.mjs --order <order>` runs
   the four gates by exit status — `lake build <module>`, the axiom census of
   the named declarations against the budget, the Lean/Blueprint chart, the
   manual build — and writes `data/records/<date>-proof-realization-<id>.json`
   with the admitted realization receipt. A failed gate leaves no record.
6. **Settle.** `node scripts/realize-blueprint-node.mjs --order <order> --receipt data/records/<that record>`
   flips the headline node to `\leanok` (frontier nodes stay red), then run
   the audit once more so the record binds the settled bytes.

Whole-library gates stay `lake build` in `lib/obsmetrologia` and the
section's censuses (`scripts/census-set-of-*.mjs`). Commits route to the
version-control provider.
