---
name: monitor-supplier-exchange
description: "MAPE-K monitor skill of the Bare Cedar Fog Codex Actuation Office's 'accounting-for-capability-trade' duty. Consumes ProviderReceiptK and produces SupplierExchangeK. Never mutates the filesystem. Use it as the 'monitor-supplier-exchange' step of that duty's MAPE-K cycle, in dependency order after monitor-independent-verification."
---

# monitor supplier exchange

This file is output, projected from the Bare Cedar Fog Codex Actuation Office's
own skill registry (`content/office/codex-mape-skills.json`, entry `monitor-supplier-exchange`) and
knowledge registry (`content/office/codex-mape-knowledge.json`) -- the office
record is the source; edits here are discarded on the next reconciliation.

## What this skill is

monitor-supplier-exchange is a MONITOR-stage skill: it observes the substrate and produces a knowledge class, and it never mutates the filesystem. It discharges
the **accounting-for-capability-trade** duty, order 160 in that duty's MAPE-K sequence.
Market actor identity: `urn:ame:codex-skill-monitor-supplier-exchange`.

Provider: direct incubation by `urn:ame:bare-cedar-fog-codex` over `CodexEnterpriseTrajectory` -- the Codex actor performs this itself rather than purchasing it, and it is registered as reusable-supplier demand (a future purchase candidate once an independent supplier offers it).



## Consumes

- `ProviderReceiptK` -- Provider-authored offer, refusal, delivery, and resource receipt.

## Produces

- `SupplierExchangeK` -- Codex-owned observation of one provider exchange, pending customer outcome.

## Depends on

`monitor-independent-verification`

## Invariants this skill answers to

Every invocation retains a content-addressed knowledge edge or provider
receipt (`all-knowledge-and-exchange-edges-retain-content-or-provider-receipts`).
Notebook and inference output produced here is non-authoritative until a
receiver assays it (`notebook-and-inference-output-is-non-authoritative`).

