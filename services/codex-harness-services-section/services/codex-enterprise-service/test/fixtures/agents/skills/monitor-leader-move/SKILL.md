---
name: monitor-leader-move
description: "MAPE-K monitor skill of the Bare Cedar Fog Codex Actuation Office's 'maintaining-codex-situational-knowledge' duty. Consumes LeaderExpressionK and produces LeaderMoveK, RequirementK. Never mutates the filesystem. Use it as the 'monitor-leader-move' step of that duty's MAPE-K cycle, in dependency order after nothing."
---

# monitor leader move

This file is output, projected from the Bare Cedar Fog Codex Actuation Office's
own skill registry (`agents/office/codex-mape-skills.json`, entry `monitor-leader-move`) and
knowledge registry (`agents/office/codex-mape-knowledge.json`) -- the office
record is the source; edits here are discarded on the next reconciliation.

## What this skill is

monitor-leader-move is a MONITOR-stage skill: it observes the substrate and produces a knowledge class, and it never mutates the filesystem. It discharges
the **maintaining-codex-situational-knowledge** duty, order 10 in that duty's MAPE-K sequence.
Market actor identity: `urn:ame:codex-skill-monitor-leader-move`.

Provider: direct incubation by `urn:ame:bare-cedar-fog-codex` over `CodexLifecycle` -- the Codex actor performs this itself rather than purchasing it, and it is registered as reusable-supplier demand (a future purchase candidate once an independent supplier offers it).



## Consumes

- `LeaderExpressionK` -- Immutable expression observed from the Leader; not yet interpreted as authority.

## Produces

- `LeaderMoveK` -- Content-addressed translation of the current Leader move with source language preserved.
- `RequirementK` -- Typed desired outcome and independently observable completion conditions.

## Depends on

(none -- this is an entry point)

## Invariants this skill answers to

Every invocation retains a content-addressed knowledge edge or provider
receipt (`all-knowledge-and-exchange-edges-retain-content-or-provider-receipts`).
Notebook and inference output produced here is non-authoritative until a
receiver assays it (`notebook-and-inference-output-is-non-authoritative`).
