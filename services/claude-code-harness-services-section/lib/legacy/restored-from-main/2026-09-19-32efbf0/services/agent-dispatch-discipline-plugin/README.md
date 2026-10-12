# Agent Dispatch Discipline

A [Claude Code](https://claude.com/claude-code) plugin for people who run
more than one subagent at a time. It bundles:

- **A skill** (`skills/dispatch-agent-discipline/SKILL.md`) that Claude
  loads before dispatching a subagent — a compact set of rules for writing
  complete briefs, steering agents mid-flight, receiving reports without
  accepting unverified claims, and recovering from an interrupted
  commission without redoing finished work.
- **A hook** that runs before every `Task` (subagent dispatch) tool call
  and flags obvious brief gaps — no prompt text, a suspiciously short
  prompt, or a brief that never says what "done" looks like — as
  non-blocking context for Claude. It never denies a dispatch; it just
  gives you (and Claude) a second look before the agent goes off with too
  little to work with.

Nothing here is a framework. There's no agent registry, no orchestration
DSL, no new tool. It's the discipline your dispatches were probably
already missing, written down so Claude follows it automatically.

## Why this exists

Every rule in the skill traces back to a real failure: an agent redoing
work because a report was accepted without verbatim evidence, two agents
silently overwriting each other's edits because their scopes overlapped,
a "done" claimed before it was actually true on disk. None of it is
theoretical advice — it's what broke, written as the rule that would have
prevented it.

## Install

```
/plugin marketplace add <owner>/<repo>
/plugin install agent-dispatch-discipline
```

(Replace `<owner>/<repo>` with wherever this plugin's marketplace listing
ends up — see the maintainer's own distribution notes if you got this
from a git checkout instead of a marketplace.)

## What the hook actually checks

The lint is intentionally dumb — pattern matching, not judgment. It has
exactly three checks, all on the `Task` tool's `prompt` field:

1. Is there a prompt at all?
2. Is the prompt suspiciously short (under 25 words)?
3. Does the prompt contain any word that signals a completion check
   (`report`, `deliver`, `verify`, `acceptance`, `done`, and a few
   others)?

A clean result doesn't mean the brief is good. A warning doesn't mean the
brief is bad. It's a nudge, not a gate — the hook never sets
`permissionDecision: "deny"`; it only ever adds `additionalContext`.

## Repository layout

```
.claude-plugin/plugin.json   # plugin manifest
skills/dispatch-agent-discipline/SKILL.md
hooks/hooks.json             # registers the PreToolUse hook
scripts/lint-agent-brief.mjs # hook entrypoint (stdin/stdout JSON)
src/brief-lint.mjs           # the pure lint function, unit-tested
test/                        # node --test suite (10 tests, unit + script)
```

## Development

```
npm test    # node --test test/*.test.mjs
npm run check   # node --check on every source file
npm run check && npm test && npm pack --dry-run  # check + test + npm pack --dry-run
```

No runtime dependencies. Node 22+.

## License

Apache-2.0 — see [LICENSE](./LICENSE).
