---
title: Note on judging the duplicate office and description-less skill records
date-created: 2026-10-10
tags:
- agent-harness
- claude-code-harness
- projection
- office
- skill
---

Recorded by the Red Cup Engineer Senior office of the 561 Group, realizing requirements `described` and `one-seat` of the work-arena request `debt-2026-10-09-harness-projects-from-records`. It answers the "Records too thin to project" list of [the 2026-10-09 note on projecting the info Claude harness](../09/2026-10-09-note-on-projecting-the-info-claude-harness.md). Each judgment below is recorded before the copy it concerns is discarded (existing-work-is-judged-before-it-is-discarded). Method: every office record (`lib/agency/offices/*.json` and `*.md`) and every skill record (`lib/agency/skills/*`) listed by `git ls-files`, grouped by the `id` inside the record.

## Offices occurring in more than one section

### The fifteen koios offices: already resolved

The Group holds no koios office record. `koios-news-services-section` is a submodule of `causeway-services/koios-news`; the offices of the koios editor and desk are recorded in that repository and nowhere in this one, so the duplicate the 2026-10-09 reading reported (the `history/source` copy and the live copy) no longer exists in the Group. Nothing to retire here; whether the two copies inside the submodule's own repository are reduced to one is that repository's matter.

### `mathematical-library-steward`: kept at obsmetrological-services-section, retired from `apps/obsmetrologia-change-bundle-qualification`

- Kept: `obsmetrological-services-section/lib/agency/offices/mathematical-library-steward.json` (`part-of obsmetrological-services-section`, founded 2026-07-18, restated 2026-09-04 over the section's proof line). It serves the whole proof line (admit a proof work order, seat a blueprint node red, produce proof and axiom evidence, write the verse), which is the section's work and not any one app's. Its incumbency (`harriet-metz-as-mathematical-library-steward`) and character are recorded at the section.
- Retired: the copy in `apps/obsmetrologia-change-bundle-qualification/lib/agency/offices/`. It was the 2026-07-18 legacy shadow (`jurisdiction oml`, `authority-scope lib/ content/ data/` relative to the app): five duties, one power, one immunity, and the same two skills. Every one of those terms is carried by the section record, which adds the other duties, the proof-line scope and the theory basis. No capability is lost. The app's only use of the copy was its `lib/agency/roster.json`, whose `offices` is now empty: the app's change-bundle qualification is performed under the section's steward, and the app's source and tests do not read the record.

## Offices whose id repeats but are not copies

### `chief-executive-officer`: two different offices; both kept, decision needed

`561-group-services-section/lib/agency/offices/chief-executive-officer.json` (the Group's CEO, answering to the Founder, presiding over the C-suite) and `blockchain-trashpanda-services-section/lib/agency/offices/chief-executive-officer.json` (the CEO of the Blockchain Trashpanda micro-enterprise, `reports-to []`, one duty and one skill) share an id and nothing else: different normative structure, jurisdiction, duties and bearers. Retiring either would lose a capability, so neither is retired. The Trashpanda id is written into its founding manifest, its verifiers, its charter and its incumbency records, so renaming it (for example to `blockchain-trashpanda-chief-executive-officer`) is a change to that section's founding evidence and is left to the Leader. Until it is decided, a projector that keys offices by id alone will report this one as a duplicate.

## Skills without a description

Every skill record (`SKILL.md`, `skill.json`, or a top-level `*.md`/`*.json` in a `lib/agency/skills/` directory) now carries a description: the seven named by the 2026-10-09 reading (serve-quantitative-researcher, serve-content-resource-officer, serve-personal-services-team-lead and the Causeway media, economic and computer and Turntide community team leads) were described before this run, and no further record lacks one. Three files under `lib/agency/skills/` are not skill records and were left as they are: `hive-fleet-operations-service/.../read-a-schema.js` and `stripe-services-section/.../write-a-schema.js` are executable carriers for the shared json-schema scripts (no body to describe), and `emsenn-services-section/.../skills/index.md` is an empty index page. The id `managing-project-corpus-knowledge` occurs once in the Group (corpus-management-service); the second copy lived under koios vendor/runtime, now in the submodule.
