---
name: loading the character memory
description: Mirrors the in-repo character memory into the auto-memory location and regenerates the auto-memory MEMORY.md index.
specializing: character-memory
closure-position: process
operation-kind: mutation
hooks:
  - event: SessionStart
    command: node library/object/library/thing/library/system/library/agentic-systems/library/character/library/character-memory/doing/working/loading-the-character-memory/scripts/load-the-character-memory.mjs
    description: Populates the auto-memory location from the in-repo memory at session start.
---

Body in [`SKILL.md`](SKILL.md).

Runs as a Claude Code SessionStart hook.
The companion skill [`routing-a-memory-write`](../routing-a-memory-write/SKILL.md) handles the write side (blocks writes to the auto-memory location at PreToolUse).
