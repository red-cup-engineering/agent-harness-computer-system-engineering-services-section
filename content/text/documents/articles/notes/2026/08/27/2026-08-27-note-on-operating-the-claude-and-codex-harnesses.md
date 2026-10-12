---
title: Note on operating the Claude and Codex harnesses
date-created: 2026-08-27
tags:
- agent-harness
- claude-code-harness
- codex-harness
- projection
- office
- character
- incumbency
- consolidation
---


This section — `agent-harness-computer-system-engineering-services-section`
— has two service READMEs (`claude-code-harness-services-section/README.md`
and `codex-harness-services-section/README.md`) but no note that ties the
two providers' operations together into one runbook. This note is that
runbook: how the projection model works, the hard law it enforces, where
machine-specific state actually lives, and the same-day consolidation that
put this section into its current shape.

## The projection model: offices, characters, incumbency, projection

The harness does not animate agents directly from prose. It animates them
through a chain of records, each with its own seat, that this section's two
projector services turn into runtime output:

1. **Office.** A duty-bearing role record — e.g.
  `bare-cedar-fog-claude-actuation-office`, seated (for the Claude provider)
  at
  `.../bare-cedar-fog-services-section/services/bare-cedar-fog-inference-services-section/services/bare-cedar-fog-claude-services-section/content/offices/`.
  An office record states its `normative-structure`, its `bears-duty` list,
  its `authority-scope`, and — critically — an `unrealized` list: an office
  with no seated, discharging skill for a duty cannot be projected as a
  dispatchable agent at all. The office is provider-neutral in shape; each
  provider's machine actor seats its own copy.
2. **Character.** A durable session-role record — e.g.
  `claude-system-architect-session` — recording a `disposition`: how that
  session's animation of an office is expected to hold itself (e.g. "holds
  the one shape of the system in view... records rationale at decision
  time... routes significant change through control rather than slipping it
  in sideways"). Characters are seated in the same machine actor's
  `content/characters/` directory, one file per session-role.
3. **Incumbency.** The record that binds one character to one office as its
  holder, with two independent flags: `recognition` (has this office
  actually been animated by this holder — read backward, evidentially) and
  `induction` (does the holder now commit forward to the office's duties as
  projected into the runtime roster — read forward, as a commitment). Both
  must be `t` for the binding to be live. The seated incumbency records for
  Bare Cedar Fog's Claude sessions were themselves a repair: prior to
  2026-07-30 (session `5805c631`, step W1.1, "officer-attribution repair"),
  the harness had projected offices as dispatchable subagents with no
  seated character or incumbency at all — office + character + recognition
  + induction = officer was flattened to just "office." The incumbency
  records now close that gap explicitly, one per office-holder pair.
4. **Projection.** Only once an office has a realized duty, a character
  holds it, and the incumbency is live does a provider's projector service
  turn the triple into runtime output:
   - **Claude**: `claude-harness-projection-service`'s
     `project-claude-harness` operation projects one machine actor's
     office-roster configuration into a project-local `.claude/agents/`
     roster — one named, fully-primed agent file per projected office,
     installed by the settlement's own installing-claude-as-an-agent
     instrument. The service never writes an agent file by hand and never
     invents a substitute projector; the office record is the source, the
     agent file is output.
   - **Codex**: `codex-harness-projection-service`'s
     `project-codex-harness <configuration> <output>` operation projects a
     machine actor configuration into an explicit, **disposable**
     project-local `.codex` directory (never the implicit user-level Codex
     home), plus owned lifecycle-hook slices into an explicit project root.
     A second service, `codex-office-agent-projection-service`'s
     `install-codex-as-an-agent <office> <node>`, projects one enterprise
     office record and its held skills into one project-scoped Codex custom
     agent.

## The hard law (2026-07-28)

The `claude-code-harness-services-section` README states the standing law
this section exists to enforce, corrected into place 2026-07-28: **a
session may dispatch only a named agent already projected into
`.claude/agents/` from a defined office — never a bare, unprimed model
prompted fresh on the spot.** Priming happens once, at projection time; a
dispatch spends none of the Leader's attention re-explaining scope, law, or
instruments the projected agent already holds from its own office record.
This is the same law both providers implement, in their own idiom: Claude
projects a durable, named roster file per office; Codex projects a
disposable runtime directory per invocation, but from the same
office/character/incumbency chain, never from an ad hoc prompt.

## Where the state actually lives

This section (`agent-harness-computer-system-engineering-services-section`,
under `computer-engineering-services-section`) owns the **reusable**
mechanism: the provider-neutral MAPE-K actuation-office shape
(`mape-k-actuation-office-service`), the receiver-owned tool-agent boundary
(`receiver-owned-tool-agent-service`), the privacy-bounded transcript
parsing seam (`session-transcript-dialects-service`), and the two providers'
projector/actuator packages. It does not hold machine-specific policy.
Generated `.codex` and `.claude` trees, session observations, caches, and
deployment state are runtime material, never source holdings of this
section.

The actual office, character, and incumbency records for Bare Cedar Fog's
Claude and Codex sessions — the machine-specific data the projectors above
read — live under the 561-group services tree, at
`561-group/services/561-group-services-section/services/561-group-engineering-services-section/services/561-group-computer-services-section/.../bare-cedar-fog-services-section/services/bare-cedar-fog-inference-services-section/`,
in `bare-cedar-fog-claude-services-section/content/{offices,characters,incumbencies}/`
and `bare-cedar-fog-codex-services-section/agents/{offices,office,harness,...}/`.
That is a different section from this one, deliberately: this section is the
reusable harness engineering that any machine actor's projector runs
against; the Bare Cedar Fog tree is one machine's seated configuration.

## See also

- [Claude Code Harness Services Section](../../../../../../../../services/claude-code-harness-services-section/README.md)
- [Codex Harness Services Section](../../../../../../../../services/codex-harness-services-section/README.md)
- [This section's own top-level README](../../../../../../../../README.md)
