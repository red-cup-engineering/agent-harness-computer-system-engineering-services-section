---
title: "Agent names for offices that share an id: requirements, specification and design"
description: "Two enterprises each hold an office called chief-executive-officer. The Claude harness projection names an agent by office id, so neither projects. This specifies a name for each that dispatches the right office."
date-created: 2026-10-09
type: specification
status: proposed; not implemented; returned as one cloud slice; needs independent receiving (the Senior Engineer does not receive its own outcome)
owner: agent-harness-computer-system-engineering-services-section
provenance:
  authors:
    - bare-cedar-fog-claude (Hai Jian), office senior-engineer, incumbency bare-cedar-fog-claude-as-senior-engineer
  duty: engineering-services-section/lib/agency/duties/realizing-allocated-engineering-work.json
  precedes: red-cup-engineering/computer-services-section pull request 141
---

# Agent names for offices that share an id

## Theory

1. An office is identified by its section and id (`emsenn/services/561-group/services/561-group-services-section#chief-executive-officer`); the id alone is not unique across the Group.
2. A session dispatches only an agent projected from an office record (rule `sessions-dispatch-only-office-projected-agents`), and the projection names the agent by office id (`claude-harness-projection.mjs`, `projectOfficeAgent` returning `office.id`).
3. The 561 Group's chief executive officer and Blockchain Trashpanda's are different offices in different enterprises. Hai Xudi holds the first (the Leader, 2026-10-09).
4. Blockchain Trashpanda's records are named by path in its founding verifier and receipt admitter, so the office id is not an editable field.

## Requirements (EARS)

1. When two offices of one id are seated at dignitas in different sections, the Claude harness projection shall project each under a name that is unique among the node's agents.
2. The projection shall name the office of the node's own enterprise root by its bare id.
3. The projection shall name every other office of a shared id by its section's last path segment, a hyphen and the id.
4. If two projected names are still equal, the projection shall refuse both and report each with the sections that seat them.
5. The projected agent's front matter `name` shall equal its file name and its manifest entry.
6. The held-offices note in `.claude/CLAUDE.md` shall name the agent by the same name.

## Design

`projectOfficeAgent` takes an optional `agentId` that replaces `office.id` in `name:`, the returned `id` and the manifest entry; the office text, `emsenn/office/<id>` and the skill list stay the office's. `projectClaudeHarness` computes names once, from the seated readings, before any agent is rendered. The enterprise root is the section whose path equals the agency root's top section (`561-group-services-section`).

## Receiving conditions

1. A node with `chief-executive-officer` in `561-group-services-section` and in `blockchain-trashpanda-services-section` projects `chief-executive-officer.md` for the first and `blockchain-trashpanda-services-section-chief-executive-officer.md` for the second.
2. Both files' `name:` equal their file names.
3. The Bare Cedar Fog reading reports no `chief-executive-officer` obstruction.
4. The test seats `chief` in two sections and expects two distinctly named agents.
