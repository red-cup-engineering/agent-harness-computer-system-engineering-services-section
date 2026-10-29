---
description: Write or improve an AGENTS.md file for a project. Use when setting up cross-tool AI agent instructions or migrating from vendor-specific files.
id: write-agents-md
name: write-agents-md
version:
  - 0
  - 1
kind: operational
runtime: inference
triggers:
  - write agents md
  - create agents md
  - improve agents md
  - set up agent instructions
inputs:
  project_root: string?
outputs:
  path: string
region:
  reads:
    - content/technology/disciplines/computing/software/claude-code/
  writes: []
dependencies: []
part-of: technology/disciplines/computing/software/claude-code/specifications/agents-md-specification
requires-capabilities: []

---
Write or improve an AGENTS.md file: $ARGUMENTS

## Instructions

1. **Locate the project root.** If `project_root` is given, use it.
   Otherwise use the current working directory.

2. **Check for existing instruction files.** Look for:
   - `AGENTS.md` — existing cross-tool instructions
   - `CLAUDE.md` — Claude Code instructions (candidate for migration)
   - `.cursorrules` — Cursor instructions (candidate for migration)
   - Other vendor-specific files

   If migrating from vendor-specific files, extract only the
   tool-agnostic instructions. Leave vendor-specific features in
   their own files.

3. **Discover project conventions.** Read:
   - Build system files (`package.json`, `Makefile`, `Cargo.toml`,
     `pyproject.toml`, etc.) for build/test/lint commands
   - Linter and formatter configs to know what NOT to duplicate
   - Directory structure to identify architectural patterns
   - README.md for project context

4. **Draft the AGENTS.md.** Follow the
   [AGENTS.md specification](../../../../index.md) and the
   [writing curriculum](../../../../curricula/writing-agents-md.md).
   Structure:

   ```markdown
   ## Build and test
   ## Code style
   ## Architecture
   ## Testing
   ## Security considerations (if applicable)
   ## Commit and PR conventions
   ```

   Rules:
   - Target under 300 lines (shorter is better)
   - Use only standard markdown — no special syntax
   - Include only cross-tool instructions
   - Do not include vendor-specific features (Claude skills, MCP
     config, editor plugins)
   - Do not duplicate README.md content
   - Do not duplicate linter/formatter rules
   - Every line must prevent an agent mistake

5. **Handle monorepos.** For monorepos, consider nested AGENTS.md
   files at each subproject root. The nearest file to the edited file
   takes precedence. Keep each file focused on its subproject.

6. **Set up symlinks.** If the project also uses Claude Code, suggest
   symlinking:

   ```bash
   ln -s AGENTS.md CLAUDE.md
   ```

   Note that this means Claude-specific features (`.claude/rules/`,
   `@path` imports) will not be available. If those are needed,
   maintain separate files.

7. **Verify.** After writing, check:
   - Does every instruction work across multiple AI coding tools?
   - Are build/test commands accurate and current?
   - Is the file free of vendor-specific features?
   - Is it under 300 lines?

8. **Report** the path written and a summary of what the file covers.
