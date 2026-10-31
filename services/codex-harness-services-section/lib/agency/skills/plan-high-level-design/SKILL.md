---
name: plan-high-level-design
description: "MAPE-K plan skill of the Bare Cedar Fog Codex Actuation Office's 'designing-union-change' duty. Consumes RequirementK, SoftwareArchitectureSpecificationK, ContradictionSetK and produces HighLevelDesignK, ProviderReceiptK. Never mutates the filesystem. Use it as the 'plan-high-level-design' step of that duty's MAPE-K cycle, in dependency order after plan-software-architecture-specification."
---

# plan high level design

This file is output, projected from the Bare Cedar Fog Codex Actuation Office's
own skill registry (`content/office/codex-mape-skills.json`, entry `plan-high-level-design`) and
knowledge registry (`content/office/codex-mape-knowledge.json`) -- the office
record is the source; edits here are discarded on the next reconciliation.

## What this skill is

plan-high-level-design is a PLAN-stage skill: it produces a candidate design or decomposition, and it never mutates the filesystem. It discharges
the **designing-union-change** duty, order 90 in that duty's MAPE-K sequence.
Market actor identity: `urn:ame:codex-skill-plan-high-level-design`.

Provider: purchase from `urn:ame:claude-code-inference-team` over `inference-work-lot-market`; selection: required-provider-capability; reasoning class: high. This skill's own output is non-authoritative until a receiver assays it -- a provider's completion is not this office's acceptance.



## Consumes

- `RequirementK` -- Typed desired outcome and independently observable completion conditions.
- `SoftwareArchitectureSpecificationK` -- Candidate SAS linked to requirements and evidence.
- `ContradictionSetK` -- Constitutional, topological, kinetic, and local hypotheses with falsifiers.

## Produces

- `HighLevelDesignK` -- Candidate HLD linked to an assayed SAS.
- `ProviderReceiptK` -- Provider-authored offer, refusal, delivery, and resource receipt.

## Depends on

`plan-software-architecture-specification`

## Invariants this skill answers to

Every invocation retains a content-addressed knowledge edge or provider
receipt (`all-knowledge-and-exchange-edges-retain-content-or-provider-receipts`).
Notebook and inference output produced here is non-authoritative until a
receiver assays it (`notebook-and-inference-output-is-non-authoritative`).

