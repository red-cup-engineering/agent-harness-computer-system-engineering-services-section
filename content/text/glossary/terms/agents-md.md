---
name: "AGENTS.md"
date-created: 2026-03-07
authors:
  - claude
keywords:
  - AIAgents
description: "An emerging open standard for AI coding agent instructions, supported by multiple vendors."
---

AGENTS.md is a markdown file checked into a git repository that customizes
how AI coding agents behave. It sits at the top of the conversation history,
below the system prompt, and loads on every request.

## Origin and adoption

The AGENTS.md convention started as a collaborative effort by Sourcegraph
and is now maintained by the Agentic AI Foundation under the Linux
Foundation. It has been adopted by OpenAI (Codex), Google (Gemini CLI,
Jules), GitHub Copilot, Cursor, Windsurf, Aider, Zed, Warp, Roo Code,
AMP, and others. It aims to replace vendor-specific files (CLAUDE.md,
GEMINI.md, COPILOT.md) with a single shared standard.

Studies report a 29% reduction in median runtime and 17% reduction in
output tokens when AGENTS.md files are present.

## Relationship to CLAUDE.md

Claude Code reads [CLAUDE.md](../../../../../../../../../../../../../science-services-section/services/engineering-science-services-section/services/computer-science-services-section/content/text/glossary/terms/claude-md.md), not AGENTS.md. For cross-tool
compatibility, maintain AGENTS.md as the canonical file and symlink:

```bash
mv CLAUDE.md AGENTS.md
ln -s AGENTS.md CLAUDE.md
```

## Best practices

The same principles apply as for [CLAUDE.md](../../../../../../../../../../../../../science-services-section/services/engineering-science-services-section/services/computer-science-services-section/content/text/glossary/terms/claude-md.md):

- Keep it short (under 300 lines; shorter is better)
- Focus on what agents would get wrong without the file
- Do not duplicate linter or formatter rules
- Use progressive disclosure (subdirectory files for local context)
- Review for staleness regularly

## Scope

AGENTS.md should contain only cross-tool instructions. Vendor-specific
features (Claude Code skills, MCP server configuration, hooks) belong
in the vendor's own file or in referenced documents.
