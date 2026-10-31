---
name: plan-bounded-work-lots
description: "MAPE-K plan skill of the Bare Cedar Fog Codex Actuation Office's 'decomposing-union-change' duty. Consumes LowLevelDesignK, ProviderMarketK and produces WorkLotPlanK, ProviderReceiptK. Never mutates the filesystem. Use it as the 'plan-bounded-work-lots' step of that duty's MAPE-K cycle, in dependency order after plan-low-level-design."
---

# plan bounded work lots

This file is output, projected from the Bare Cedar Fog Codex Actuation Office's
own skill registry (`content/office/codex-mape-skills.json`, entry `plan-bounded-work-lots`) and
knowledge registry (`content/office/codex-mape-knowledge.json`) -- the office
record is the source; edits here are discarded on the next reconciliation.

## What this skill is

plan-bounded-work-lots is a PLAN-stage skill: it produces a candidate design or decomposition, and it never mutates the filesystem. It discharges
the **decomposing-union-change** duty, order 110 in that duty's MAPE-K sequence.
Market actor identity: `urn:ame:codex-skill-plan-bounded-work-lots`.

Provider: purchase from `urn:ame:inference-work-lot-service` over `inference-work-lot-market`; selection: lowest-observed-fractional-cost-among-compatible-offers; reasoning class: bounded. This skill's own output is non-authoritative until a receiver assays it -- a provider's completion is not this office's acceptance.



## Consumes

- `LowLevelDesignK` -- Candidate LLD linked to an assayed HLD and current repository evidence.
- `ProviderMarketK` -- Provider-authored offers, availability, and explicit refusals.

## Produces

- `WorkLotPlanK` -- Bounded work-lot DAG with provider constraints, tests, and refusal conditions.
- `ProviderReceiptK` -- Provider-authored offer, refusal, delivery, and resource receipt.

## Depends on

`plan-low-level-design`

## Invariants this skill answers to

Every invocation retains a content-addressed knowledge edge or provider
receipt (`all-knowledge-and-exchange-edges-retain-content-or-provider-receipts`).
Notebook and inference output produced here is non-authoritative until a
receiver assays it (`notebook-and-inference-output-is-non-authoritative`).

