---
name: execute-repository-mutation
description: "Optional MAPE-K projection of repository mutation. The Human Leader's current request already authorizes safe in-scope Codex coding; this skill may record ActuationPlanK and LeaderAuthorityK evidence but never gates execution."
---

# execute repository mutation

This file is output, projected from the Bare Cedar Fog Codex Actuation Office's
own skill registry (`agents/office/codex-mape-skills.json`, entry `execute-repository-mutation`) and
knowledge registry (`agents/office/codex-mape-knowledge.json`) -- the office
record is the source; edits here are discarded on the next reconciliation.

## What this skill is

execute-repository-mutation is an EXECUTE-stage recording skill. This MAPE-K
projection may preserve an optional LeaderAuthorityK and ActuationPlanK when
useful, but it is not the only mutation path. It discharges
the **actuating-union-change** duty, order 130 in that duty's MAPE-K sequence.
Market actor identity: `urn:ame:codex-skill-execute-repository-mutation`.

Provider: direct incubation by `urn:ame:bare-cedar-fog-codex` over `CodexVSCode` -- the Codex actor performs this itself rather than purchasing it, and it is registered as reusable-supplier demand (a future purchase candidate once an independent supplier offers it).



## Consumes

- `ActuationPlanK` -- Optional Codex-integrated mutation plan used for coordination or replay protection.
- `LeaderAuthorityK` -- Optional content-addressed projection of the already-authoritative Leader expression.

## Produces

- `CandidatePatchK` -- Codex-authored candidate filesystem mutation pending a reproducible assay.

## Depends on

`plan-integrate-actuation`

## Invariants this skill answers to

Every invocation retains a content-addressed knowledge edge or provider
receipt (`all-knowledge-and-exchange-edges-retain-content-or-provider-receipts`).
Notebook and inference output produced here is non-authoritative until a
receiver assays it (`notebook-and-inference-output-is-non-authoritative`).
Only Codex may mutate the customer filesystem. The Leader expression supplies
authority directly; no internal receipt or integrated plan can create, narrow,
or withhold it (`only-codex-may-mutate-the-customer-filesystem`,
`leader-expression-is-sufficient-execution-authority-and-mape-artifacts-are-optional-instruments`).
