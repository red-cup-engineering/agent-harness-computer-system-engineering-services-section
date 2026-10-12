---
name: character memory
description: The character's accumulated memory across sessions, stored in the repo at prose/journals/memory and mirrored to the auto-memory location at session start.
---

A character's memory is a set of memory files that persist across Claude sessions.
Each memory file has a type (one of `feedback`, `reference`, `user`, `project`) and a slug; together they identify the memory.

The memory lives in two places, kept consistent by hooks:

- **In-repo (authoritative):** `<repo>/prose/journals/memory/<type>/<slug>.md`.
  Subject to the resource-file rules.
  Tracked in git.
- **Auto-memory (mirror):** `~/.claude/projects/<project-id>/memory/<type>_<slug>.md`.
  What Claude Code's built-in memory system reads at session start.
  Populated from the in-repo location by [`loading-the-character-memory`](../../library/object/library/thing/library/system/library/agentic-systems/library/character/library/character-memory/doing/working/loading-the-character-memory/SKILL.md) on each SessionStart event.

Writes to the auto-memory location are intercepted by [`routing-a-memory-write`](../../library/object/library/thing/library/system/library/operating-system/library/claude-code/library/auto-memory/library/memory-write/doing/working/routing-a-memory-write/SKILL.md) and redirected to the in-repo location.

The auto-memory location also carries a `MEMORY.md` index file, regenerated from the in-repo state by `loading-the-character-memory`.
The index points at the per-memory files for the auto-memory system to dereference.
