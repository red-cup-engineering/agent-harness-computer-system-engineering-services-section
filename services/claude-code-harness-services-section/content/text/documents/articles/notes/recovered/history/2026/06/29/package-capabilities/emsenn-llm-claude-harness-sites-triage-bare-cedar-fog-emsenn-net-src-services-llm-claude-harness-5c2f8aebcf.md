---
title: "Capability note: @emsenn/llm-claude-harness"
date: 2026-06-29
source-package: "sites/triage.bare-cedar-fog.emsenn.net/src/services/llm-claude-harness"
---

# Capability note: @emsenn/llm-claude-harness

- Package path: `sites/triage.bare-cedar-fog.emsenn.net/src/services/llm-claude-harness`
- Package kind: `src-service`
- Declared workspace entries: none found in the scanned workspace declarations
- Description: LLM-Claude harness server — the 561 Group Operations Manifold MCP hub that Claude Code CLI wires into. Listens on :18805/hub/mcp (default), providing a loopback-trusted MCP endpoint that Claude Code can discover via .mcp.json. Hooks, tools, and skills rigged into this hub are available to any Claude Code CLI process pointed at it.
- Capability tags from manifest/source hints: `service`, `cli`, `agent-harness`, `workspace-analysis`
- Bins: `llm-claude-harness-server`
- Export subpaths: `.`, `./service`, `./cli`, `./package.json`
- Scripts: `clean`, `check`, `build`, `prepack`, `rebuild`
- Dependencies: `@emsenn/organizing-with-claude`, `@emsenn/http-server`

## Local Evidence

- No nearby README/AGENTS/CLAUDE paragraph was found by the measurement script.
- Source hints: `src/cli.mts`, `src/index.mts`, `src/service.mts`

## Relation To Infography Baseline

- Direct surface overlap with `@emsenn/infography`: `.`, `./package.json`
- Capability classes not directly realized by infography's exported package surface: `agent-harness`

This note is generated from manifest, nearby prose, and source-path evidence.
It should be checked against opened source before making migration or deletion decisions.
