---
name: lab-session
description: Routes the owner's standing "research our deepest ideas / salvage abandoned work / audit keystone apps / go next-gen" session order to the parameterized lab-session-sweep workflow, so the shape is never re-authored per session. Use when the owner gives that order in any phrasing.
---

# Lab session: deep-research sweep

This is a routing skill only — it points at the tools and workflow that do
the work; it carries no theory, no keystone list, and no facts about the
org's current state. Those are named fresh each run from the live records
below, because they drift.

## Procedure

1. **Align.** Run `align-to-roadmap` first — name the Founder movement this
   sweep serves before spending inference on it.

2. **Find what's at risk.** Run
   `node .claude/skills/dispatch-agents/scripts/inventory-workflow-runs.mjs --since <today>`
   to list today's (or the named day's) workflow runs and their status.
   Killed or unpersisted runs become `args.sessions: [{id, note, suffix?}]`
   for the sweep — `note` should name which of that run's workflows/lots to
   cover and where their journals/scripts live, per the script's own output.

3. **Mine transcripts.** Run
   `node .claude/skills/mine-transcripts/scripts/extract-owner-messages.mjs --host cold-red-gate --store "~/.claude/projects/-home-emsenn-561-group" --out <scratchpad>/crg --chunks 12`
   (and the equivalent laptop-store invocation — `--out <scratchpad>/laptop`,
   omit `--host`/`--store` — when the owner asks for laptop history too).
   The `chunk-NN.txt` files it writes under `--out` become
   `args.chunksDir` (that directory) and `args.chunks` (the chunk file
   names) for the sweep. See `mine-transcripts`'s SKILL.md for store shapes
   and flags (`--since`/`--until`, `--kind codex`) before reaching for a
   hand-rolled extraction.

4. **Name keystones and theory lineages.** Read the derived roadmap
   readout (the work rail's `agent-work-dispatch` at ops.561.group, or
   `derive-roadmap-readout` in roadmap-engineering-services-section; the
   hand-written `*goal-stack-roadmap.json` cuts are migration inventory,
   owner-ruled 2026-09-06) and the whole-image note at
   `lib/emsenn/services/561-group/services/561-group-services-section/content/text/documents/articles/notes/2026/09/02/2026-09-02-note-on-the-whole-image-of-the-561-group.md`
   (open the newest whole-image note if a later one has since superseded
   this path). From those two carriers, name the session's own
   `args.keystones: [{key, prompt}]` (the app/system boundaries worth
   auditing right now) and `args.theory: [{key, prompt}]` (the theory
   lineages worth recovering right now), citing both source paths in the
   prompts you write. This naming is the session's judgment call each run,
   not a fixed list — the roadmap and the whole image change session to
   session.

5. **Run the sweep.**
   `Workflow({ name: 'lab-session-sweep', args: { chunksDir, chunks, sessions, dirtyTree?, keystones, theory } })`.
   Any direction left empty is skipped and logged as skipped by the
   workflow itself — pass only the directions this run actually needs.
   Readers and verifiers run on **sonnet**; see
   `.claude/workflows/lab-session-sweep.js` for the exact schemas and the
   default LAW/CONTEXT strings (override with `args.law`/`args.context`
   only when this run's constraints genuinely differ).

6. **Synthesize, then implement.** The session synthesizes the sweep's
   result in the main loop — doctrine and architecture-level judgment stay
   with the session, per `dispatch-agents`'s doctrine-vs-architecture
   ruling; do not delegate that synthesis to an agent. Once synthesized,
   commission implementation lots as further `Workflow` runs or direct
   agent dispatch through `dispatch-agents`. These may run concurrently
   with the sweep or with each other — concurrency is governed by the
   runner's own capacity cap and the token budget, not by a fixed
   sequencing rule (`dispatch-agents`'s "Runs are recoverable, not
   rationed").

7. **Close.** Run `close-session` to commit only this session's owned,
   verified cut and report the remaining tree state honestly.

## Registration

`lab-session-sweep` is registered in
`.claude/skills/dispatch-agents/SKILL.md`'s "House workflows" list. If that
entry and this skill ever disagree about the workflow's args shape, the
workflow file (`.claude/workflows/lab-session-sweep.js`) is the source of
truth — fix the prose to match the code, never the reverse.
