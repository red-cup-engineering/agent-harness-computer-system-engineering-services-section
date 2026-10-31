---
name: analyze-schema-bound-corpus
description: "MAPE-K analyze skill of the Bare Cedar Fog Codex Actuation Office's 'diagnosing-the-union-system' duty. Consumes AdvisorySynthesisK, RepositoryEvidenceK and produces StructuredDataK, ProviderReceiptK. Never mutates the filesystem. Use it as the 'analyze-schema-bound-corpus' step of that duty's MAPE-K cycle, in dependency order after analyze-pinned-union-corpus."
---

# analyze schema bound corpus

This file is output, projected from the Bare Cedar Fog Codex Actuation Office's
own skill registry (`agents/office/codex-mape-skills.json`, entry `analyze-schema-bound-corpus`) and
knowledge registry (`agents/office/codex-mape-knowledge.json`) -- the office
record is the source; edits here are discarded on the next reconciliation.

## What this skill is

analyze-schema-bound-corpus is an ANALYZE-stage skill: it reduces observed knowledge to a diagnosis, and it never mutates the filesystem. It discharges
the **diagnosing-the-union-system** duty, order 50 in that duty's MAPE-K sequence.
Market actor identity: `urn:ame:codex-skill-analyze-schema-bound-corpus`.

Provider: purchase from `urn:ame:notebooklm-inference-team` over `notebooklm-workspace-market-mcp`; selection: customer-owned-lease-plus-schema-bound-json-studio-lot; authority: none; cleanup: exact-workspace-and-studio-cleanup-receipts-required-after-local-artifact-is-seated. This skill's own output is non-authoritative until a receiver assays it -- a provider's completion is not this office's acceptance.



## Consumes

- `AdvisorySynthesisK` -- Source-grounded NotebookLM synthesis carrying no execution or governance authority.
- `RepositoryEvidenceK` -- Digest-bound repository evidence and deterministic lookup receipts.

## Produces

- `StructuredDataK` -- Schema-bound JSON product validated at the NotebookLM membrane and still pending receiver assay.
- `ProviderReceiptK` -- Provider-authored offer, refusal, delivery, and resource receipt.

## Depends on

`analyze-pinned-union-corpus`

## Invariants this skill answers to

Every invocation retains a content-addressed knowledge edge or provider
receipt (`all-knowledge-and-exchange-edges-retain-content-or-provider-receipts`).
Notebook and inference output produced here is non-authoritative until a
receiver assays it (`notebook-and-inference-output-is-non-authoritative`).
