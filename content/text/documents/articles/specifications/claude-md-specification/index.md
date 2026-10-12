---
title: "CLAUDE.md Specification"
aliases:
  - "CLAUDE.md Specification"
  - "claude-md-specification"
date-created: 2026-03-08T00:00:00
authors:
  - emsenn
  - claude
type: specification
tags:
  - AIAgents
  - ClaudeCode
  - ToolingContract
description: "Convention specification documenting the CLAUDE.md instruction file format used by Claude Code to receive persistent, project-specific context."
spec-id: claude-md-specification
version: 0.1.0
stability: draft
requires:
  - ../../../../specifications/semiotic-specification/index.md
  - ../../../../specifications/semiotic-markdown/index.md
---

This is a **convention specification** documenting CLAUDE.md, the
persistent instruction file format for Anthropic's Claude Code.
Introduced with Claude Code's research preview in February 2025 and
generally available since May 2025, it describes the file hierarchy,
load semantics, and content conventions as implemented by Claude Code.
The filename is case-sensitive: it MUST be exactly `CLAUDE.md`. This
specification records an external convention; it does not define it.

## 0. Scope

This specification applies to CLAUDE.md files written for use with
Claude Code. It documents the behavior of Claude Code as of early
2026. The authoritative source is Anthropic's official documentation.

## 1. Purpose

A CLAUDE.md file gives Claude Code persistent, project-specific
context that the agent cannot infer from code alone. Claude Code reads
these files at the start of every session and loads them into its
context window alongside the conversation. They are context, not
enforced configuration: how reliably Claude follows them depends on
specificity and conciseness.

The litmus test for each line: would removing it cause the agent to
make mistakes? If not, cut it.

## 2. File hierarchy and load order

Claude Code supports CLAUDE.md files at multiple scopes. More specific
locations take precedence over broader ones.

| Scope | Location | Purpose |
|---|---|---|
| Managed policy | OS-specific system path | Organization-wide instructions managed by IT/DevOps |
| User | `~/.claude/CLAUDE.md` | Personal preferences across all projects |
| Project | `./CLAUDE.md` or `./.claude/CLAUDE.md` | Team-shared project instructions (version-controlled) |
| Local | `./CLAUDE.local.md` | Personal project-specific preferences (not committed) |

Managed policy locations:

- macOS: `/Library/Application Support/ClaudeCode/CLAUDE.md`
- Linux and WSL: `/etc/claude-code/CLAUDE.md`
- Windows: `C:\Program Files\ClaudeCode\CLAUDE.md`

### 2.1. Directory tree walk

Claude Code walks up the directory tree from the current working
directory, loading CLAUDE.md and CLAUDE.local.md files from each
ancestor directory. If Claude Code runs in `foo/bar/`, it loads
instructions from both `foo/bar/CLAUDE.md` and `foo/CLAUDE.md`.

### 2.2. Subdirectory lazy loading

CLAUDE.md files in subdirectories below the working directory are not
loaded at launch. They load on demand when Claude reads files in those
subdirectories. Sibling directories never cross-load.

### 2.3. Additional directories

The `--add-dir` flag gives Claude access to directories outside the
main working directory. CLAUDE.md files from additional directories are
NOT loaded by default. To load them, set the environment variable
`CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD=1`.

### 2.4. Precedence

When instructions conflict across scopes, the more specific scope
wins. Managed policy CLAUDE.md files cannot be excluded by individual
settings.

## 3. Modular rules (`.claude/rules/`)

For larger projects, instructions MAY be organized into multiple
markdown files under `.claude/rules/`. Each file SHOULD cover one
topic, with a descriptive filename (e.g., `testing.md`,
`api-design.md`).

### 3.1. Unconditional rules

Rules without `paths` frontmatter are loaded at launch with the same
priority as `.claude/CLAUDE.md`.

### 3.2. Path-specific rules

Rules MAY be scoped to specific files using YAML frontmatter with a
`paths` field. These conditional rules load only when Claude works
with files matching the specified glob patterns.

```yaml
---
paths:
  - "src/api/**/*.ts"
---
```

Standard glob patterns are supported: `**/*.ts`, `src/**/*`,
`*.md`, and brace expansion like `*.{ts,tsx}`.

### 3.3. User-level rules

Personal rules in `~/.claude/rules/` apply to every project on the
machine. User-level rules load before project rules, giving project
rules higher priority.

### 3.4. Symlinks

The `.claude/rules/` directory supports symlinks for sharing rules
across projects. Circular symlinks are detected and handled.

## 4. Imports

CLAUDE.md files MAY import additional files using `@path/to/file`
syntax. Imported files are expanded and loaded into context at launch.
Relative paths resolve relative to the file containing the import.
Imports may recurse to a maximum depth of five hops.

The first time Claude Code encounters external imports in a project,
it shows an approval dialog. If declined, imports stay disabled for
that project.

Home-directory imports are supported: `@~/.claude/my-instructions.md`.

## 5. Bootstrapping with `/init`

The `/init` command generates a starting CLAUDE.md by analyzing the
codebase. It discovers build commands, test instructions, and project
conventions. If a CLAUDE.md already exists, `/init` suggests
improvements rather than overwriting.

## 6. Content guidelines

### 6.1. Size

Target under 200 lines per CLAUDE.md file. Longer files consume more
context and reduce adherence.

### 6.2. What to include

- Build, test, and lint commands
- Architectural constraints the agent cannot infer
- Style rules not enforced by tooling
- Session startup checks
- Pointers to key files and specifications
- What not to touch

### 6.3. What not to include

- Domain knowledge the agent can read from content files
- Detailed task-specific workflows (use skills instead)
- Duplicated linter or formatter rules
- Long convention lists that belong in a style guide

### 6.4. Structure

Use markdown headers and bullets. Lead each section with the
actionable rule, not the rationale. Specific instructions ("Use
2-space indentation") outperform vague ones ("Format code properly").

## 7. Auto memory

Claude Code also maintains an automatic memory system separate from
CLAUDE.md. Auto memory files live in
`~/.claude/projects/<project>/memory/` and are written by Claude
itself based on corrections and patterns observed during sessions.

The `MEMORY.md` entrypoint is limited to 200 lines loaded at session
start. Topic files load on demand. Auto memory is machine-local and
scoped per git repository.

Auto memory complements CLAUDE.md: CLAUDE.md holds instructions the
user writes; auto memory holds learnings Claude accumulates.

## 8. Exclusions

In large monorepos, the `claudeMdExcludes` setting allows skipping
specific CLAUDE.md files by path or glob pattern. This setting can be
configured at any settings layer (user, project, local, managed
policy). Arrays merge across layers. Managed policy CLAUDE.md files
cannot be excluded.

## 9. Related configuration files

CLAUDE.md is one of several configuration mechanisms in Claude Code:

| File | Purpose | Loaded |
|---|---|---|
| `CLAUDE.md` | Project instructions (committed) | At session start |
| `CLAUDE.local.md` | Personal project overrides (gitignored) | At session start |
| `.claude/rules/*.md` | Modular, optionally path-scoped rules | At start or on-demand |
| `SKILL.md` | On-demand domain expertise | When invoked or matched |
| `.claude/agents/*.md` | Subagent system prompts | When delegated to |
| `settings.json` | Permissions, tools, hooks, environment | At session start |

## 10. Debugging

Run `/memory` within a Claude Code session to verify which CLAUDE.md
files are loaded. The `InstructionsLoaded` hook event fires when a
CLAUDE.md or `.claude/rules/*.md` file is loaded into context. It
fires at session start for eagerly-loaded files and again later for
lazily-loaded subdirectory files and path-matched rules. It only
supports `type: "command"` hooks and runs asynchronously.

CLAUDE.md survives context compaction (`/compact`). After compaction,
Claude re-reads CLAUDE.md from disk. Instructions given only in
conversation do not survive compaction.

## Glossary

- **CLAUDE.md**: a markdown file providing persistent instructions to
  Claude Code, loaded at session start.
- **Managed policy**: an organization-wide CLAUDE.md deployed via
  system configuration management.
- **Auto memory**: machine-local notes Claude writes for itself across
  sessions.
- **Rule**: a modular instruction file under `.claude/rules/`.
- **Path-specific rule**: a rule scoped to files matching glob
  patterns via `paths` frontmatter.
- **Import**: inline `@path` reference that expands an external file
  into CLAUDE.md context.

## Rationale (non-normative)

CLAUDE.md exists because AI coding agents need project-specific
context that cannot be inferred from code alone. Build commands,
architectural constraints, and team conventions vary across projects
and change over time. A persistent instruction file checked into
version control lets teams share this context.

The hierarchical design (managed, user, project, local) mirrors
established configuration patterns (e.g., git config) where broader
scopes set defaults and narrower scopes override them. Lazy loading of
subdirectory files implements progressive disclosure: the agent
receives context only when it enters a relevant part of the codebase.

## Curricula

- [Writing a CLAUDE.md File](curricula/writing-claude-md.md) — lesson
  on creating effective CLAUDE.md files

## Skills

- [write-claude-md](skills/write-claude-md/SKILL.md) — write or
  improve a CLAUDE.md file for a project

## Relationship to other specs

- **Requires**: [semiotic-markdown](../../../../specifications/semiotic-markdown/index.md)
  (CLAUDE.md files are markdown documents).
- **Related**: [AGENTS.md specification](../agents-md-specification/index.md)
  (cross-tool alternative; see that spec for interoperability).
- **Documented by**: [CLAUDE.md term](../../terms/claude-md.md)
  (shorter reference in the claude-code term glossary).

## References (non-normative)

- Anthropic, "How Claude remembers your project," Claude Code
  documentation, 2026. https://code.claude.com/docs/en/memory
- Anthropic, "Claude Code settings," Claude Code documentation, 2026.
  https://code.claude.com/docs/en/settings
- Anthropic, "Claude Code overview," Claude Code documentation, 2026.
  https://code.claude.com/docs/en/overview
- Anthropic, "Skills," Claude Code documentation, 2026.
  https://code.claude.com/docs/en/skills
- Anthropic, "Hooks reference," Claude Code documentation, 2026.
  https://code.claude.com/docs/en/hooks
