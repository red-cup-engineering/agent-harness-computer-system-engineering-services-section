---
name: seat-jsnode-claude-plugin
description: Add a Claude Code plugin face to an existing house jsnode package for outside installers, on top of its normal section seating, without letting the plugin format replace house custody.
---

# Seating a jsnode package as a Claude Code plugin

A jsnode package can be BOTH a normal house package (seated by custody,
published to `registry.561.group`, tested via `node --test` — see
`seat-reusable-jsnode-package` and `release-jsnode-npm-package`) AND an
installable Claude Code plugin — Anthropic's plugin spec, a directory
`--plugin-dir` can point at, or a marketplace lists, for an outside
Claude Code user with zero house context. The two shapes coexist at the
same package root; the plugin format is an additional distribution face,
never a substitute for house seating.

**Layout — both shapes at the package root, siblings, nothing nested
under the other:**

```
<section>/<package-name>/
├── package.json            # house: name, scope, deps, test script
├── .claude-plugin/
│   └── plugin.json         # plugin manifest — ONLY file in this dir
├── skills/<name>/SKILL.md  # plugin skills (Anthropic's shape: a
│                            # Markdown routing file — not a jsnode
│                            # scripts/ operation)
├── hooks/hooks.json        # plugin hooks, if any
├── .mcp.json                # plugin MCP server config, if any
├── src/                     # house: domain semantics skills/hooks call
├── scripts/                 # house: one operation per effect, if any
├── *.test.mjs                # house: node --test
├── README.md                 # for the outside installer, zero house
│                              # context, no house vocabulary/scopes
└── LICENSE                   # Apache-2.0 text
```

`.claude-plugin/` holds only `plugin.json` — never `skills/`, `hooks/`,
or `commands/` inside it (the documented common mistake). Plugin
component directories sit at the package root as siblings of
`src/`/`scripts/`/`apps/`, never nested under them.

**Minimum `plugin.json`** (`name` is the only required field):

```json
{
  "name": "<kebab-case-plugin-name>",
  "description": "<one line, shown in the plugin manager>",
  "version": "<semver>",
  "author": { "name": "..." },
  "license": "Apache-2.0"
}
```

The plugin's `name` is a separate, unscoped kebab-case identifier used
only inside Claude Code's own namespace (`/plugin-name:skill-name`) — it
is not the npm package name and does not take a house scope. Add
`homepage`/`repository`/`keywords` for a real release. Only declare the
`skills`/`hooks`/`mcpServers` path fields in `plugin.json` if components
live outside the defaults (`skills/`, `hooks/hooks.json`, `.mcp.json`);
otherwise omit them.

**House law still applies in full:** the package still seats under the
section owning the concept and takes that section's scope; still
publishes to `registry.561.group` if anything in-tree is meant to
depend on it; still tests with plain `node --test`; any `src`/`scripts`
code the skills or hooks call into still follows section-shape and
import-stratification. The plugin manifest does not relax any of that.

**External distribution:** an outside user has no `registry.561.group`
access, so ship the plugin directory itself — a `.zip`, or a path in a
public git repo — as the plugin `source`; never expect `npm install` of
a house-scoped package. A `.claude-plugin/marketplace.json` (top-level
`name`/`owner`, plus a `plugins` array of `{"name", "source",
"description", ...}` entries) is a separate file, sits one level above
individual plugin directories when a repo hosts several plugins, and is
out of scope for seating a single plugin package.

**Verify before calling it done:** `claude plugin validate <path>` if the
`claude` CLI is available; by hand otherwise — `name` is kebab-case with
no spaces, `.claude-plugin/` contains only `plugin.json`, every path
field in `plugin.json` starts with `./`, and each `skills/*/SKILL.md` has
YAML frontmatter with a `description`.

Source: `docs.claude.com/en/docs/claude-code/plugins-reference` (redirects
to `code.claude.com/docs/en/plugins-reference`) and
`code.claude.com/docs/en/plugins`, fetched 2026-08-31.
