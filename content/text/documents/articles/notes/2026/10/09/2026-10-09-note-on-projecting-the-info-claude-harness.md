---
title: Note on projecting the info Claude harness
date-created: 2026-10-09
tags:
- agent-harness
- claude-code-harness
- projection
- office
- obstruction
---

Recorded by the Bare Cedar Fog Claude character (given name Hai Jian) as senior-engineer, realizing the Leader's instruction of 2026-10-09 to project /home/emsenn/info's Claude harness from the agency records with the Group's own projector. Result: **the projection was read, not written.** The deployed projector cannot yield the harness the 2026-07-28 law and the 2026-10-06 founder decision call for, and the aligned fix is a redeployment, not a patch. `/home/emsenn/info/.claude` is unchanged (still only `settings.local.json`); there is still no `CLAUDE.md` and no agents.

## What ran

- Instrument (new, read-only unless `--write` is passed): `services/claude-code-harness-services-section/scripts/project-info-claude-harness.mjs` in this section. It imports a projector by absolute file URL, builds the deny list as the union of the node's existing `permissions.deny` and the module's `SHARED_CHECKOUT_DENY` (28 entries: 17 existing, 11 module), calls `projectClaudeHarness({node, agencyRoot, settlementRoot, mcpServers:{}, deny})`, prints the files map, counts, obstructions and `checkClaudeHarness`, and only with `--write` calls `writeClaudeHarness`.
- Arguments: node `/home/emsenn/info`; agencyRoot `/home/emsenn/info/lib`; settlementRoot `METROPLAT_DATA_ROOT` from `/home/emsenn/.config/561-group/bare-cedar-fog.561.group.env`, which is `/home/emsenn/info/lib/emsenn/services/561-group/services/561-group-services-section` (the unit's Environment holds only PATH and NODE_OPTIONS; the other variables come from the two EnvironmentFiles; no secret value was printed). An empty `METROPLAT_DATA_ROOT` in the shell first made the instrument default to its own directory; that reading was discarded and rerun with the explicit path.
- Paired writer: `writeClaudeHarness(projection)` (claude-harness-projection.mjs:157). It writes the files map, `env`, `hooks` and `permissions.deny` into `settings.local.json` while spreading the existing settings first (so `disabledMcpjsonServers ["metroplat"]` survives), rewrites `.mcp.json` to exactly the given servers (none here), and records `.claude/.claude-harness-manifest`. `checkClaudeHarness` is its read-only pair.
- Projector read first: the deployed one, `/gnu/store/gdbrmhcrl3pfnngmcbmp4fii2gp57pcr-bare-cedar-fog-deployment-1/app/node_modules/@red-cup-engineering/agent-harness-computer-system-engineering-services-section/services/claude-code-harness-services-section/src/claude-harness-projection.mjs`, by file URL. It imports and runs.

## What the deployed projector yields (the reading)

Counts: 100 skills, 33 agents, 0 hooks, 0 MCP servers, `standing: false`, 2 budget env keys, 28 deny. The check against the node reports drift (all files absent).

1. **It is not the projector the Group source describes.** The deployed file differs from the Group file (`claude-harness-projection.mjs`, last changed in the 2026-10-08 commit b006be709b8). The deployed one projects *every* agency skill into `.claude/skills/` (the registry the Group header says "put tarot and Hive games in every session's context and the ecosystem in none (founder, 2026-10-06)"), has the hook machinery the Group removed on 2026-10-06, and has no `heldOffices` and no ecosystem note. The Group one adds both and projects no skills.
2. **No session CLAUDE.md.** In the deployed projector `.claude/CLAUDE.md` is written only when `standing` is a non-empty string. The node supplies none, so the session would hold none of its character's offices. That is the thing the task was for, so writing the deployed reading would leave the goal unmet while putting 100 skills into every session.
3. **Agents it would project (33), including the two this character holds:** senior-engineer and senior-scientist, plus chief-engineering-officer, chief-technology-officer, chief-operations-officer, chief-executive-officer, chief-mathematician, chief-computation-theorist, chief-sociologist, mathematical-library-steward, obsmetrologia-consultant, institutional-contract-lead, consulting-engagement-lead, trusted-assistant-to-the-leader, executive-assistant-to-the-board-of-directors, anti-gremlin, binding-generations-owner, binding-generations-website, and 15 koios editor/desk offices. The senior-engineer file is well formed: office text, position, deontic profile, duties with discharging skills, and skills named by reference with their record paths.
4. **Obstructions (deployed reading, 25 of them):** seven skill records with no `description` (serve-quantitative-researcher, serve-content-resource-officer, serve-personal-services-team-lead, and the Causeway media, economic and computer team leads and the Turntide community team lead); two copies of `managing-project-corpus-knowledge` (one under koios vendor/runtime, one in corpus-management-service), only the first seated; `found-a-section-through-the-founding-operator-rather-than-by-hand` rejected as an id the harness does not accept as a skill name (too long); fifteen koios offices seated at dignitas in two sections (the koios `history/source` copy and a live copy), each reported as a duplicate id.

## Reading with the Group source (diagnostic only, never written)

To see what the aligned projection would be, the same instrument was pointed at the Group `claude-harness-projection.mjs` (imports resolve to the packages the checkout can reach). It yields `standing: true`, 0 skills, and a 9,895-byte `.claude/CLAUDE.md` (ecosystem note plus held offices), but only 3 agents, and 47 obstructions, all `Cannot read properties of undefined (reading 'kind')`, including both of this character's offices (senior-engineer and senior-scientist) in `heldOffices`. Cause: the Group `install-claude-as-an-agent.mjs:139` reads `officeReading(agencyOf(), office.key).effective`, and the `organizing` package that import resolves to returns a reading with no `.effective`. The Group and deployed installers also disagree: the Group one inlines every skill in full; the deployed one names skills by reference (`skillSummary`), the pattern the 2026-10-06 decision wants. I did not diagnose which `organizing` copy was resolved or which side is newer; that is open.

## Obstruction and aligned fix

- Obstruction: the projector that runs (deployed) predates the Group source; the Group source cannot run against the `organizing` it resolves; the installers have diverged. Writing now would need a code change or a hand-made CLAUDE.md, both ruled out.
- Aligned fix, for the Chief Engineering Officer / deployment owner: (a) reconcile the Group `install-claude-as-an-agent.mjs` with the deployed one (skills named by reference, effective office reading) and make `organizing` expose the reading it expects; (b) redeploy Bare Cedar Fog so the deployed projector is the Group one; (c) rerun `scripts/project-info-claude-harness.mjs --projector <deployed file> --settlement-root <METROPLAT_DATA_ROOT>` as a reading, expect `agents` to include senior-engineer and senior-scientist, `skills` absent, `standing: true`, then add `--write`. The instrument already preserves `disabledMcpjsonServers` and all 17 existing deny entries.

## Records too thin to project useful context

- `science-services-section` skill `research` (`lib/agency/skills/research.md`): it is a role description ("An agent role that investigates topics..."), not a procedure, and is the only skill of the duty `realizing-allocated-science-work`. A senior-scientist agent would hold a definition of researching and no method, scripts or receiving steps.
- `engineering-services-section/lib/agency/skills/receive-independent-engineering-evidence.json`: its method sits in `body` (4.6 KB record), but the projector carries JSON skills by `description` only, so a senior-engineer agent sees a one-line description and a path. Either the projector should read `body` or the record should be a SKILL.md.
- The seven description-less skill records listed above: unselectable and unprojectable until they state what they do.
- Fifteen koios offices: duplicated in two sections, so none can be projected until one seat is retired.
- Duties and incumbency records themselves are sufficient for senior-engineer (`realizing-allocated-engineering-work` carries from, to, cost, otherwise, receiver-condition) and for the incumbency (`recognition t`, `induction t`, from 2026-10-02). The rules are not projected by design: the session's entry reads the 29 rules live from the rule store.

## Open questions

- Which `organizing` copy does the Group source resolve, and is the deployed installer or the Group installer the intended one?
- Does the Leader want the 15 koios offices and the other-section chief and lead offices in this session's roster, or a roster bounded to the offices this character holds and presides over (the carrier's rule in the README)? The projector as written emits every office seated at dignitas that holds skills.
