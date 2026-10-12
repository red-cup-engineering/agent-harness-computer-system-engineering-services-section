---
title: "Note on the agent root instruction as a template fill"
date-created: 2026-10-10
description: "The Leader's statement that the agent root instruction is a filled template, so a separate discrete package for it is itself the drift, and that a review of a session must address the real concerns."
type: note
keywords:
  - agent-harness
  - root-instruction
  - agents-md
  - projection
  - code-drift
  - template
provenance:
  utterances:
    - ni:///sha-256;-rYIGXBAMoSNpKIfMlptbnGU26XY6251ZUjX5aIp8g8
  authors:
    - emsenn
    - claude
  pass: education-media
---

Utterance `ni:///sha-256;-rYIGXBAMoSNpKIfMlptbnGU26XY6251ZUjX5aIp8g8` (2026-09-11 14:40Z). Paths are relative to `lib/emsenn/services/561-group/services/`; `HARN` stands for `engineering-services-section/services/computer-engineering-services-section/services/computer-systems-engineering-services-section/services/agent-computer-system-engineering-services-section/services/agent-harness-computer-system-engineering-services-section`.

## Theory

1. An agent's root instruction is the output of a fill: "take this agents.md jinja2, fill it with this data". It is a template (an AGENTS.md or CLAUDE.md skeleton, in the Leader's example a Jinja2 template) applied to data (the agent's office, duties, skills, standing text), and nothing more.
2. A fill is deterministic and small. A discrete "agent root instruction service" package that grows its own logic around that fill is where "massive code drift" comes from: each new behaviour is a second implementation of what the data and the template already say. The Leader: "Like this whole 'agent root instruction service' as a discrete package are you fucking KIDDING me of course you're going to have massive code drift when 'take this agents.md jinja2, fill it with this data' turns into... whatever the fuck that is."
3. The house's projector is the place of the fill. `engineering-services-section/services/computer-engineering-services-section/services/computer-systems-engineering-services-section/services/agent-computer-system-engineering-services-section/services/agent-harness-computer-system-engineering-services-section/` projects a harness from agency records (offices, skills, standing text) into `.claude/CLAUDE.md`, skills and agents (`engineering-services-section/services/computer-engineering-services-section/services/computer-systems-engineering-services-section/services/agent-computer-system-engineering-services-section/services/agent-harness-computer-system-engineering-services-section/content/text/documents/articles/notes/2026/10/09/2026-10-09-note-on-projecting-the-info-claude-harness.md`). Held thinly: that note finds the deployed projector and the house projector have diverged and that `.claude/CLAUDE.md` is written only when `standing` is a non-empty string. That divergence is the drift the Leader named, found in the code.
4. A review of a session names the design-level concerns and does not stop at loose ends. The Leader's instruction for the review: "Review this fucking session. Take seriously how shit needs to be changed. This is not a matter of 'loose ends'. This is 'you have barely even addressed the real concerns.'" The concern named in the utterance is the existence of the root-instruction logic as a separate package, not its individual bugs.
5. "Stop stopping" is an instruction to continue the work through the review without halting for confirmation; it is process and is carried by the rule `coordinate-the-swarm-rather-than-stop-it` and the answer ladder in the 2026-10-10 note on agents answering before asking.

## Open questions

- Which package the Leader meant by the "agent root instruction service" is not named in the utterance, and a search of the house's tracked content and records finds no package of that name. The requirement is stated of the projector as delivered.
- Whether the template language stays Jinja2 or becomes a house notation (semiotic-expression-notation) is open. The Leader's example is Jinja2; the requirement fixes the shape (template plus data, deterministic) and leaves the language open.
