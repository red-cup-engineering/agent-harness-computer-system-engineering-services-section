---
title: "Writing a README.md File"
aliases:
  - "Writing a README.md File"
  - "writing a README.md file"
id: writing-readme-md
kind: lesson
authors:
  - emsenn
  - claude
date-created: 2026-03-08T00:00:00
type: lesson
tags:
  - Documentation
  - OpenStandard
teaches:
  - "How to write an effective README.md file"
requires:
  - ../index.md
description: "A lesson on writing README.md files that orient human readers to a project or directory."
---

This lesson covers how to write a README.md that orients human
readers. A good README answers three questions: what is this, how do
I use it, and how do I contribute.

## Prerequisites

Read the [README.md specification](../index.md) to understand the
convention's history, standard sections, and relationship to AGENTS.md.

## Step 1: Start with the title and short description

The title is the project name. The short description is one sentence,
under 120 characters, that says what the project does. Don't say what
the project *is* — say what it *does* or what problem it solves.

```markdown
# my-project

A CLI tool that converts Obsidian vaults into static websites.
```

## Step 2: Write install and usage

These are the highest-value sections. A reader who can't install or
use the project will leave. Be concrete: exact commands, expected
output, platform requirements.

```markdown
## Install

npm install -g my-project

## Usage

my-project build ./vault --output ./site
```

Test your install and usage instructions on a clean machine (or in a
fresh container). Instructions that worked once on your machine but
fail elsewhere are worse than no instructions.

## Step 3: Add context if needed

If the project needs more context than the short description provides,
add a Background section explaining the problem the project solves
and why existing solutions are insufficient. Keep it short — one to
three paragraphs.

## Step 4: Document contributing and license

Contributing tells people how to help. License tells people what they
can do with the code. Both are required by the Standard README.

```markdown
## Contributing

See CONTRIBUTING.md for guidelines.

## License

MIT
```

## Step 5: Keep it current

A stale README is worse than no README. When project conventions
change — new build commands, renamed directories, updated
dependencies — update the README. Treat README.md like code: if a PR
changes build steps, the PR should update the README.

## Common mistakes

1. **No install or usage instructions.** The most common failure.
2. **Stale instructions.** Commands that no longer work.
3. **Too long.** A README is orientation, not documentation. Link to
   docs for detailed reference.
4. **Duplicating AGENTS.md.** README targets humans, AGENTS.md targets
   agents. Don't merge them.
5. **Missing license.** Many contributors won't touch unlicensed code.

## Exercise

Pick a project you maintain. Write or rewrite its README.md following
the Standard README section order. Test the install and usage
instructions from scratch. Keep it under 100 lines.
