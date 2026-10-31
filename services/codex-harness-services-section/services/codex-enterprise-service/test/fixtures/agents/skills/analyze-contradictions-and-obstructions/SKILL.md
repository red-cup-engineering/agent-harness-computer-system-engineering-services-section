---
name: analyze-contradictions-and-obstructions
description: "MAPE-K analyze skill of the Bare Cedar Fog Codex Actuation Office's 'diagnosing-the-union-system' duty. Consumes AdvisorySynthesisK, StructuredDataK, DataTableK, RepositoryEvidenceK, ProviderMarketK and produces ContradictionSetK, ProviderReceiptK. Never mutates the filesystem. Use it as the 'analyze-contradictions-and-obstructions' step of that duty's MAPE-K cycle, in dependency order after analyze-reingested-structured-corpus, monitor-provider-market."
---

# analyze contradictions and obstructions

This file is output, projected from the Bare Cedar Fog Codex Actuation Office's
own skill registry (`agents/office/codex-mape-skills.json`, entry `analyze-contradictions-and-obstructions`) and
knowledge registry (`agents/office/codex-mape-knowledge.json`) -- the office
record is the source; edits here are discarded on the next reconciliation.

## What this skill is

analyze-contradictions-and-obstructions is an ANALYZE-stage skill: it reduces observed knowledge to a diagnosis, and it never mutates the filesystem. It discharges
the **diagnosing-the-union-system** duty, order 70 in that duty's MAPE-K sequence.
Market actor identity: `urn:ame:codex-skill-analyze-contradictions-and-obstructions`.

Provider: purchase from `urn:ame:notebooklm-inference-team` over `digest-pinned-provider-cli`; selection: exact-source-id; authority: none. This skill's own output is non-authoritative until a receiver assays it -- a provider's completion is not this office's acceptance.



## Consumes

- `AdvisorySynthesisK` -- Source-grounded NotebookLM synthesis carrying no execution or governance authority.
- `StructuredDataK` -- Schema-bound JSON product validated at the NotebookLM membrane and still pending receiver assay.
- `DataTableK` -- Content-addressed native NotebookLM CSV with structural validation, formula-risk observation, and ephemeral cleanup receipt.
- `RepositoryEvidenceK` -- Digest-bound repository evidence and deterministic lookup receipts.
- `ProviderMarketK` -- Provider-authored offers, availability, and explicit refusals.

## Produces

- `ContradictionSetK` -- Constitutional, topological, kinetic, and local hypotheses with falsifiers.
- `ProviderReceiptK` -- Provider-authored offer, refusal, delivery, and resource receipt.

## Depends on

`analyze-reingested-structured-corpus`, `monitor-provider-market`

## Invariants this skill answers to

Every invocation retains a content-addressed knowledge edge or provider
receipt (`all-knowledge-and-exchange-edges-retain-content-or-provider-receipts`).
Notebook and inference output produced here is non-authoritative until a
receiver assays it (`notebook-and-inference-output-is-non-authoritative`).
