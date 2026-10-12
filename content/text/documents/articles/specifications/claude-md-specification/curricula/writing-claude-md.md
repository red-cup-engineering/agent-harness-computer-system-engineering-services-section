---
title: "Writing a CLAUDE.md File"
aliases:
  - "Writing a CLAUDE.md File"
  - "writing a CLAUDE.md file"
id: writing-claude-md
kind: lesson
authors:
  - emsenn
  - claude
date-created: 2026-03-08T00:00:00
type: lesson
tags:
  - AIAgents
  - ClaudeCode
  - ToolingContract
teaches:
  - "How to write an effective CLAUDE.md file"
requires:
  - ../index.md
description: "A lesson on writing CLAUDE.md files that give Claude Code the project context it needs without bloating the context window."
---

This lesson covers how to write a CLAUDE.md file that effectively
guides Claude Code. The goal is a file that prevents agent mistakes
without wasting context.

## Prerequisites

Read the [CLAUDE.md specification](../index.md) to understand the
file hierarchy, load order, and scoping rules.

## Step 1: Audit what the agent gets wrong

Before writing anything, run Claude Code on your project without a
CLAUDE.md. Note where it makes mistakes: wrong build commands, bad
file placement, style violations, incorrect assumptions about
architecture.

Each line in CLAUDE.md should correct a specific mistake. If removing
a line would not cause the agent to err, cut it.

## Step 2: Write build and test commands

Start with the commands the agent needs to build, test, and lint the
project. These are the highest-value instructions because the agent
cannot discover them reliably from code alone.

```markdown
## Build and test

- `npm run build` — build the project
- `npm test` — run the test suite
- `npm run lint` — check code style
```

Be specific. Name the exact commands, not vague instructions like
"test your changes."

## Step 3: State architectural constraints

List constraints the agent cannot infer from reading code:

- Where specific kinds of files go
- What patterns to use (and what to avoid)
- Which directories are off-limits
- External service dependencies

```markdown
## Architecture

- API handlers live in `src/api/handlers/`
- Use the repository pattern for data access
- Do not modify files under `src/generated/`
```

## Step 4: Add style rules not enforced by tooling

If your linter and formatter handle style, do not duplicate their
rules in CLAUDE.md. Only include style rules that tooling does not
enforce: naming conventions, comment practices, import ordering
preferences beyond what the formatter handles.

## Step 5: Keep it short

Target under 200 lines. If you need more, use progressive disclosure:

- **Subdirectory CLAUDE.md files** for context scoped to a directory
- **`.claude/rules/` files** for modular, path-specific rules
- **`@path` imports** for referenced documents loaded on demand

## Step 6: Review regularly

CLAUDE.md goes stale when project conventions change. Stale
instructions poison the agent's context because it treats them as
authoritative. Review when conventions change and remove instructions
that no longer apply.

## Common mistakes

1. **Too long.** Files over 200 lines reduce instruction adherence.
2. **Too vague.** "Format code properly" does not help. "Use 2-space
   indentation" does.
3. **Duplicating tooling.** If ESLint enforces it, CLAUDE.md should
   not repeat it.
4. **Including domain knowledge.** The agent can read your code and
   docs. CLAUDE.md is for instructions, not education.
5. **Forgetting CLAUDE.local.md.** Personal preferences that should
   not be committed belong in CLAUDE.local.md.

## Exercise

Take a project you work on. Write a CLAUDE.md file under 100 lines
that covers: build commands, test commands, three architectural
constraints, and one style rule not enforced by tooling. Run Claude
Code and verify it follows each instruction.
