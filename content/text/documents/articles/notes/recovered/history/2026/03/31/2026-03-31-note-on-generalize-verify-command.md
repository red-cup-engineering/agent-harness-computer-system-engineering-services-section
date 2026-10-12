---
title: Generalize /verify Command
description: Add tool, hook, and plan verification checks to /verify while maintaining current library-specific checks.
date-created: 2026-03-31
type: research-note
name: generalize-verify-command
tags:
  - verify-command
  - check-categories
  - tool-verification
  - plan-consistency
  - hook-wiring
specialization: plan
department: engineering
project: generative-harness
architecture-note: Under architecture.md, verify is a respond() composition, not a special command.
---


## Goal

`/verify` currently has 7 check categories. Five are library-specific (frontmatter, links, graph, conventions, index sync). As the system grows to include code, tools, and infrastructure, verify needs to handle those too — without losing its current library checks.

## Context

- `/verify` is at `.claude/commands/verify.md`
- It already has a "Build Check" section but it's minimal ("run the appropriate build command")
- ECC's `verification-loop` skill has patterns for build/test/lint verification that could inform expansion
- The system already has Python tools (`operations/engineering/fars/graph/`) and JS hooks (`operations/engineering/fars/agentic/hooks/`) — these are code that should be verifiable
- Plans in `operations/*/plans/` have structured frontmatter and step markers — these could be checked too

## Steps

### Step 1: Add tool/hook verification checks

Add a new check category to `/verify` for operations tooling:

- **Python tools** — For each `.py` file in `operations/engineering/fars/`, verify it parses without syntax errors (`python -c "import ast; ast.parse(open('file').read())"`)
- **JS hooks** — For each `.js` file in `operations/engineering/fars/agentic/hooks/`, verify it parses (`node --check file`)
- **Hook wiring** — Verify that hooks referenced in `.claude/settings.json` point to files that actually exist

### Step 2: Add plan consistency checks

Add a check category for plans:

- Plans with all steps marked `[DONE]` but `status` not `completed` — flag
- Plans with `status: active` but no steps marked `[DONE]` — flag (stale active?)
- Plans referencing files that no longer exist — flag

### Step 3: Add argument routing

Update the arguments section so `code` runs only tool/hook checks and `plans` runs only plan checks, alongside the existing `quick`, `full`, `graph` options.

## Success criteria

- `/verify full` runs library checks AND tool/plan checks
- `/verify code` checks only Python and JS tooling
- `/verify plans` checks only plan consistency
- No false positives on the current state of the system
