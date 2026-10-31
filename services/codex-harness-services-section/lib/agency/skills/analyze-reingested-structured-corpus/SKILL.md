---
name: analyze-reingested-structured-corpus
description: "MAPE-K analyze skill of the Bare Cedar Fog Codex Actuation Office's 'diagnosing-the-union-system' duty. Consumes StructuredDataK, RepositoryEvidenceK and produces DataTableK, ProviderReceiptK. Never mutates the filesystem. Use it as the 'analyze-reingested-structured-corpus' step of that duty's MAPE-K cycle, in dependency order after analyze-schema-bound-corpus."
---

# analyze reingested structured corpus

This file is output, projected from the Bare Cedar Fog Codex Actuation Office's
own skill registry (`content/office/codex-mape-skills.json`, entry `analyze-reingested-structured-corpus`) and
knowledge registry (`content/office/codex-mape-knowledge.json`) -- the office
record is the source; edits here are discarded on the next reconciliation.

## What this skill is

analyze-reingested-structured-corpus is an ANALYZE-stage skill: it reduces observed knowledge to a diagnosis, and it never mutates the filesystem. It discharges
the **diagnosing-the-union-system** duty, order 60 in that duty's MAPE-K sequence.
Market actor identity: `urn:ame:codex-skill-analyze-reingested-structured-corpus`.

Provider: purchase from `urn:ame:notebooklm-inference-team` over `notebooklm-workspace-market-mcp`; selection: fresh-customer-owned-lease-plus-native-data-table-studio-lot; authority: none; cleanup: exact-workspace-and-studio-cleanup-receipts-required-after-local-artifact-is-seated. This skill's own output is non-authoritative until a receiver assays it -- a provider's completion is not this office's acceptance.



## Consumes

- `StructuredDataK` -- Schema-bound JSON product validated at the NotebookLM membrane and still pending receiver assay.
- `RepositoryEvidenceK` -- Digest-bound repository evidence and deterministic lookup receipts.

## Produces

- `DataTableK` -- Content-addressed native NotebookLM CSV with structural validation, formula-risk observation, and ephemeral cleanup receipt.
- `ProviderReceiptK` -- Provider-authored offer, refusal, delivery, and resource receipt.

## Depends on

`analyze-schema-bound-corpus`

## Invariants this skill answers to

Every invocation retains a content-addressed knowledge edge or provider
receipt (`all-knowledge-and-exchange-edges-retain-content-or-provider-receipts`).
Notebook and inference output produced here is non-authoritative until a
receiver assays it (`notebook-and-inference-output-is-non-authoritative`).

