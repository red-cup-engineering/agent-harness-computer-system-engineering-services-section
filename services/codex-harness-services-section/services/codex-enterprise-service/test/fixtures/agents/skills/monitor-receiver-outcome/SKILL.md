---
name: monitor-receiver-outcome
description: "MAPE-K monitor skill of the Bare Cedar Fog Codex Actuation Office's 'observing-response-and-learning' duty. Consumes LeaderMoveK and CandidatePatchK and produces CustomerOutcomeK. Never mutates the filesystem."
---

# monitor receiver outcome

This file is output, projected from the Bare Cedar Fog Codex Actuation Office's
own skill registry (`agents/office/codex-mape-skills.json`, entry `monitor-receiver-outcome`) and
knowledge registry (`agents/office/codex-mape-knowledge.json`) -- the office
record is the source; edits here are discarded on the next reconciliation.

## What this skill is

monitor-receiver-outcome is a MONITOR-stage skill: it observes the substrate and produces a knowledge class, and it never mutates the filesystem. It discharges
the **observing-response-and-learning** duty, order 150 in that duty's MAPE-K sequence.
Market actor identity: `urn:ame:codex-skill-monitor-receiver-outcome`.

Provider: external observation by `urn:leader:emsenn` over `LeaderMovement`, selected as named-acceptance-authority -- this office cannot produce this knowledge itself; it can only wait on and record it.

This skill is receiver-gated: it records a typed outcome from the named customer endpoint. The candidate's author is not an input to admission.

## Consumes

- `LeaderMoveK` -- Content-addressed translation of the current Leader move with source language preserved.
- `CandidatePatchK` -- Candidate filesystem mutation whose named completion conditions are observed separately.

## Produces

- `CustomerOutcomeK` -- Receiver-issued acceptance, rejection, correction, or continued objection; may close demand but never authorize Execute retroactively.

## Depends on

`execute-repository-mutation`

## Invariants this skill answers to

Every invocation retains a content-addressed knowledge edge or provider
receipt (`all-knowledge-and-exchange-edges-retain-content-or-provider-receipts`).
Notebook and inference output produced here is non-authoritative until a
receiver assays it (`notebook-and-inference-output-is-non-authoritative`).
