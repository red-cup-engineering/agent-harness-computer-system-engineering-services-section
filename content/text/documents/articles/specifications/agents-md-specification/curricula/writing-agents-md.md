---
title: "Writing an AGENTS.md File"
aliases:
  - "Writing an AGENTS.md File"
  - "writing an AGENTS.md file"
id: writing-agents-md
kind: lesson
authors:
  - emsenn
  - claude
date-created: 2026-03-08T00:00:00
type: lesson
tags:
  - AIAgents
  - OpenStandard
  - ToolingContract
teaches:
  - "How to write an effective AGENTS.md file"
requires:
  - ../index.md
description: "A lesson on writing AGENTS.md files that give AI coding agents cross-tool project context."
---

This lesson covers how to write an AGENTS.md file that works across
AI coding tools. Because AGENTS.md is a cross-tool standard, it must
contain only instructions that are meaningful to any agent, not
vendor-specific features.

## Prerequisites

Read the [AGENTS.md specification](../index.md) to understand the
standard's scope, adoption, and scoping rules.

## Step 1: Decide AGENTS.md vs CLAUDE.md

If your project uses only Claude Code, a CLAUDE.md file is sufficient
and gives you access to Claude-specific features (rules, imports,
path scoping). If your team uses multiple AI coding tools, AGENTS.md
is the right choice.

For projects that need both: maintain AGENTS.md as the canonical file
and symlink CLAUDE.md to it.

```bash
mv CLAUDE.md AGENTS.md
ln -s AGENTS.md CLAUDE.md
```

## Step 2: Write tool-agnostic instructions

AGENTS.md should contain only instructions that any coding agent can
follow. Avoid vendor-specific features:

**Include:**
- Build and test commands
- Code style conventions
- Architectural constraints
- Directory structure guidance
- Security considerations
- Commit and PR conventions

**Exclude:**
- Claude Code skills or hooks
- MCP server configuration
- Editor-specific plugin settings
- Tool-specific slash commands

## Step 3: Cover build and test

Every AGENTS.md should start with how to build and test the project.
Agents execute these commands to verify their work.

```markdown
## Build and test

- `make build` — compile the project
- `make test` — run the full test suite
- `make lint` — check code style

Run tests before completing any task. Fix failures before submitting.
```

Studies show agents perform measurably better when AGENTS.md includes
concrete build and test commands.

## Step 4: State code conventions

List conventions that agents should follow. Be specific and concrete:

```markdown
## Code style

- Use 4-space indentation in Python files
- All public functions must have docstrings
- Import ordering: stdlib, third-party, local (separated by blank lines)
- Error messages must include the function name
```

## Step 5: Document architecture

Help agents understand where code lives and what patterns to follow:

```markdown
## Architecture

- HTTP handlers in `src/handlers/`
- Business logic in `src/services/`
- Database queries in `src/repositories/`
- Do not put business logic in handlers
```

## Step 6: Use nested files in monorepos

For monorepos, place an AGENTS.md at each subproject root. The nearest
AGENTS.md to the edited file takes precedence. This keeps instructions
focused and prevents one team's conventions from affecting another.

```
monorepo/
├── AGENTS.md              # Repo-wide conventions
├── frontend/
│   └── AGENTS.md          # Frontend-specific rules
├── backend/
│   └── AGENTS.md          # Backend-specific rules
└── shared/
    └── AGENTS.md          # Shared library conventions
```

## Step 7: Keep it short and review regularly

The same principles from [writing CLAUDE.md](../../claude-md-specification/curricula/writing-claude-md.md)
apply:

- Target under 300 lines (shorter is better)
- Every line should prevent a mistake the agent would otherwise make
- Review when conventions change
- Remove stale instructions promptly

## Common mistakes

1. **Including vendor-specific features.** AGENTS.md is cross-tool.
   Claude Code skills, Cursor rules, and Copilot settings do not
   belong here.
2. **Duplicating README.md.** README is for humans. AGENTS.md is for
   agents. The overlap should be minimal.
3. **No build commands.** Build and test instructions are the
   highest-value content for agents.
4. **Too long.** Shorter files produce better agent adherence across
   all tools.
5. **Never updating.** Stale instructions cause agents to follow
   outdated conventions.

## Exercise

Take a project that uses at least two AI coding tools. Write an
AGENTS.md under 150 lines covering: build commands, test commands,
four code conventions, and the directory structure. Test it with two
different tools and compare adherence.
