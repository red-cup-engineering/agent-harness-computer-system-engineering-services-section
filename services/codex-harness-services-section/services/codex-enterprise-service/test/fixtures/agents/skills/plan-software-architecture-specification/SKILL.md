---
name: plan-software-architecture-specification
description: "MAPE-K plan skill of the Bare Cedar Fog Codex Actuation Office's 'designing-union-change' duty. Consumes RequirementK, RepositoryEvidenceK, AdvisorySynthesisK, ContradictionSetK and produces SoftwareArchitectureSpecificationK, ProviderReceiptK. Never mutates the filesystem. Use it as the 'plan-software-architecture-specification' step of that duty's MAPE-K cycle, in dependency order after analyze-contradictions-and-obstructions."
---

# plan software architecture specification

This file is output, projected from the Bare Cedar Fog Codex Actuation Office's
own skill registry (`agents/office/codex-mape-skills.json`, entry `plan-software-architecture-specification`) and
knowledge registry (`agents/office/codex-mape-knowledge.json`) -- the office
record is the source; edits here are discarded on the next reconciliation.

## What this skill is

plan-software-architecture-specification is a PLAN-stage skill: it produces a candidate design or decomposition, and it never mutates the filesystem. It discharges
the **designing-union-change** duty, order 80 in that duty's MAPE-K sequence.
Market actor identity: `urn:ame:codex-skill-plan-software-architecture-specification`.

Provider: purchase from `urn:ame:claude-code-inference-team` over `inference-work-lot-market`; selection: required-provider-capability; reasoning class: high. This skill's own output is non-authoritative until a receiver assays it -- a provider's completion is not this office's acceptance.



## Consumes

- `RequirementK` -- Typed desired outcome and independently observable completion conditions.
- `RepositoryEvidenceK` -- Digest-bound repository evidence and deterministic lookup receipts.
- `AdvisorySynthesisK` -- Source-grounded NotebookLM synthesis carrying no execution or governance authority.
- `ContradictionSetK` -- Constitutional, topological, kinetic, and local hypotheses with falsifiers.

## Produces

- `SoftwareArchitectureSpecificationK` -- Candidate SAS linked to requirements and evidence.
- `ProviderReceiptK` -- Provider-authored offer, refusal, delivery, and resource receipt.

## Depends on

`analyze-contradictions-and-obstructions`

## Invariants this skill answers to

Every invocation retains a content-addressed knowledge edge or provider
receipt (`all-knowledge-and-exchange-edges-retain-content-or-provider-receipts`).
Notebook and inference output produced here is non-authoritative until a
receiver assays it (`notebook-and-inference-output-is-non-authoritative`).
