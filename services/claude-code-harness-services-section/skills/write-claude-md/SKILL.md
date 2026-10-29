---
description: Write or improve a CLAUDE.md file for a project. Use when setting up Claude Code instructions or auditing an existing CLAUDE.md.
id: write-claude-md
name: write-claude-md
version: [0, 1]
kind: operational
runtime: inference
triggers:
  - "write claude md"
  - "create claude md"
  - "improve claude md"
  - "set up claude code instructions"
inputs:
  project_root: string?
outputs:
  path: string
region:
  reads: ["content/technology/disciplines/computing/software/claude-code/"]
  writes: []
dependencies: []
part-of: technology/disciplines/computing/software/claude-code/specifications/claude-md-specification
---
Write or improve a CLAUDE.md file: $ARGUMENTS

## Instructions

1. **Locate the project root.** If `project_root` is given, use it.
   Otherwise use the current working directory.

2. **Read existing CLAUDE.md.** If one exists, read it and note what
   it already covers. Check for:
   - Staleness (references to files or commands that no longer exist)
   - Vagueness (instructions too generic to verify)
   - Duplication (rules already enforced by linters or formatters)
   - Length (over 200 lines is too long)

3. **Discover project conventions.** Read:
   - `package.json`, `Makefile`, `Cargo.toml`, or equivalent for
     build/test/lint commands
   - Linter and formatter configs (`.eslintrc`, `.prettierrc`,
     `pyproject.toml`, etc.) to know what NOT to duplicate
   - Directory structure to identify architectural patterns
   - Existing README.md for project context

4. **Draft the CLAUDE.md.** Follow the
   [CLAUDE.md specification](../../index.md) and the
   [writing curriculum](../../curricula/writing-claude-md.md).
   Structure:

   ```markdown
   # Project-specific build/test commands
   # Architectural constraints
   # Style rules not enforced by tooling
   # Pointers to key files
   # What not to touch
   ```

   Rules:
   - Target under 200 lines total
   - Every line must prevent a specific agent mistake
   - Use concrete, verifiable instructions
   - Do not duplicate linter/formatter rules
   - Do not include domain knowledge the agent can read from files

5. **Consider progressive disclosure.** If instructions exceed 200
   lines:
   - Move directory-specific rules to subdirectory CLAUDE.md files
   - Move path-scoped rules to `.claude/rules/` with `paths` frontmatter
   - Move referenced documents behind `@path` imports

6. **Consider CLAUDE.local.md.** Personal preferences (editor
   settings, sandbox URLs, preferred test data) belong in
   CLAUDE.local.md, not the shared CLAUDE.md.

7. **Verify.** After writing, check:
   - Is every instruction concrete enough to verify?
   - Are build/test commands accurate and current?
   - Does anything duplicate existing tooling?
   - Is it under 200 lines?

8. **Report** the path written and a summary of what the file covers.
