---
name: monitor-repository-evidence
description: "MAPE-K monitor skill of the Bare Cedar Fog Codex Actuation Office's 'maintaining-codex-situational-knowledge' duty. Consumes LeaderMoveK and produces RepositoryEvidenceK. Never mutates the filesystem. Use it as the 'monitor-repository-evidence' step of that duty's MAPE-K cycle, in dependency order after monitor-leader-move."
---

# monitor repository evidence

This file is output, projected from the Bare Cedar Fog Codex Actuation Office's
own skill registry (`content/office/codex-mape-skills.json`, entry `monitor-repository-evidence`) and
knowledge registry (`content/office/codex-mape-knowledge.json`) -- the office
record is the source; edits here are discarded on the next reconciliation.

## What this skill is

monitor-repository-evidence is a MONITOR-stage skill: it observes the substrate and produces a knowledge class, and it never mutates the filesystem. It discharges
the **maintaining-codex-situational-knowledge** duty, order 20 in that duty's MAPE-K sequence.
Market actor identity: `urn:ame:codex-skill-monitor-repository-evidence`.

Provider: purchase from `urn:ame:union-corpus-query-cell` over `local-content-addressed-query`; selection: exact-capability. This skill's own output is non-authoritative until a receiver assays it -- a provider's completion is not this office's acceptance.



## Consumes

- `LeaderMoveK` -- Content-addressed translation of the current Leader move with source language preserved.

## Produces

- `RepositoryEvidenceK` -- Digest-bound repository evidence and deterministic lookup receipts.

## Depends on

`monitor-leader-move`

## Invariants this skill answers to

Every invocation retains a content-addressed knowledge edge or provider
receipt (`all-knowledge-and-exchange-edges-retain-content-or-provider-receipts`).
Notebook and inference output produced here is non-authoritative until a
receiver assays it (`notebook-and-inference-output-is-non-authoritative`).

