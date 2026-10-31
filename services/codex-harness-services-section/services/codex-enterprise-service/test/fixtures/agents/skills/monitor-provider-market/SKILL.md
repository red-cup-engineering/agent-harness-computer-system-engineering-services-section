---
name: monitor-provider-market
description: "MAPE-K monitor skill of the Bare Cedar Fog Codex Actuation Office's 'maintaining-codex-situational-knowledge' duty. Consumes RequirementK and produces ProviderMarketK. Never mutates the filesystem. Use it as the 'monitor-provider-market' step of that duty's MAPE-K cycle, in dependency order after monitor-leader-move."
---

# monitor provider market

This file is output, projected from the Bare Cedar Fog Codex Actuation Office's
own skill registry (`agents/office/codex-mape-skills.json`, entry `monitor-provider-market`) and
knowledge registry (`agents/office/codex-mape-knowledge.json`) -- the office
record is the source; edits here are discarded on the next reconciliation.

## What this skill is

monitor-provider-market is a MONITOR-stage skill: it observes the substrate and produces a knowledge class, and it never mutates the filesystem. It discharges
the **maintaining-codex-situational-knowledge** duty, order 30 in that duty's MAPE-K sequence.
Market actor identity: `urn:ame:codex-skill-monitor-provider-market`.

Provider: purchase from `urn:ame:inference-work-lot-service` over `MCP+A2A`; selection: observe-only. This skill's own output is non-authoritative until a receiver assays it -- a provider's completion is not this office's acceptance.



## Consumes

- `RequirementK` -- Typed desired outcome and independently observable completion conditions.

## Produces

- `ProviderMarketK` -- Provider-authored offers, availability, and explicit refusals.

## Depends on

`monitor-leader-move`

## Invariants this skill answers to

Every invocation retains a content-addressed knowledge edge or provider
receipt (`all-knowledge-and-exchange-edges-retain-content-or-provider-receipts`).
Notebook and inference output produced here is non-authoritative until a
receiver assays it (`notebook-and-inference-output-is-non-authoritative`).
