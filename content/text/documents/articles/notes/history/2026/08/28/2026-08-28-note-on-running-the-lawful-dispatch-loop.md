---
title: Note on running the lawful dispatch loop
date-created: 2026-08-28
tags:
- agent-harness
- claude-code-harness
- projection
- office
- character
- incumbency
- ajv
- project-management-team
- dispatch
---


This note is a procedure: how to take an unmet need in this repository from
"nobody is chartered to do this" to "a projected, dispatchable officer did
this, and the settlement recorded it" — the full lawful dispatch loop this
repository's own instruments already implement. It names six steps, each with
the real command that runs it. Follow it in order; each step's postcondition
is the next step's precondition.

The template to copy at every step is the Agent Harness Engineering Office's
own seating: office, character, incumbency at
`.../bare-cedar-fog-claude-services-section/content/offices/agent-harness-engineering-office.json`,
`.../content/characters/claude-agent-harness-engineering-session.json`, and
`.../content/incumbencies/claude-agent-harness-engineering-session-as-agent-harness-engineering-office.json`
(full path prefix given in step 1), its skill at
`.../content/skills/maintain-harness-package-verify-scripts/SKILL.md`, its
projected agent at `.claude/agents/agent-harness-engineering-office.md`, and
its settlement record under
`561-group-enterprise-project-management-services-section/data/logs/`. Every
one of those files is real, committed, and worth reading before writing the
next office's version of each.

## 1. Author office + character + incumbency, plus at least one SKILL.md

An office needs somewhere real to answer for and a real capability to
discharge — never a scaffold with plausible filler. All three records seat
under one machine actor's own section, for example
`lib/emsenn/services/561-group/services/561-group-services-section/services/561-group-engineering-services-section/services/561-group-computer-services-section/services/computer-machine-services-section/services/persistent-computer-machine-services-section/services/bare-cedar-fog-services-section/services/bare-cedar-fog-inference-services-section/services/bare-cedar-fog-claude-services-section/content/`
for Bare Cedar Fog's Claude machine actor:

- **Office** — `content/offices/<office-id>.json`. Required keys per
  `office.schema.json` (path in step 2): `id` (matches the filename), `name`,
  `kind: "office"`, `normative-structure` (what the office answers for, as a
  normative form — not a job description), `deontic-profile` (a map from
  named works to exactly one of `duty` | `liberty` | `deontic-power` |
  `deontic-immunity`), and `theory-basis` (a non-empty list naming what the
  office's structure is actually derived from — an office derived from how a
  session felt from the inside is the failure this key exists to catch). Give
  it `provides-skill` naming the skill authored below, and `authority-scope`
  and `jurisdiction` bounding what it may touch.
- **Character** — `content/characters/<session-id>.json`. `id`, `name`,
  `kind: "session"`, `disposition` (how this session's animation of the
  office holds itself — concrete practice, not a personality sketch), and an
  `x-provenance` block naming who recorded it, on what date, and its basis.
- **Incumbency** — `content/incumbencies/<session-id>-as-<office-id>.json`.
  Required keys per `incumbency.schema.json` (step 2): `office` (the office
  id), `holder` (the character id), `recognition: "t"`, `induction: "t"`,
  `from` (the seating date, `YYYY-MM-DD`). Both `recognition` and `induction`
  must be `"t"` — a half-seating (`"bottom"` on either axis) is not a live
  officer and will not project.
- **At least one SKILL.md**, at `content/skills/<skill-name>/SKILL.md`,
  frontmatter `name:` matching the directory name exactly, plus a
  `description:` stating when to use it. The office must reach this skill
  either through `provides-skill`, or by bearing a duty (`bears-duty`) whose
  own duty record lists a skill, or by seating the skill directory under the
  office's own directory if the office is itself a seated directory.
  **This is not optional.** The projector this loop's step 4 delegates to
  (`install-claude-as-an-agent.js`) calls `checkSkills` before it will render
  anything, and an office with none is refused outright:

  > `office '<id>' (<path>) has no skills — it records no duties realized by
  > any skill, and holds none of its own. An agent holding nothing can
  > discharge nothing.`

## 2. Validate with ajv against the real schemas

Both the office and the incumbency record must conform to the canonical
schemas at
`lib/emsenn/services/561-group/services/operations-services-section/services/enterprise-services-section/services/enterprise-systems-services-section/services/enterprise-administration-services-section/services/enterprise-office-services-section/data/records/schema/office.schema.json`
and `.../schema/incumbency.schema.json`. There is no committed one-shot CLI
for this pair; validate the same way the worked example did, with `ajv` —
already an installed dependency of
`561-group-enterprise-project-management-services-section` (step 6's own
package), so no new install is needed. Run this from the repository root,
substituting the two record paths authored in step 1:

```sh
cd lib/emsenn/services/561-group/services/561-group-services-section/services/561-group-operations-services-section/services/561-group-enterprise-services-section/services/561-group-enterprise-project-management-services-section

node --input-type=module -e '
import { readFileSync } from "node:fs";
import Ajv2020 from "ajv/dist/2020.js";
const ajv = new Ajv2020({ allErrors: true, strict: false });
const SCHEMA = "../../../../../../../operations-services-section/services/enterprise-services-section/services/enterprise-systems-services-section/services/enterprise-administration-services-section/services/enterprise-office-services-section/data/records/schema";
const pairs = [
  [`${SCHEMA}/office.schema.json`, "<path-to-your-office.json>"],
  [`${SCHEMA}/incumbency.schema.json`, "<path-to-your-incumbency.json>"],
];
for (const [schema, data] of pairs) {
  const validate = ajv.compile(JSON.parse(readFileSync(schema, "utf8")));
  const ok = validate(JSON.parse(readFileSync(data, "utf8")));
  console.log(data, "=>", ok, ok ? "" : validate.errors);
}
'
```

`strict: false` is the same laxness the repository's own office-conformance
checkers use (`ajv({ allErrors: true, strict: false })`); it silences an
"unknown format" warning on `founded`'s `date` format and changes nothing
about whether the record actually conforms. A `false` result prints
`validate.errors` — read them, fix the record, and re-run before moving on.
Refused, not patched around: a spec that fails here is not seated in step 3.

## 3. Seat in the harness policy

The projector will not touch an office that is not named, with a real
seating, in the machine actor's own harness policy —
`content/harness/claude-agent-harness.json` in the same section as step 1.
Edit two places in that one file:

- `colleagueOffices`: append the office record's repo-root-relative path.
- `colleagueSeatings`: add an entry keyed by the office's bare id, with
  `character` and `incumbency` naming the two record paths from step 1.

Both are required — `loadPolicy` (in
`@red-cup-engineering/claude-harness-projection-service`) throws before
projecting anything if any office named in `colleagueOffices` has no matching
`colleagueSeatings` entry, and `projectClaudeHarness` separately resolves and
validates that the named character and incumbency files exist, agree with
each other, and the character is `kind: "session"` before it will project
that office at all.

## 4. Project for real, then --check

From the section root (`bare-cedar-fog-claude-services-section` for Bare
Cedar Fog's Claude machine actor):

```sh
node scripts/project-claude-agent-harness.mjs
node scripts/project-claude-agent-harness.mjs --check
```

The first, real, run writes `.claude/agents/<office-id>.md` and records the
office id in `.claude/.claude-agent-manifest`. The second reports
`contentChecked: true` and exits `0` only if the installed file is
byte-identical to a fresh projection of the office record — never trust a
projection you have not re-checked. `--dry-run` (first invocation only) shows
what would be written without writing it, useful while the office record is
still being drafted.

## 5. Dispatch the projected officer

The written `.claude/agents/<office-id>.md` file **is** the dispatch prompt —
its frontmatter names the agent, its body is the office speaking (normative
structure, position, deontic profile, and every skill it holds, projected in
full). There is nothing further to prime. Dispatch it by that exact name,
appending the actual task:

- name the nearest AGENTS.md of every node the task touches, and instruct the
  officer to read it before acting;
- carry the full scope of the task, never a patch-scoped fragment chosen to
  finish faster;
- name this loop's own instruments for the task instead of licensing a
  freelance substitute.

This is `content/harness/claude-agent-harness.json`'s own `dispatchLaw`,
which binds every dispatch from a session under that policy. A dispatched
officer reports what it changed, what broke, and what it could not finish,
with exact paths and real command output. Dispatching a reviewer agent is not
verification and must never be described as such — the receipt is the
command and its real exit status, re-run independently by the dispatching
session after the officer reports.

## 6. Settle through manage-a-project-corpus.js

Settlement is a two-round trip against
`561-group-enterprise-project-management-services-section/src/manage-a-project-corpus.js`,
run from that package's own root — its filesystem authority is fixed to its
own `data/` directory; `--data-root` and `--test-data-root` are refused
outright. The package's own
`test/manage-a-project-corpus.test.js` is the pattern this follows exactly
(its `fixture()` and `knowledgeResultFor()` helpers show the literal shapes);
this loop stands in for `corpus-management-team` by hand, the same way that
test does, because CMT dispatch is out of this loop's scope.

**Round 1 — admission.** Build an ActivityStreams `Offer` whose `object` is
`type: "ManageProjectCorpus"`, `contract` equal to `PROJECT_CORPUS_CONTRACT`
(exported from `src/law.mjs`), and a `corpus.forms` array naming, at minimum,
one `Task` form (with a `goal` predicate) and one `DispatchIntent` form whose
`contractor` is `urn:ame:<office-id>` — the office dispatched in step 5.
`corpus.digest` must equal the real content digest of `corpus.forms` (the
unit refuses a mismatched digest, not silently trusts it). Run it:

```sh
cd lib/emsenn/services/561-group/services/561-group-services-section/services/561-group-operations-services-section/services/561-group-enterprise-services-section/services/561-group-enterprise-project-management-services-section
node src/manage-a-project-corpus.js --input /path/to/offer.json
```

A conforming Offer returns an `Accept` whose `object.type` is
`"ProjectManagementAdmission"`, `disposition: "knowledge-required"`, and a
`knowledgeOffer` — the exact bilateral Offer this unit derived for
`corpus-management-team`. Keep its `id`.

**Round 2 — settlement.** Build a continuation activity: the same corpus,
plus `object.knowledgeResult` — a hand-built `Accept` from
`urn:ame:corpus-management-team`, replying (`inReplyTo`) to the exact
`knowledgeOffer.id` from round 1, whose `object` is a
`"CorpusManagementResult"` carrying a valid predecessor-linked
monitor→analyze→plan→execute MAPE chain (`knowledgeResultFor()` in the test
file above is the literal shape to copy). Add a `GoalEvidence` form to the
corpus citing the officer's real command and its real, independently re-run
exit status, and a `ProjectArtifact` form citing the commit(s) the officer's
work landed in and the agent file dispatched. Run it again:

```sh
node src/manage-a-project-corpus.js --input /path/to/continuation.json
```

A settled result returns an `Accept` whose `object.type` is
`"ProjectManagementResult"`, `disposition: "settled"` (or
`"coordination-required"`, naming exactly what is unresolved, if any task's
goal predicate, dependency, or CMT coordination is still outstanding), and an
`outbox` of any further task offers the plan derived. Both rounds' real
journal evidence — the ActivityStreams values, CloudEvents, and EAVT rows,
content-addressed, not simulated — land under this package's own
`data/logs/<year>/<month>/<day>/`, written through the canonical
`createSemanticRecordJournal`.

The loop is closed once round 2 returns `"settled"`: a real office exists, is
seated, is projected, was dispatched under the harness's own dispatch law,
and its completed work is recorded in the enterprise's own settlement
instrument with real evidence behind it.
