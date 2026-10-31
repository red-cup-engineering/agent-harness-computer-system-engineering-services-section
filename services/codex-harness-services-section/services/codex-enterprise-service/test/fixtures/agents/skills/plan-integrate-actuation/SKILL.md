---
name: plan-integrate-actuation
description: "MAPE-K plan skill of the Bare Cedar Fog Codex Actuation Office's 'actuating-union-change' duty. Consumes RequirementK, SoftwareArchitectureSpecificationK, HighLevelDesignK, LowLevelDesignK, WorkLotPlanK and produces ActuationPlanK. Never mutates the filesystem. Use it as the 'plan-integrate-actuation' step of that duty's MAPE-K cycle, in dependency order after plan-bounded-work-lots."
---

# plan integrate actuation

This file is output, projected from the Bare Cedar Fog Codex Actuation Office's
own skill registry (`agents/office/codex-mape-skills.json`, entry `plan-integrate-actuation`) and
knowledge registry (`agents/office/codex-mape-knowledge.json`) -- the office
record is the source; edits here are discarded on the next reconciliation.

## What this skill is

plan-integrate-actuation is a PLAN-stage skill: it produces a candidate design or decomposition, and it never mutates the filesystem. It discharges
the **actuating-union-change** duty, order 120 in that duty's MAPE-K sequence.
Market actor identity: `urn:ame:codex-skill-plan-integrate-actuation`.

Provider: direct incubation by `urn:ame:bare-cedar-fog-codex` over `CodexVSCode` -- the Codex actor performs this itself rather than purchasing it, and it is registered as reusable-supplier demand (a future purchase candidate once an independent supplier offers it).



## Consumes

- `RequirementK` -- Typed desired outcome and independently observable completion conditions.
- `SoftwareArchitectureSpecificationK` -- Candidate SAS linked to requirements and evidence.
- `HighLevelDesignK` -- Candidate HLD linked to an assayed SAS.
- `LowLevelDesignK` -- Candidate LLD linked to an assayed HLD and current repository evidence.
- `WorkLotPlanK` -- Bounded work-lot DAG with provider constraints, tests, and refusal conditions.

## Produces

- `ActuationPlanK` -- Codex-integrated mutation plan; still inert without LeaderAuthorityK.

## Depends on

`plan-bounded-work-lots`

## Invariants this skill answers to

Every invocation retains a content-addressed knowledge edge or provider
receipt (`all-knowledge-and-exchange-edges-retain-content-or-provider-receipts`).
Notebook and inference output produced here is non-authoritative until a
receiver assays it (`notebook-and-inference-output-is-non-authoritative`).
