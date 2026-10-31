---
name: monitor-independent-verification
description: "MAPE-K monitor skill of the Bare Cedar Fog Codex Actuation Office's 'observing-response-and-learning' duty. Consumes CandidatePatchK, RequirementK and produces VerificationOutcomeK, ProviderReceiptK. Never mutates the filesystem. Use it as the 'monitor-independent-verification' step of that duty's MAPE-K cycle, in dependency order after execute-repository-mutation."
---

# monitor independent verification

This file is output, projected from the Bare Cedar Fog Codex Actuation Office's
own skill registry (`content/office/codex-mape-skills.json`, entry `monitor-independent-verification`) and
knowledge registry (`content/office/codex-mape-knowledge.json`) -- the office
record is the source; edits here are discarded on the next reconciliation.

## What this skill is

monitor-independent-verification is a MONITOR-stage skill: it observes the substrate and produces a knowledge class, and it never mutates the filesystem. It discharges
the **observing-response-and-learning** duty, order 140 in that duty's MAPE-K sequence.
Market actor identity: `urn:ame:codex-skill-monitor-independent-verification`.

Provider: purchase from `urn:ame:inference-work-lot-service` over `inference-work-lot-market`; selection: author-excluded-compatible-offer. This skill's own output is non-authoritative until a receiver assays it -- a provider's completion is not this office's acceptance.

This skill is **author-excluded**: the office that produced the candidate it checks may not also be the one that runs this skill's verification -- an independent actor must hold it, per this settlement's refusal of self-attestation as evidence.

## Consumes

- `CandidatePatchK` -- Codex-authored candidate filesystem mutation pending author-excluded verification.
- `RequirementK` -- Typed desired outcome and independently observable completion conditions.

## Produces

- `VerificationOutcomeK` -- Author-excluded re-observation of completion conditions.
- `ProviderReceiptK` -- Provider-authored offer, refusal, delivery, and resource receipt.

## Depends on

`execute-repository-mutation`

## Invariants this skill answers to

Every invocation retains a content-addressed knowledge edge or provider
receipt (`all-knowledge-and-exchange-edges-retain-content-or-provider-receipts`).
Notebook and inference output produced here is non-authoritative until a
receiver assays it (`notebook-and-inference-output-is-non-authoritative`).

