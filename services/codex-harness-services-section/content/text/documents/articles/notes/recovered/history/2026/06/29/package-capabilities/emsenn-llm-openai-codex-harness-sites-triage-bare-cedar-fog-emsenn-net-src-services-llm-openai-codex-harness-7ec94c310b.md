---
title: "Capability note: @emsenn/llm-openai-codex-harness"
date: 2026-06-29
source-package: "sites/triage.bare-cedar-fog.emsenn.net/src/services/llm-openai-codex-harness"
---

# Capability note: @emsenn/llm-openai-codex-harness

- Package path: `sites/triage.bare-cedar-fog.emsenn.net/src/services/llm-openai-codex-harness`
- Package kind: `src-service`
- Declared workspace entries: none found in the scanned workspace declarations
- Description: LLM-OpenAI-Codex harness server — the 561 Group Operations Manifold MCP hub for the Codex CLI. Can run standalone on :18806/hub/mcp, while canonical Codex config points at 561 Group Operations Manifold's mounted /codex/hub/mcp endpoint for config wiring, process supervision, and package-bin transport tools.
- Capability tags from manifest/source hints: `service`, `cli`, `agent-harness`, `workspace-analysis`
- Bins: `llm-openai-codex-harness-server`
- Export subpaths: `.`, `./service`, `./process`, `./cli`, `./package.json`
- Scripts: `clean`, `check`, `build`, `prepack`, `rebuild`
- Dependencies: `@emsenn/organizing-with-openai-codex`, `@emsenn/http-server`, `@emsenn/relating`

## Local Evidence

- No nearby README/AGENTS/CLAUDE paragraph was found by the measurement script.
- Source hints: `src/cli.mts`, `src/index.mts`, `src/process.mts`, `src/service.mts`

## Relation To Infography Baseline

- Direct surface overlap with `@emsenn/infography`: `.`, `./package.json`
- Capability classes not directly realized by infography's exported package surface: `agent-harness`

This note is generated from manifest, nearby prose, and source-path evidence.
It should be checked against opened source before making migration or deletion decisions.
