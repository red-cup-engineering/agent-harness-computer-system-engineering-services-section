---
name: monitor-acceptance-pressure
description: "MAPE-K monitor skill of the Bare Cedar Fog Codex Actuation Office's 'accounting-for-capability-trade' duty. Consumes SupplierExchangeK, CustomerOutcomeK and produces EconomicPressureK. Never mutates the filesystem. Use it as the 'monitor-acceptance-pressure' step of that duty's MAPE-K cycle, in dependency order after monitor-supplier-exchange, monitor-receiver-outcome."
---

# monitor acceptance pressure

This file is output, projected from the Bare Cedar Fog Codex Actuation Office's
own skill registry (`agents/office/codex-mape-skills.json`, entry `monitor-acceptance-pressure`) and
knowledge registry (`agents/office/codex-mape-knowledge.json`) -- the office
record is the source; edits here are discarded on the next reconciliation.

## What this skill is

monitor-acceptance-pressure is a MONITOR-stage skill: it observes the substrate and produces a knowledge class, and it never mutates the filesystem. It discharges
the **accounting-for-capability-trade** duty, order 170 in that duty's MAPE-K sequence.
Market actor identity: `urn:ame:codex-skill-monitor-acceptance-pressure`.

Provider: direct incubation by `urn:ame:bare-cedar-fog-codex` over `CodexEnterpriseTrajectory` -- the Codex actor performs this itself rather than purchasing it, and it is registered as reusable-supplier demand (a future purchase candidate once an independent supplier offers it).



## Consumes

- `SupplierExchangeK` -- Codex-owned observation of one provider exchange, pending customer outcome.
- `CustomerOutcomeK` -- Receiver-issued acceptance, rejection, correction, or continued objection; may close demand but never authorize Execute retroactively.

## Produces

- `EconomicPressureK` -- Observed accepted yield and attributable fractional cost without invented conversion.

## Depends on

`monitor-supplier-exchange`, `monitor-receiver-outcome`

## Invariants this skill answers to

Every invocation retains a content-addressed knowledge edge or provider
receipt (`all-knowledge-and-exchange-edges-retain-content-or-provider-receipts`).
Notebook and inference output produced here is non-authoritative until a
receiver assays it (`notebook-and-inference-output-is-non-authoritative`).
