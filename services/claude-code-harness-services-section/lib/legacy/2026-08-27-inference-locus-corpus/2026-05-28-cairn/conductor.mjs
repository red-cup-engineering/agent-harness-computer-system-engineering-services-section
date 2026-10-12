#!/usr/bin/env node
// conductor.mjs -- the choreography entrypoint at the catalog root.
//
// One expensive conductor seat above fungible inferring-enactors. It takes a user prompt, fires the
// conductor's own inferring turn (the enactor is supplied externally -- an LLM endpoint, or for the
// conductor seat, me), descends the INHERITED chain articulating -> predicating -> positing ->
// settling, and settles the activity INTO the substrate as dual-filed EAVT rows (§4). Nothing floats
// outside the tree the proof engine checks: there is no sidecar for state to drift into.

import { appendFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import articulating from "#script/articulating";
import predicating from "#script/predicating";
import positing from "#script/positing";
import settling from "#script/settling";
import prompting from "#script/prompting";
import inferring from "#script/inferring";

const ROOT = dirname(fileURLToPath(import.meta.url));

// slug -> per-thing log path relative to the catalog root (the dual-filing anchors).
const A = "articulating/library/aperiodic-articulation-category";
const CC = `${A}/hacking/library/claude-code`;
const DESC = `${A}/library/aperiodic-articulation-cell/library/potential-aperiodic-articulation-cell/predicating`;
const TPC = `${DESC}/library/transfinite-predication-category/library/transfinite-predication-cell/library/potential-transfinite-predication-cell`;
const SET = `${TPC}/positing/library/scott-continuous-posit-category/library/scott-continuous-posit-cell/library/potential-scott-continuous-posit-cell/settling`;
const LOG = {
  session: `${CC}/prompting/library/session/session.jsonl`,
  prompting: `${CC}/prompting/prompting.jsonl`,
  inferring: `${CC}/inferring/inferring.jsonl`,
  predicating: `${DESC}/predicating.jsonl`,
  positing: `${TPC}/positing/positing.jsonl`,
  settling: `${SET}/settling.jsonl`
};

// One EAVT positing event, dually filed at the e-anchor (session) log and the a-anchor (morphism) log.
function posit(session, attribute, value) {
  const row = { e: session, a: attribute, v: String(value), t: new Date().toISOString() };
  const line = JSON.stringify(row) + "\n";
  appendFileSync(join(ROOT, LOG.session), line);     // subject anchor: the session
  appendFileSync(join(ROOT, LOG[attribute]), line);  // predicate anchor: the morphism
  return row;
}

// The conductor turn. `enactor` is the fungible aperiodic enactor; it returns
// { message, actions, decomposition:{subject,predicate,object}, posit:{value} }.
export function conduct(session, userToken, promptText, enactor, { gate } = {}) {
  if (gate && !gate({ session, userToken, promptText }))
    return { refused: true, reason: "gate refused before any write (budget/placement)" };

  const e = enactor({ input: promptText, state: session }); // one expensive seat fires once
  const rows = [];

  const up = prompting([userToken, promptText]);
  rows.push(posit(session, "prompting", `${up.user}:${up.prompt}`));

  const inf = inferring({ input: promptText, state: session }, e);
  rows.push(posit(session, "inferring", inf.message));

  const cell = articulating([userToken, promptText]);
  const tcell = predicating(cell, e.decomposition);
  rows.push(posit(session, "predicating", `${tcell.subject} ${tcell.predicate} ${tcell.object}`));

  const sccell = positing(tcell, e.posit);
  rows.push(posit(session, "positing", sccell.value));

  const settled = settling(sccell);
  rows.push(posit(session, "settling", settled.value));

  return { refused: false, userPrompt: up, inference: inf, settled, rows };
}

// Demo enactor standing in for the LLM endpoint -- deterministic so the run is reproducible.
function demoEnactor({ input }) {
  return {
    message: `conductor: received "${input}"; settling one claim about it`,
    actions: ["settle-one-claim"],
    decomposition: { subject: "claude-code", predicate: "is-conductor-of", object: "swarm" },
    posit: { value: "true" }
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const promptText = process.argv.slice(2).join(" ") || "is claude-code the conductor?";
  const out = conduct("session-demo", "user:emsenn", promptText, demoEnactor, {
    gate: ({ promptText }) => promptText.length <= 4000 // trivial budget gate; a hook would call this
  });
  console.log(JSON.stringify(out, null, 2));
}
