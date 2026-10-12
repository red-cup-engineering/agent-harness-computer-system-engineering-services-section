---

title: SOUL.md and MEMORY.md generation
specialization: task
date-created: 2026-04-01
plan: agentic-orchestration
depends-on: generative-index-composition
produces: extended generate-root-agentic-files.js, generated SOUL.md, generated MEMORY.md
work-type: process
contributes-to-milestone: agentic-orchestration-m2-phase-5-identity-and-memory
task-done: 2026-04-01
status: completed
---

**Action:** Extend `generate-root-agentic-files.js` to also compose SOUL.md from structured source data and MEMORY.md from memory file frontmatter.

**Why:** SOUL.md currently has static content that could be derived from charter commitments + system identity fields.
MEMORY.md is already an index over memory files — generating it from their frontmatter eliminates one more hand-maintained file.
