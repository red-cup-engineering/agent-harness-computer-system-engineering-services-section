---
name: character-memory
description: The character's accumulated memory across sessions, stored in the repo at prose/journals/memory/ and mirrored to the auto-memory location at session start.
specializing: character
persistence: across-sessions
authoritative-location: prose/journals/memory/
---

A **character-memory** is the set of memory files that persist a character's accumulated context across Claude sessions.
Each memory file has a *type* (one of `feedback`, `reference`, `user`, `project`) and a *slug*; together they identify the memory.

The memory lives in two places, kept consistent by hooks:

- **In-repo (authoritative):** `<repo>/prose/journals/memory/<type>/<slug>.md`.
  Subject to the resource-file rules.
  Tracked in git.
- **Auto-memory (mirror):** `~/.claude/projects/<project-id>/memory/<type>_<slug>.md`.
  What Claude Code's built-in memory system reads at session start.
  Populated from the in-repo location by the loading-the-character-memory skill on each SessionStart event.

Writes to the auto-memory location are intercepted by the routing-a-memory-write skill and redirected to the in-repo location.
The auto-memory location also carries a `MEMORY.md` index file regenerated from the in-repo state by loading-the-character-memory.

## Distinguishing predication-shape

- `belongs-to(character-memory, character)` — the character whose memory this is.
- `has-type(character-memory, {feedback | reference | user | project})` — the memory type per CLAUDE.md's auto-memory convention.
- `has-slug(character-memory, slug)` — the unique-within-type identifier.
- `authoritative-at(character-memory, in-repo-path)` — the canonical location under prose/journals/memory/.
- `mirrored-to(character-memory, auto-memory-path)` — the auto-memory mirror.

## Not synonymous with

- **Diary-entry** — a diary-entry is a single timestamped row in a per-day log; character-memory is a curated, typed file persisted indefinitely.
  Diary captures what happened; memory captures what should be remembered going forward.
- **Heartbeat** — heartbeat is a short standing-orientation checklist; memory is the broader corpus of typed facts and guidance.
