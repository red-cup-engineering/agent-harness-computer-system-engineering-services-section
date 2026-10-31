---
name: plan-low-level-design
description: "MAPE-K plan skill of the Bare Cedar Fog Codex Actuation Office's 'decomposing-union-change' duty. Consumes HighLevelDesignK, RepositoryEvidenceK, ProviderMarketK and produces LowLevelDesignK, ProviderReceiptK. Never mutates the filesystem. Use it as the 'plan-low-level-design' step of that duty's MAPE-K cycle, in dependency order after plan-high-level-design, monitor-provider-market."
---

# plan low level design

This file is output, projected from the Bare Cedar Fog Codex Actuation Office's
own skill registry (`agents/office/codex-mape-skills.json`, entry `plan-low-level-design`) and
knowledge registry (`agents/office/codex-mape-knowledge.json`) -- the office
record is the source; edits here are discarded on the next reconciliation.

## What this skill is

plan-low-level-design is a PLAN-stage skill: it produces a candidate design or decomposition, and it never mutates the filesystem. It discharges
the **decomposing-union-change** duty, order 100 in that duty's MAPE-K sequence.
Market actor identity: `urn:ame:codex-skill-plan-low-level-design`.

Provider: purchase from `urn:ame:inference-work-lot-service` over `inference-work-lot-market`; selection: lowest-observed-fractional-cost-among-compatible-offers; reasoning class: bounded. This skill's own output is non-authoritative until a receiver assays it -- a provider's completion is not this office's acceptance.



## Consumes

- `HighLevelDesignK` -- Candidate HLD linked to an assayed SAS.
- `RepositoryEvidenceK` -- Digest-bound repository evidence and deterministic lookup receipts.
- `ProviderMarketK` -- Provider-authored offers, availability, and explicit refusals.

## Produces

- `LowLevelDesignK` -- Candidate LLD linked to an assayed HLD and current repository evidence.
- `ProviderReceiptK` -- Provider-authored offer, refusal, delivery, and resource receipt.

## Depends on

`plan-high-level-design`, `monitor-provider-market`

## Invariants this skill answers to

Every invocation retains a content-addressed knowledge edge or provider
receipt (`all-knowledge-and-exchange-edges-retain-content-or-provider-receipts`).
Notebook and inference output produced here is non-authoritative until a
receiver assays it (`notebook-and-inference-output-is-non-authoritative`).
