#!/usr/bin/env node
// lifecycle.mjs -- session-start (suit up) and session-end (consolidate) for the conductor.
//
// session-start : compose a minimal context-spacesuit by restriction. Writes NOTHING durable.
// session-end   : the swarm consolidates the transcript into placed, provenanced memory rows -- the
//                 ONLY durable write in the loop, dual-filed (memory store + placement anchor) and
//                 behind a governance gate. This is the evolution loop: next session-start's suit is
//                 better because session-end posted memory the proof engine can check.

import { appendFileSync, readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import suiting from "#script/suiting";
import consolidating from "#script/consolidating";
import studying from "#script/studying";
import being from "#script/being";
import working from "#script/working";
import governing from "#script/governing";

const ROOT = dirname(fileURLToPath(import.meta.url));
const CC = "articulating/library/aperiodic-articulation-category/hacking/library/claude-code";
const MEMORY_LOG = `${CC}/hacking/library/memory/memory.jsonl`;
const AGENT_LOG = `${CC}/hacking/being/library/agent/agent.jsonl`;

// known placement slugs -> their per-thing log (where a memory is "placed where it's needed")
const PLACEMENT_LOG = {
  memory: MEMORY_LOG,
  "claude-code": `${CC}/claude-code.jsonl`,
  inferring: `${CC}/inferring/inferring.jsonl`,
  prompting: `${CC}/prompting/prompting.jsonl`
};

export function readMemory() {
  const p = join(ROOT, MEMORY_LOG);
  if (!existsSync(p)) return [];
  return readFileSync(p, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
}

// session-start: suit up (restriction). No durable write.
export function sessionStart(task, opts = {}) {
  return suiting(readMemory(), task, opts);
}

// session-end: consolidate (extension). Posts each memory row to the memory store and, when the
// placement slug is known, to that anchor too. Governance-gated.
export function sessionEnd(sessionTrace, enactor, { gate, now } = {}) {
  const rows = consolidating(sessionTrace, enactor, { gate, now });
  for (const row of rows) {
    const line = JSON.stringify(row) + "\n";
    appendFileSync(join(ROOT, MEMORY_LOG), line);                 // the durable memory store
    const target = PLACEMENT_LOG[row.placement];
    if (target && target !== MEMORY_LOG) appendFileSync(join(ROOT, target), line); // placed where needed
  }
  return rows;
}

// study a subject: settle its claim-lattice via the swarm; post the accepted truth as memory.
// Only an accepted (within-threshold) studied-subject becomes durable memory -- an unsettled
// (still-contradictory) subject is NOT written; its contradiction stays an open demand.
export function studySubject(subject, claims, swarm, { gate, now, threshold, maxRounds } = {}) {
  const studied = studying(subject, claims, swarm, { threshold, maxRounds });
  if (studied.accepted) {
    const row = {
      e: subject,
      a: "settled-truth",
      v: studied.truth,
      t: (now && now()) || new Date().toISOString(),
      evidence: [`studied:${studied.claimCount}-claims`, `confidence:${studied.confidence.toFixed(3)}`, `rounds:${studied.rounds}`],
      placement: "memory"
    };
    if (!gate || gate(row)) appendFileSync(join(ROOT, MEMORY_LOG), JSON.stringify(row) + "\n");
  }
  return studied;
}

// swarmStudy: a real (stigmergic) swarm settles a subject. N agents (being) each WORK (working) by
// reading evidence; each contribution is filed e-anchored by the agent id into the shared agent fiber
// (distinguishable contributors -> consensus is computable). studying reconciles the shared field.
// Governance (metabolism) bounds how many agents may work.
export function swarmStudy(subject, memberSpecs, read, opts = {}) {
  const budget = opts.budget ?? memberSpecs.length;
  const agents = memberSpecs.map(being);
  const claims = [];
  const t = (opts.now && opts.now()) || new Date().toISOString();
  let spent = 0;
  for (const agent of agents) {
    const gov = governing({ budget, spent }, {});
    if (!gov.allowed) break;                  // metabolism: no budget, no work
    const wp = working(agent, subject, read, opts);
    claims.push(wp.claim);
    const row = { e: agent.id, a: subject, v: wp.claim.value, t, evidence: wp.claim.evidence };
    appendFileSync(join(ROOT, AGENT_LOG), JSON.stringify(row) + "\n"); // shared field, e-anchored
    spent++;
  }
  const studied = studying(subject, claims, null, { threshold: opts.threshold ?? 0.5, maxRounds: 1 });
  return { subject, agents: agents.map((a) => a.id), workers: spent, claims, studied };
}

// tick: one beat of the organism's life. Sense the prompt, let the swarm study the implied subject,
// consolidate accepted truth, compose the conscious suit for the next beat. The loop made to cycle.
export function tick(userToken, promptText, opts = {}) {
  const subject = opts.subject ||
    promptText.toLowerCase().split(/\W+/).filter((w) => w.length > 3)[0] || "session";
  const members = opts.members || [{ id: "agent-1" }, { id: "agent-2" }, { id: "agent-3" }, { id: "agent-4" }];
  const read = opts.read || ((agent) => ({ value: agent.id === "agent-2" ? "false" : "true", evidence: [`${agent.id}:read`] }));
  const sw = swarmStudy(subject, members, read, { budget: opts.budget ?? 6, threshold: opts.threshold ?? 0.5, now: opts.now });
  if (sw.studied.accepted)
    studySubject(subject, sw.claims, null, { gate: () => true, threshold: opts.threshold ?? 0.5, maxRounds: 1, now: opts.now });
  const suit = sessionStart(promptText, { budget: opts.suitBudget ?? 1500 });
  return { subject, swarm: sw, suit };
}

// Demo swarm enactor: deterministic stand-in for the fungible swarm.
function demoSwarm(trace) {
  const last = trace[trace.length - 1]?.content || "session";
  return [{
    e: "claude-code",
    a: "learned",
    v: `from session: ${last}`.slice(0, 120),
    placement: "claude-code",
    evidence: [`session-trace:${trace.length}-messages`]
  }];
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const mode = process.argv[2];
  if (mode === "--session-start") {
    const task = process.argv.slice(3).join(" ") || "orchestrate the swarm";
    console.log(JSON.stringify(sessionStart(task, { budget: 1500 }), null, 2));
  } else if (mode === "--session-end") {
    const text = process.argv.slice(3).join(" ") || "claude-code is the conductor of the swarm";
    const trace = [{ role: "user", content: text }, { role: "assistant", content: "settled" }];
    const gate = (row) => row.evidence.length > 0; // governance: must cite provenance
    console.log(JSON.stringify(sessionEnd(trace, demoSwarm, { gate }), null, 2));
  } else if (mode === "--study") {
    const subject = process.argv.slice(3).join(" ") || "claude-code-is-conductor";
    const initial = [
      { observer: "obs-a", value: "true", evidence: ["read:plan"] },
      { observer: "obs-b", value: "false", evidence: ["read:stale-note"] }
    ];
    const swarm = (d) => [{ observer: `swarm-r${d.round}`, value: "true", evidence: ["read:verified-files"] }];
    console.log(JSON.stringify(studySubject(subject, initial, swarm, { gate: () => true, threshold: 0.6, maxRounds: 6 }), null, 2));
  } else if (mode === "--swarm") {
    const subject = process.argv.slice(3).join(" ") || "claude-code-is-conductor";
    const members = [{ id: "agent-1" }, { id: "agent-2" }, { id: "agent-3" }, { id: "agent-4" }];
    const read = (agent) => ({ value: agent.id === "agent-2" ? "false" : "true", evidence: [`${agent.id}:read-files`] });
    console.log(JSON.stringify(swarmStudy(subject, members, read, { budget: 6, threshold: 0.5 }), null, 2));
  } else if (mode === "--live") {
    const promptText = process.argv.slice(3).join(" ") || "is claude-code the conductor of the swarm?";
    const out = tick("user:emsenn", promptText, {});
    console.log(JSON.stringify({
      subject: out.subject, workers: out.swarm.workers,
      truth: out.swarm.studied.truth, accepted: out.swarm.studied.accepted,
      suitMemory: out.suit.memory.length, suitTokens: out.suit.tokenEstimate
    }, null, 2));
  } else {
    console.log("usage: node lifecycle.mjs --session-start <task> | --session-end <text> | --study <subject> | --swarm <subject> | --live <prompt>");
  }
}
