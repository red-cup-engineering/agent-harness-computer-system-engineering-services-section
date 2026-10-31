---
title: Note on the info Claude harness projection, read and written
date-created: 2026-10-09
tags:
- agent-harness
- claude-code-harness
- projection
- office
- organizing
---

Recorded by the Bare Cedar Fog Claude character (given name Hai Jian) as senior-engineer, under the duty `realizing-allocated-engineering-work` and the skill `realize-research-grounded-engineering-work`. It continues `2026-10-09-note-on-projecting-the-info-claude-harness.md` in this directory, whose deployed-projector reading it leaves standing and whose open questions it answers.

Paths are relative to `/home/emsenn/info/lib/emsenn/services/561-group/services/`. `HARNESS` is `engineering-services-section/services/computer-engineering-services-section/services/computer-systems-engineering-services-section/services/agent-computer-system-engineering-services-section/services/agent-harness-computer-system-engineering-services-section`. `CSS` is `red-cup-engineering/computer-services-section`.

## What the Group holds

1. The canonical source of the harness section and of organizing is `CSS`, at `services/agent-harness-computer-system-engineering-services-section/services/claude-code-harness-services-section` and `services/organizing`. The Group copy of organizing (`engineering-services-section/.../agent-organization-engine/lib/organizing`) is older: it has no `forms.mjs`, and its `officeReading` returns no `effective`. The Group copy of the installer (`install-claude-as-an-agent.mjs`) inlines every skill in full; the `CSS` main one names skills by reference (`skillSummary`), which is the pattern the founder's decision of 2026-10-06 calls for. The Group is behind `CSS` main in both, so the question the first note left open, which installer is intended, is answered: the one on `CSS` main.
2. The Group projector fails with "Cannot read properties of undefined (reading 'kind')" because the installer reads `officeReading(agencyOf(), office.key).effective` (`install-claude-as-an-agent.mjs:139` in the fetched `CSS` main file) and the registry sets `effective` only on a record formed from an agency form (`organizing/src/agency/index.mjs:330`). `CSS` main already exposes `effective` from `officeReading`, but as `office.effective`, which is undefined for every office that is not formed. All of the Group's offices are authored directly. The `organizing` the projector resolves is therefore correct in shape and wrong in value, on `CSS` main as well as in the Group.
3. An office that is not formed is effective as its authored record. `officeReading` already says so for an office's relationships (`office.effective ?? office.authored`) and `organizing` says so for a duty (`duty.effective ?? duty.authored`).
4. A vendored copy of a package is not agency. koios-news carries `vendor/runtime`, which holds two copies of the corpus-management records. The registry read them, so `managing-project-corpus-knowledge`, `content-librarian` and `corpus-service-operator` were each seated three times.
5. An agent is named by its office id, and two offices of one id in different sections are two offices. Blockchain Trashpanda's `chief-executive-officer` (a Rendanheyi micro-enterprise's office, founded 2026-07-22) and the 561 Group's `chief-executive-officer`, which Hai Xudi holds (the Leader, 2026-10-09: "Hai Xudi is the CEO"; incumbency `561-group-services-section/lib/agency/incumbencies/hai-xudi-as-chief-executive-officer.json`), share an id. Projecting whichever came first dispatches the wrong enterprise's office; the order was a map's.
6. Blockchain Trashpanda's office id cannot be changed by editing its record. Its founding verifier and receipt admitter name `lib/agency/offices/chief-executive-officer.json` and `lib/agency/incumbencies/chief-executive-officer-yanagi-chief-executive.json` by path (`blockchain-trashpanda-services-section/src/verify-enterprise-goal.mjs:54-55`, `src/admit-formation-receipt.mjs:19-20`), and its production manifest carries the path.

## What was changed

- `CSS` pull request 137, `organizing/office-reading-effective-for-unformed-offices`: `officeReading` returns `effective: office.effective ?? office.authored` (`index.mjs:660`), and the agency walk does not enter `vendor` (`index.mjs:43`). Two tests: `test/agency/office-reading-effective.test.mjs` and `test/agency/agency-copies-are-not-records.test.mjs`. Both pass against the fetched files. Receiver: chief-engineering-officer.
- `CSS` pull request 141, `harness/projection-refuses-ambiguous-office-ids`: the projection refuses every office of an id seated at dignitas in several sections and names all the sections, instead of projecting the first. Test: `HARNESS/test/claude-harness-projection.test.mjs` in the pull request. Receiver: chief-engineering-officer.
- Seven skill records state a `description` taken from their own `method`: `serve-quantitative-researcher` (finance-science), `serve-causeway-media-services-team-lead`, `serve-causeway-economic-services-team-lead`, `serve-causeway-computer-services-team-lead`, `serve-turntide-community-services-team-lead`, `serve-personal-services-team-lead` and `serve-content-resource-officer`. Each record's `x-provenance` names who added the description and from what. The records carry their method in `method`, not `body`; the by-reference projection names a skill by its description, and an agent reads the record when a duty calls for it.

## Judgments recorded

- The fifteen koios offices: the live copy at `koios-news-services-section/lib/agency` is the section's own and owns each office. The `history/source/lib/agency` copy is byte-identical to it (15 of 15 offices compared) and was added by the Group's parking commit `1144f3be2be9` ("Record uncommitted work present on Bare Cedar Fog on 2026-10-08"), which is one commit ahead of and 164 behind `causeway-services/koios-news` main (`983dc3db560b`). Main holds neither `history/` nor `vendor/`. The duplicate seats are an artifact of the Group's pin, not of the section, and they leave with the pin. No record was deleted or edited: the copy is a submodule snapshot that cannot be committed from the Group, and retiring its seats would rewrite a snapshot to repair a pin. The pin move is a superrepo gitlink change for the dispatcher.
- Koios skills: `editing`, `writing` and `publishing` are recorded only at `history/source/sites/koios.news/lib/agency/skills` in the pinned snapshot. On `koios-news` main they are at `policy/agency/skills`, which the agency walk does not read. Moving the pin without moving the skills into a `lib/agency` pool would leave the koios offices skill-less and unprojectable. That is open work in `koios-news`, and it is why the registry should not skip `history`.
- `managing-project-corpus-knowledge`: the engineering section's `corpus-management-service` record is the owner. The two koios `vendor/runtime` copies are vendored duplicates. They are not read after pull request 137, and nothing in the Group is deleted.
- Chief executive officer: both offices are real and neither is retired. Neither is projected until the agent names differ (specification `2026-10-09-spec-agent-names-for-offices-that-share-an-id.md`).

## The reading

The instrument `claude-code-harness-services-section/scripts/project-info-claude-harness.mjs` was run as a reading against the pull requests' files, fetched by blob from `CSS` into `claude-code-harness-services-section/reading/2026-10-09-computer-services-section-main/` (main `148cb3c58218` for the harness section, branch `organizing/office-reading-effective-for-unformed-offices` for organizing, branch `harness/projection-refuses-ambiguous-office-ids` for the projection; `computer-data-services-section` `295029edb74e` supplies `four`, which `CSS` organizing imports and the Group lacks). The Group's own packages resolve the rest from `node_modules/.package-map.json`.

| Reading | Organizing | Agents | Obstructions | Standing |
| --- | --- | --- | --- | --- |
| Deployed projector (first note) | deployed | 33 | 25 | false |
| Group source | Group copy | 3 | 47, all "reading 'kind'" | true |
| `CSS` main unchanged | `CSS` main | 3 | 48, all "reading 'kind'" | true |
| With pull request 137 | 137 | 33 | 16 (15 koios, 1 chief executive officer) | true |
| With pull requests 137 and 141 | 137 | 17 | 32 | true |

The last reading projects no skills, `standing: true`, a 14,029-byte `.claude/CLAUDE.md` whose held offices are `Lenticule Science Senior` (senior-scientist) and `Red Cup Engineer Senior` (senior-engineer), the host-resource hook, the 43-entry deny list (the 17 existing entries kept) and 17 agents. Its 32 obstructions are the 15 koios offices counted at both seats and the two chief executive officers. Files: `reading/.../reading-before-137.txt` and `reading-after-137-and-141.txt`.

## What was written

The reading met the condition, so the instrument was run with `--write`: `.claude/CLAUDE.md`, `.claude/agents/` (17 agents), `.claude/hooks/host-resource-hook.mjs`, `.claude/settings.local.json` (the existing `disabledMcpjsonServers ["metroplat"]` kept), `.claude/.claude-harness-manifest`, `.codex/hooks.json` and `.codex/hooks/`. The projection that is written comes from pull requests that are not merged; until they merge and Bare Cedar Fog is redeployed, the deployed projector's reading (100 skills, 33 agents, no standing) disagrees with the files, and a `claude-harness-check` there reports drift. The files are output: change the records or the projector and project again.

Not projected, with the reason: the chief executive officer (two offices, one id), the fifteen koios offices (two seats each, from the Group's pin), and any office without a skill.

## Open

- The agent name for the second `chief-executive-officer` (specification beside this note), and so the CEO agent Hai Xudi's session dispatches.
- The koios-news pin and the koios skills' carrier (see judgments).
- The `claude-code-harness-services-section/README.md` still says every skill record becomes a node skill; it describes the projector the founder's decision of 2026-10-06 removed.

## State at 12:56 CDT, after the 11:36 interruption

Recorded by the Bare Cedar Fog Claude character as senior-engineer, resuming the debt a prior dispatch left when the laptop crashed at 11:36 (memory fragmentation under concurrent agents). The prior dispatch had already done everything above; this resumption verified it and repeated nothing.

Verified as done:

- Pull requests 137 and 141 on `CSS` are open, unmerged, with no review decision; their receiver is the chief engineering officer. They are the repairs of the `effective` reading and of the ambiguous office id. The `.claude` files written at 11:19 come from them and not from the deployed projector.
- Every skill record in the Group outside `vendor` now carries a `description` (checked over all tracked `lib/agency/skills/*.json`; none lacks one). The seven that lacked one were repaired in the 11:19 commit with provenance in each record's `x-provenance`.
- JSON skills are named by reference with their description, and the agent reads the record's `body` or `method` when a duty calls for it. The projector does not inline bodies, by the founder's decision of 2026-10-06; the earlier "bodies dropped" finding is therefore a property of the pattern and not a defect.
- The duplicate `managing-project-corpus-knowledge` is judged: the engineering section's `corpus-management-service` record owns it, the koios `vendor/runtime` copies are vendored and not read after pull request 137. Nothing was deleted.
- The fifteen koios seats are judged above (artifact of the Group's submodule pin, byte-identical to the live copy). They are not retired in the Group: the copy lies inside the `koios-news-services-section` submodule snapshot, which the Group cannot commit into, and the repair is a gitlink move by the dispatcher.

What the projection yields now: `/home/emsenn/info/.claude/CLAUDE.md` (14,029 bytes) holding `Lenticule Science Senior` and `Red Cup Engineer Senior`; 17 agents in `.claude/agents` including `senior-engineer` and `senior-scientist`; the host-resource hook; no skills directory; `standing: true`.

Left, in order:

1. Merge of pull requests 137 and 141 by the chief engineering officer, then a redeployment so the deployed projector equals the Group one; until then a `claude-harness-check` on the node reports drift.
2. The pin move for `koios-news-services-section` together with moving the koios `editing`, `writing` and `publishing` skills into a `lib/agency` pool; this clears the fifteen duplicate obstructions and makes the koios offices projectable.
3. The agent name for the second `chief-executive-officer` (specification beside this note); until implemented, the chief executive agent is not projected.
4. The `claude-code-harness-services-section/README.md` correction (it still describes per-skill projection).
5. Uncommitted edits at 11:59 to `receive-independent-engineering-evidence.json` and `steward-engineering-repository-intake.json` in the engineering section's skills are another session's work and were left untouched.
