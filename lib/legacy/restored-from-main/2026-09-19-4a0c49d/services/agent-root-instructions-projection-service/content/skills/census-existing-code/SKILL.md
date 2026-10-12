---
name: census-existing-code
description: Find the real, canonical tool or capability for a task before improvising manual work (grep, ad hoc bash, hand-written analysis). Load before searching the tree by hand for code, a duplication check, a publish/pin state, or a capability query — the answer is almost always a real command, not a `find`.
---

# Census existing code

A session that improvises manual archaeology (grep, `find`, hand-rolled
npm/git triage) for something a real instrument already does is not being
careful — it is the failure this skill exists to catch. Every hour spent
manually rediscovering a tool this tree already has is an hour not spent on
the actual work, and it is how the tree accumulated the duplication this
skill helps remove.

## Check in this order, before writing a single grep

1. **Your own office's duty→skill graph.** Read your seated office record
   (`content/offices/<office-id>.json` under the owning
   `enterprise-*-services-section`). Its `bears-duty` names duties; each duty
   record's `skills` array names the skill that discharges it. If the named
   skill is unseated (a stub directory, or absent from `.claude/skills/`),
   that is itself the finding — author it here, at its authored source, not
   in a session transcript.
2. **The code/duplication graph.** `jsnode-server` (systemd user service,
   `http://127.0.0.1:18808/`) backs `jsnode-engineering-cli`
   (`javascript-node-services-section/services/jsnode-engineering-services-section/apps/jsnode-engineering-cli`,
   `dist/cli.mjs`): `workspace`, `search`, `describe`, `consumers`, `uses`,
   `duplication` (real semantic-fingerprint AST analysis, not a keyword
   match), `duplication-migration` (single-candidate `--fingerprint`
   plan/apply; `--batch` and any bulk `--apply` mutate many files at once and
   are refused by this harness's own destructive-action classifier — plan in
   batch, apply one fingerprint at a time). Check `jsnode-server.service` is
   actually healthy (`curl --fail http://127.0.0.1:18808/healthz`) before
   trusting a hook that reports it unavailable; a stale per-session MCP
   connection from a crash window does not mean the service is down.
3. **Publish/pin state.** `npm-workspace-publication-service`
   (`javascript-node-services-section/.../npm-workspace-publication-service`):
   `publish-package.mjs` for one package, `prepare-release-wave.mjs` +
   `publish-workspace-tiers.mjs` for a whole-workspace leaf-first sweep. A
   package whose local source is ahead of its published registry version is
   the single most common cause of "this bug was already fixed" reports that
   don't stick — check `npm view <pkg> version` against the local
   `package.json` before assuming a fix landed.
4. **The operator handbook** (`find-operator-guides` skill) for registry,
   GCP, GitHub Actions, OAuth, and durable-state operations specifically.

Only fall back to `rg`/`fd` (never unscoped `find` or `git grep` — see
`working-discipline.md`'s repository-scale rules) when none of the above
resolves the question, and record what you searched so the next session
does not repeat the same walk.

## Do not trust what you find without checking it

A package's own description, README, or `unrealized` disclaimer is a claim
about itself, not evidence. Verify against real generated behavior — actual
imports (`consumers`/`uses`), actual test results, actual `/healthz` output
— never against what a comment says it does. When a claim looks
"intentional" or "by design," that is a thing to check, not a reason to
stop checking (owner-ruled 2026-09-11, after a session accepted a package's
own "owns no aggregate runtime" framing and skipped a real duplication
candidate it named).

## Ground a schema or theory-bearing change in theory, not in drift

Before changing any `emsenn/schema/*` record (or any canonical record
carrying a `$id` naming a theoretical concept), locate and read that
concept's live science-custody glossary term (the science section's
`content/text/glossary/terms/`, never `lib/legacy/` or `_archive/`) and cite
it in the change. That two or more on-disk instances already agree on a
shape is a finding about those instances — evidence they may share the same
drift — never itself a license to move the canonical schema to match them
(owner-ruled 2026-09-11, after a session added an untheorized field to
`emsenn/schema/character` on exactly that basis, twice in the same category
as an earlier uninstructed `correlative` addition to `emsenn/schema/duty`
that the schema's own theory states is derived, never authored).
