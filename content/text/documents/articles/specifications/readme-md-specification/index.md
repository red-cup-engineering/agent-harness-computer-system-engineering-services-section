---
title: "README.md Specification"
aliases:
  - "README.md Specification"
  - "readme-md-specification"
date-created: 2026-03-08T00:00:00
authors:
  - emsenn
  - claude
type: specification
tags:
  - Documentation
  - ToolingContract
  - OpenStandard
description: "Convention specification documenting the README.md file convention for software projects: history, common sections, and the Standard README specification."
spec-id: readme-md-specification
version: 0.1.0
stability: draft
requires:
  - ../../../../specifications/semiotic-specification/index.md
  - ../../../../specifications/semiotic-markdown/index.md
---

This is a **convention specification** documenting README.md, the
long-standing convention of including a descriptive file at the root
of a software project or directory. This specification records an
external convention; it does not define it.

## 0. Scope

This specification applies to README.md files in software repositories
and knowledge bases. It documents the convention as practiced in the
broader software ecosystem, with attention to the Standard README
specification and GitHub's rendering conventions.

## 1. Purpose

A README file contains descriptive information about the contents of
a directory. It is the first entry point for human readers
encountering a project. Where [AGENTS.md](../agents-md-specification/index.md)
targets AI coding agents and code targets machines, README.md targets
human contributors, maintainers, and users.

README.md answers: what is this project, how do I use it, and how do
I contribute?

## 2. History

The README convention dates to the mid-1970s. Early instances appear
in the Programmer's Workbench (Unix, 1977) and other early Unix
distributions spanning 1977–1980. The name alludes to Lewis Carroll's
*Alice's Adventures in Wonderland* ("Eat Me," "Drink Me") — a label
designed to draw attention.

Early README files were plain text, distributed alongside punch cards
and magnetic tapes. The `.md` extension (Markdown format) became
dominant after GitHub's founding in 2008, which renders README.md
files automatically on repository pages. Tom Preston-Werner, GitHub's
co-founder, advocated "README-driven development" — writing the
README before the code.

## 3. File naming

The filename MUST be `README` (uppercase) with an appropriate
extension:

- `.md` — Markdown (most common)
- `.txt` — plain text
- `.org` — Org Mode
- `.rst` — reStructuredText
- `.html` — HTML

GitHub, GitLab, Bitbucket, and most hosting platforms detect and
render README files automatically. The filename is case-sensitive on
case-sensitive filesystems; uppercase `README` is the convention.

For internationalized READMEs: `README.de.md` where `de` is a BCP 47
language tag. `README.md` is reserved for English when multiple
languages exist.

## 4. Standard README specification

The Standard README project (Richard Litt) is the most widely
referenced formalization of README conventions.

### 4.1. Required sections (in order)

1. **Title** — the project name
2. **Short description** — under 120 characters, matching the package
   manager and GitHub descriptions
3. **Table of Contents** — optional if the file is under 100 lines
4. **Install** — how to install the project
5. **Usage** — how to use the project
6. **Contributing** — how to contribute
7. **License** — the project's license

### 4.2. Optional sections (in order)

- Banner (image)
- Badges (build status, coverage, etc.)
- Long description
- Security
- Background
- Custom sections
- API documentation
- Maintainers
- Thanks / acknowledgments

### 4.3. Requirements

- Sections MUST appear in the specified order
- Optional sections MAY be omitted
- No broken links
- Code examples MUST follow the project's linting standards

## 5. Google's README style

Google's internal style guide specifies:

- Every top-level directory for a code package SHOULD have an
  up-to-date README.md
- README.md files SHOULD be located in the top-level directory

## 6. Relationship to AGENTS.md

README.md and [AGENTS.md](../agents-md-specification/index.md) are
complementary:

| | README.md | AGENTS.md |
|---|---|---|
| **Audience** | Humans | AI coding agents |
| **Purpose** | Project orientation | Agent behavior guidance |
| **Content** | What, why, how to use | Build, test, conventions |
| **Origin** | 1970s Unix | 2025 (AAIF) |

The overlap between them SHOULD be minimal. README.md covers project
purpose and human onboarding. AGENTS.md covers conventions and
commands that agents need to operate correctly.

## 7. README in the ASR

In this repository, README.md files serve as the human-readable
counterpart to `index.md` files. Where `index.md` is the interaction
surface for the vault's predicate graph, README.md is the interaction
surface for human readers arriving from GitHub or a file browser.

The vault's `index.md` files follow
[semiotic-markdown](../../../../specifications/semiotic-markdown/index.md)
conventions (typed frontmatter, semantic relations). README.md files
follow external conventions (no frontmatter required, narrative
structure) and do not participate in the predicate graph.

## Glossary

- **README.md**: a markdown file at the root of a directory or
  repository that describes its contents for human readers.
- **Standard README**: a specification by Richard Litt formalizing
  README section order and content.
- **README-driven development**: Tom Preston-Werner's practice of
  writing the README before the code.

## Rationale (non-normative)

README files are one of computing's oldest documentation conventions.
Their persistence across five decades — from punch card distribution
to GitHub rendering — reflects a stable need: when humans encounter
an unfamiliar directory, they need orientation. The README provides
it.

The rise of AI coding agents created a parallel need for machine
orientation, leading to AGENTS.md (and vendor-specific variants like
CLAUDE.md). README.md remains the human entry point; AGENTS.md is the
agent entry point. Both are plain markdown files at the root of a
directory, but they serve distinct audiences with distinct needs.

## Curricula

- [Writing a README.md File](curricula/writing-readme-md.md) — lesson
  on creating effective README files

## Skills

- [write-readme-md](skills/write-readme-md/SKILL.md) — write or
  improve a README.md file for a project

## Relationship to other specs

- **Requires**: [semiotic-markdown](../../../../specifications/semiotic-markdown/index.md)
  (README.md files are markdown documents, though they may omit
  semiotic frontmatter to follow external conventions).
- **Related**: [AGENTS.md specification](../agents-md-specification/index.md)
  (agent-facing counterpart).
- **Related**: [CLAUDE.md specification](../claude-md-specification/index.md)
  (Claude Code–specific instruction file).

## References (non-normative)

- Richard Litt, "Standard README," GitHub, 2016–present.
  https://github.com/RichardLitt/standard-readme
- Google, "READMEs," Google Developer Documentation Style Guide.
  https://google.github.io/styleguide/docguide/READMEs.html
- Tom Preston-Werner, "Readme Driven Development," 2010.
- Wikipedia, "README."
