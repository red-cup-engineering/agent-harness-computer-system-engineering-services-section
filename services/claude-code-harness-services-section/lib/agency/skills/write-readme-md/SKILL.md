---
description: Write or improve a README.md file for a project or directory. Use when setting up project documentation or auditing an existing README.
id: write-readme-md
name: write-readme-md
version:
  - 0
  - 1
kind: operational
runtime: inference
triggers:
  - write readme
  - create readme
  - improve readme
  - set up project documentation
inputs:
  target_dir: string?
outputs:
  path: string
region:
  reads:
    - content/technology/disciplines/computing/software/claude-code/
  writes: []
dependencies: []
part-of: technology/disciplines/computing/software/claude-code/specifications/readme-md-specification
requires-capabilities: []

---
Write or improve a README.md file: $ARGUMENTS

## Instructions

1. **Locate the target directory.** If `target_dir` is given, use it.
   Otherwise use the current working directory.

2. **Read existing README.md.** If one exists, note what it covers
   and check for:
   - Stale instructions (commands that no longer work)
   - Missing install or usage sections
   - Excessive length (over 200 lines for most projects)
   - Duplicated AGENTS.md content

3. **Discover project context.** Read:
   - `package.json`, `Makefile`, `Cargo.toml`, or equivalent for
     project name and description
   - Existing AGENTS.md and CLAUDE.md to avoid duplicating their
     content
   - License file
   - CONTRIBUTING.md if present

4. **Draft the README.md.** Follow the
   [README.md specification](../../../../index.md) and the
   [writing curriculum](../../../../curricula/writing-readme-md.md).
   Use Standard README section order:

   1. Title
   2. Short description (under 120 characters)
   3. Table of Contents (if over 100 lines)
   4. Install
   5. Usage
   6. Contributing
   7. License

   Add Background, Security, or API sections only if needed.

5. **Target audience.** README.md is for humans, not agents. Write
   for a developer encountering the project for the first time. Do
   not include agent-specific conventions — those belong in AGENTS.md.

6. **Verify.** After writing, check:
   - Can someone install the project using only these instructions?
   - Is every command accurate and current?
   - Is the README under 200 lines?
   - Does it avoid duplicating AGENTS.md or CLAUDE.md?

7. **Report** the path written and a summary of what the file covers.
