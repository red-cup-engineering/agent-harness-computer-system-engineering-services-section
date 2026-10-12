---
title: "AGENTS.md Specification"
aliases:
  - "AGENTS.md Specification"
  - "agents-md-specification"
date-created: 2026-03-08T00:00:00
authors:
  - emsenn
  - claude
type: specification
tags:
  - AIAgents
  - ToolingContract
  - OpenStandard
description: "Convention specification documenting the AGENTS.md open standard for providing project-specific instructions to AI coding agents, maintained by the Agentic AI Foundation under the Linux Foundation."
spec-id: agents-md-specification
version: 0.1.0
stability: draft
requires:
  - ../../../../specifications/semiotic-specification/index.md
  - ../../../../specifications/semiotic-markdown/index.md
---

This is a **convention specification** documenting AGENTS.md, an open
standard for guiding AI coding agents. Originally released by OpenAI
in August 2025, it is now maintained by the Agentic AI Foundation
(AAIF) under the Linux Foundation. This specification records an
external convention; it does not define it.

## 0. Scope

This specification applies to AGENTS.md files checked into git
repositories for consumption by AI coding agents. It documents the
AGENTS.md convention as of early 2026. The authoritative source is the
AAIF specification at [agents.md](https://agents.md/).

## 1. Purpose

AGENTS.md is a markdown file checked into a git repository that
customizes how AI coding agents behave. It complements README.md:
where README.md targets human contributors, AGENTS.md provides the
extra context coding agents need to operate reliably — build steps,
test commands, code conventions, and architectural constraints.

AGENTS.md sits at the top of the conversation history, below the
system prompt, and loads on every request. Studies report a 29%
reduction in median runtime and 17% reduction in output tokens when
AGENTS.md files are present.

## 2. Origin and governance

AGENTS.md was released in July 2025 as a collaborative effort by
OpenAI, Sourcegraph (Amp), Google, Cursor, and Factory. On
December 9, 2025, the
Linux Foundation announced the formation of the Agentic AI Foundation
(AAIF), anchored by three founding project contributions:

1. **Model Context Protocol (MCP)** — contributed by Anthropic
2. **goose** — contributed by Block
3. **AGENTS.md** — contributed by OpenAI

Platinum members of the AAIF include Amazon Web Services, Anthropic,
Block, Bloomberg, Cloudflare, Google, Microsoft, and OpenAI.

## 3. Adoption

AGENTS.md has been adopted by over 60,000 open source projects and is
supported by major agent frameworks and tools including:

- OpenAI Codex
- Google Gemini CLI and Jules
- GitHub Copilot
- Cursor
- Windsurf
- Aider
- Zed
- Warp
- Roo Code
- AMP
- Devin
- Factory

## 4. File format

AGENTS.md is standard markdown with no required fields and no
mandatory sections. The filename MUST be uppercase: `AGENTS.md` (not
`agents.md`). Agents parse the text without strict validation. The
specification intentionally avoids rigid prescriptiveness to maintain
cross-platform compatibility. The specification is licensed under MIT.

### 4.1. Recommended sections

GitHub's analysis of over 2,500 repositories identifies six core areas
that effective AGENTS.md files cover:

1. **Commands** — exact build, test, and lint commands with flags,
   placed early in the file
2. **Testing** — how to run tests, CI expectations, coverage
   requirements
3. **Project structure** — architecture overview, major modules,
   directory layout
4. **Code style** — naming conventions and patterns, with code
   examples rather than prose descriptions
5. **Git workflow** — branching strategy, commit conventions, PR
   requirements
6. **Boundaries** — a three-tier system:
   - Always do (requirements)
   - Ask first (considerations)
   - Never do (hard limits, e.g., "never commit secrets")

### 4.2. Programmatic checks

Agents SHOULD execute any programmatic checks or testing commands
listed in AGENTS.md and attempt to fix failures before completing a
task.

## 5. Directory hierarchy and scoping

AGENTS.md supports nested files in monorepos and subprojects. The
scoping rule: **the closest AGENTS.md to the edited file wins;
explicit user chat prompts override everything**.

Agents automatically read the nearest AGENTS.md in the directory tree.
Large repositories may use many nested files (e.g., the OpenAI
repository uses 88 nested AGENTS.md files).

### 5.1. File discovery order

The reference implementation (OpenAI Codex) walks the directory tree
from root to the current working directory, checking each directory
for:

1. `AGENTS.override.md` (takes precedence if present)
2. `AGENTS.md`

Files concatenate root-downward: files closer to the current
directory appear later and override earlier guidance. At most one
file per directory is loaded; empty files are skipped.

A global file at `~/.codex/AGENTS.md` (or `AGENTS.override.md`)
provides user-level defaults.

### 5.2. Size limits

Combined files are capped at `project_doc_max_bytes` (default 32 KiB
in the Codex implementation). Content beyond this limit is truncated.

### 5.3. Override mechanism

An `AGENTS.override.md` file in any directory takes precedence over
`AGENTS.md` in the same directory. This allows local overrides
without modifying the shared file.

## 6. Content guidelines

The same principles that apply to CLAUDE.md apply to AGENTS.md:

- Keep it short (under 300 lines; shorter is better)
- Focus on what agents would get wrong without the file
- Do not duplicate linter or formatter rules
- Use progressive disclosure (subdirectory files for local context)
- Review for staleness regularly

### 6.1. Cross-tool scope

AGENTS.md SHOULD contain only cross-tool instructions. Vendor-specific
features (Claude Code skills, MCP server configuration, editor
plugins) belong in the vendor's own file or in referenced documents.

## 7. Relationship to CLAUDE.md

AGENTS.md and [CLAUDE.md](../claude-md-specification/index.md) serve
the same purpose but differ in scope:

| | CLAUDE.md | AGENTS.md |
|---|---|---|
| **Vendor** | Anthropic (Claude Code) | AAIF (cross-tool) |
| **Read by** | Claude Code | 60+ tools and frameworks |
| **Hierarchy** | Multi-scope (managed, user, project, local) | Repository-scoped (nested files) |
| **Rules system** | `.claude/rules/` with path-specific scoping | None (convention only) |
| **Imports** | `@path` syntax | None |
| **Auto memory** | Yes (separate system) | No |

Claude Code reads CLAUDE.md natively but does not read AGENTS.md
natively. For cross-tool compatibility, teams MAY maintain AGENTS.md
as the canonical file and symlink CLAUDE.md to it:

```bash
mv CLAUDE.md AGENTS.md
ln -s AGENTS.md CLAUDE.md
```

## 8. Security considerations

AGENTS.md files are loaded as trusted context by AI coding agents,
making them a potential attack vector. The "Rules File Backdoor"
attack, documented by Pillar Security in early 2025, exploits this
trust:

- Attackers embed hidden instructions using zero-width Unicode
  characters, bidirectional text markers, or semantic hijacking
- These invisible instructions can cause agents to generate code
  with backdoors or vulnerabilities
- Configuration files are typically trusted and rarely scrutinized
  in code review

Mitigations:

- Treat AGENTS.md with the same scrutiny as executable code during
  code review
- Audit for invisible Unicode characters (GitHub added warnings for
  hidden Unicode in May 2025)
- Block hidden characters in agent instruction files at the platform
  level

## Glossary

- **AGENTS.md**: a markdown file checked into a git repository that
  provides project-specific instructions to AI coding agents.
- **Agentic AI Foundation (AAIF)**: a Linux Foundation project
  stewarding open standards for agentic AI, including AGENTS.md, MCP,
  and goose.
- **Nearest-file scoping**: the rule that the AGENTS.md closest to
  the edited file in the directory tree takes precedence.
- **AGENTS.override.md**: a per-directory override file that takes
  precedence over AGENTS.md in the same directory.

## Rationale (non-normative)

Before AGENTS.md, every AI coding tool had its own instruction file:
CLAUDE.md for Claude Code, .cursorrules for Cursor, GEMINI.md for
Gemini, COPILOT.md for GitHub Copilot. Projects that used multiple
tools had to maintain parallel files with largely identical content.

AGENTS.md solves this by providing a single, vendor-neutral file that
all tools can read. Its deliberately minimal format — standard
markdown, no required fields — maximizes compatibility. Any tool that
can parse markdown can consume AGENTS.md.

The move to the Linux Foundation via the AAIF in December 2025 gave
the standard neutral governance, ensuring no single vendor controls
its evolution.

## Curricula

- [Writing an AGENTS.md File](curricula/writing-agents-md.md) — lesson
  on creating effective cross-tool AGENTS.md files

## Skills

- [write-agents-md](skills/write-agents-md/SKILL.md) — write or
  improve an AGENTS.md file for a project

## Relationship to other specs

- **Requires**: [semiotic-markdown](../../../../specifications/semiotic-markdown/index.md)
  (AGENTS.md files are markdown documents).
- **Related**: [CLAUDE.md specification](../claude-md-specification/index.md)
  (vendor-specific alternative for Claude Code).
- **Documented by**: [AGENTS.md term](../../terms/agents-md.md)
  (shorter reference in the claude-code term glossary).

## References (non-normative)

- AAIF, "AGENTS.md," Agentic AI Foundation, 2025–2026.
  https://agents.md/
- GitHub, "AGENTS.md repository," https://github.com/agentsmd/agents.md
- OpenAI, "Codex AGENTS.md Guide,"
  https://developers.openai.com/codex/guides/agents-md
- GitHub Blog, "How to write a great agents.md: Lessons from over
  2,500 repositories," 2025.
- Linux Foundation, "Linux Foundation Announces the Formation of the
  Agentic AI Foundation," press release, December 9, 2025.
- OpenAI, "OpenAI co-founds the Agentic AI Foundation under the Linux
  Foundation," December 2025.
- Pillar Security, "New Vulnerability in GitHub Copilot and Cursor:
  How Hackers Can Weaponize Code Agents," 2025.
