---
name: analyze-pinned-union-corpus
description: "MAPE-K analyze skill of the Bare Cedar Fog Codex Actuation Office's 'diagnosing-the-union-system' duty. Consumes LeaderMoveK, RepositoryEvidenceK and produces AdvisorySynthesisK, ProviderReceiptK. Never mutates the filesystem. Use it as the 'analyze-pinned-union-corpus' step of that duty's MAPE-K cycle, in dependency order after monitor-repository-evidence."
---

# analyze pinned union corpus

This file is output, projected from the Bare Cedar Fog Codex Actuation Office's
own skill registry (`agents/office/codex-mape-skills.json`, entry `analyze-pinned-union-corpus`) and
knowledge registry (`agents/office/codex-mape-knowledge.json`) -- the office
record is the source; edits here are discarded on the next reconciliation.

## What this skill is

analyze-pinned-union-corpus is an ANALYZE-stage skill: it reduces observed knowledge to a diagnosis, and it never mutates the filesystem. It discharges
the **diagnosing-the-union-system** duty, order 40 in that duty's MAPE-K sequence.
Market actor identity: `urn:ame:codex-skill-analyze-pinned-union-corpus`.

Provider: purchase from `urn:ame:notebooklm-inference-team` over `digest-pinned-provider-cli`; selection: exact-source-id; authority: none. This skill's own output is non-authoritative until a receiver assays it -- a provider's completion is not this office's acceptance.



## Consumes

- `LeaderMoveK` -- Content-addressed translation of the current Leader move with source language preserved.
- `RepositoryEvidenceK` -- Digest-bound repository evidence and deterministic lookup receipts.

## Produces

- `AdvisorySynthesisK` -- Source-grounded NotebookLM synthesis carrying no execution or governance authority.
- `ProviderReceiptK` -- Provider-authored offer, refusal, delivery, and resource receipt.

## Depends on

`monitor-repository-evidence`

## Invariants this skill answers to

Every invocation retains a content-addressed knowledge edge or provider
receipt (`all-knowledge-and-exchange-edges-retain-content-or-provider-receipts`).
Notebook and inference output produced here is non-authoritative until a
receiver assays it (`notebook-and-inference-output-is-non-authoritative`).
