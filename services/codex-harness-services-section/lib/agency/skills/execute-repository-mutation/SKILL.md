---
name: execute-repository-mutation
description: "MAPE-K execute skill of the Bare Cedar Fog Codex Actuation Office's 'actuating-union-change' duty. Consumes ActuationPlanK, LeaderAuthorityK and produces CandidatePatchK. Mutates the customer filesystem; requires LeaderAuthorityK and an integrated ActuationPlanK. Use it as the 'execute-repository-mutation' step of that duty's MAPE-K cycle, in dependency order after plan-integrate-actuation."
---

# execute repository mutation

This file is output, projected from the Bare Cedar Fog Codex Actuation Office's
own skill registry (`content/office/codex-mape-skills.json`, entry `execute-repository-mutation`) and
knowledge registry (`content/office/codex-mape-knowledge.json`) -- the office
record is the source; edits here are discarded on the next reconciliation.

## What this skill is

execute-repository-mutation is an EXECUTE-stage skill: it is the one place in the MAPE-K loop permitted to mutate the customer filesystem, and only when its consumed knowledge includes LeaderAuthorityK. It discharges
the **actuating-union-change** duty, order 130 in that duty's MAPE-K sequence.
Market actor identity: `urn:ame:codex-skill-execute-repository-mutation`.

Provider: direct incubation by `urn:ame:bare-cedar-fog-codex` over `CodexVSCode` -- the Codex actor performs this itself rather than purchasing it, and it is registered as reusable-supplier demand (a future purchase candidate once an independent supplier offers it).



## Consumes

- `ActuationPlanK` -- Codex-integrated mutation plan; still inert without LeaderAuthorityK.
- `LeaderAuthorityK` -- Exact Leader-issued authority scope consumed only by Execute.

## Produces

- `CandidatePatchK` -- Codex-authored candidate filesystem mutation pending author-excluded verification.

## Depends on

`plan-integrate-actuation`

## Invariants this skill answers to

Every invocation retains a content-addressed knowledge edge or provider
receipt (`all-knowledge-and-exchange-edges-retain-content-or-provider-receipts`).
Notebook and inference output produced here is non-authoritative until a
receiver assays it (`notebook-and-inference-output-is-non-authoritative`).
Only Codex may mutate the customer filesystem, and only with a consumed Leader authority receipt and an integrated plan (`only-codex-may-mutate-the-customer-filesystem`, `execute-requires-a-leader-authority-receipt-and-an-integrated-plan`).
