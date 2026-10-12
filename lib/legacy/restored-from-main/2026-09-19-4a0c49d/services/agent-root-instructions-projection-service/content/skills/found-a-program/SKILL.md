---
name: found-a-program
description: >-
  How a founder movement that names a new product or enterprise becomes one program threaded through the five custodies (science, engineering, operations, 561-group, public) with a program carrier, named divisions, a business plan, a capability specification, and a journaled founding. Load when the owner says "bootstrap a new service", "new enterprise", "new public service", "set up the sections for X", or names a product the tree does not yet seat. Pointer skill: the shape lives in the tree's live program carriers, not here.
---

# Found a program

A program is founded four times in the tree already (medical 2026-09-02,
work 2026-09-05, investment 2026-09-05, no-buy 2026-09-05), and each session
re-derived the shape from the previous README. This skill is the pointer so
the fifth does not.

## The office

The founding is the **program manager**'s duty
(`lib/emsenn/services/561-group/services/561-group-services-section/lib/agency/offices/program-manager.json`,
projected to `.claude/agents/program-manager.md`). The research lot is the
**research analyst**'s (science custody); the architecture specification is
the **system architect**'s. The executive session holds doctrine (which
program, which theory it stands on, where money lands) and commissions the
three; it never writes the science or the spec itself.

## The shape, by live example

Read these in order; they are the standard, not this file:

1. The five-custody thread and the "561-group-X owns the other four" rule:
   `.claude/rules/org-layering.md`, section "The five-custody thread".
2. A program carrier, complete: the work program's README at
   `lib/emsenn/services/561-group/services/561-group-services-section/services/561-group-operations-services-section/services/561-group-work-services-section/README.md`
   (sections: the movement in the founder's words; the theory the program
   stands on, every commitment cited to a ruled carrier; micro and macro;
   the divisions table; money is the receiver; meet then beat; carriers; the
   bootstrap rungs as projects with completion criteria).
3. A business plan in the meet-then-beat spec-stage form:
   `.../public-economic-services-section/services/public-worker-services-section/services/gig-assist-services-section/2026-09-05-note-on-the-gig-assist-business-plan.md`,
   with its measurement rows beside it in `data/records/`.
4. A capability specification in the engineering seat, PACER's shape:
   `.../public-economic-services-section/services/public-worker-services-section/services/gig-assist-services-section/2026-09-05-gig-assist-specification.md`.
5. The section form every founded directory must satisfy:
   `@red-cup-engineering/fold-directory-entries-into-services-section-form-service`
   (README, package.json, `content/text/documents/articles/notes/YYYY/MM/DD/`,
   `data/{logs,records,state}` only, `src/ scripts/ apps/ test/`) and the
   founding operator beside it, `@red-cup-engineering/found-services-section-service`
   0.2.0 (published 2026-09-05, born through the fabrication line): one
   effect, one section directory in form with README, package.json, and
   the content and data directories, registered in its parent README;
   idempotent, skipping any file that exists. One JSON request on stdin
   (`path, name, custody, packageName, packageDescription, brand?,
   parentReadmeSentence?, readme?, root?`); a path outside
   `lib/emsenn/services/561-group/services/` is refused as a datum.

## Rules the founding sessions learned the hard way (2026-09-05)

- Package names are function names, never brands: every seat's root package
  (science, engineering, operations, public, 561-group) is named by its
  section path (`@red-cup-engineering/<section-name>`, etc.), because that is
  what consumers pin. A section does not need a brand to be founded. Only a
  public property or one of the five houses carries a brand, recorded once as
  data through `enterprise-branding-services-section`'s `read-enterprise-brand`
  and `write-enterprise-brand` scripts, never in a package, directory, or
  README title.
- Extracted shared code (an assistant engine, a companion package) lands in
  the parent section's own `src/`, never in a coined child section.
- The founding is journaled through the semantic record journal in the
  561-group seat (`createSemanticRecordJournal({root, objectKind}).record(...)`,
  charge `{support, refutation}` both required); a founding with no record
  did not happen.
- Every parent README registers its new child in one sentence with a
  relative link; `jsnode_section '<topic>'` returning all five seats is the
  gate.
- Money is named before code (align-to-roadmap, owner-ruled 2026-09-05):
  the account or wallet cash lands in, in the carrier, before any lot is
  commissioned; whether and when cash settled is a ledger reading
  (`ledger-report` on ops), never a carrier sentence.
- A carrier holds invariants only (owner-ruled 2026-09-06, "everything in
  these roadmaps needs to be stored as data in the appropriate journals and
  derived"): no shipped state, versions, test counts, dates of landing,
  "landed" annotations on rungs, or "no cash yet". What the tree holds is
  read with `jsnode_section` and the registry; what is open or done is a
  work intent and its discharge on the rail (`structured-work-intent-admit`,
  `work-discharge-admit`), read back as milestone and work-item readouts;
  what is live is the live surface. The territorial-economy carrier of
  2026-09-05 was the documented failure: seven hand-written roadmap cuts in
  a day and a README of landed-state paragraphs.
- Public properties are parameterizations: two enterprises on one platform
  are two JSON parameterizations of one app seat, never two apps.
- From `@red-cup-engineering/found-services-section-service@0.2.0`, the founding
  operator (`node <operator>/scripts/found-services-section.mjs`) takes an
  optional `root` and otherwise derives the repository root by walking up from
  the caller's cwd to the nearest ancestor containing
  `lib/emsenn/services/561-group/services`, refusing `{refused:
  "REPOSITORY_ROOT_NOT_FOUND", cwd}` rather than writing when run outside a
  repository (friction fixed 2026-09-05).
- The science lot's researcher reads the house's science first and writes
  into the owning science seat, never the scratchpad (founder-ruled
  2026-09-05, correcting this session's own rule: "doing web research on
  things we have rich context for" and "not getting the stuff in our science
  section" are the failures; a context-free researcher was a one-time ask,
  never standing). The brief names the house carriers the lot builds on and
  the seat's `data/records/` and notes directory it writes to; web research
  covers only what those carriers do not hold, and the note cites them.
- The receiver writes the program carrier, the business plan, the capability
  specification, and the science seat's notes and records into the seats while
  the founding lot runs, and the operator skips every file that exists. The
  lot's brief says so, and a lot that finds those files mid-flight continues
  (the 2026-09-05 territorial-economy lot stopped, reading the receiver's own
  writes as a rival process, and had to be resumed at a full report's cost).
- Standard lot constraints for the commissioned lots are in
  `.claude/skills/dispatch-agents/SKILL.md`; cite them, do not restate.
