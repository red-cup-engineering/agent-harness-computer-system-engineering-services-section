import { createGraph, isAcyclic } from "@red-cup-engineering/graph-data-service";

function record(value, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${label} must be an object`);
  return value;
}

function text(value, label) {
  if (typeof value !== "string" || value.trim() === "") throw new TypeError(`${label} must be non-empty text`);
  return value.trim();
}

function texts(value, label) {
  if (!Array.isArray(value)) throw new TypeError(`${label} must be an array`);
  return Object.freeze(value.map((item, index) => text(item, `${label}[${index}]`)));
}

function pairs(value, label, eventIds) {
  if (!Array.isArray(value)) throw new TypeError(`${label} must be an array`);
  return Object.freeze(value.map((pair, index) => {
    if (!Array.isArray(pair) || pair.length !== 2) throw new TypeError(`${label}[${index}] must be a pair`);
    const from = text(pair[0], `${label}[${index}][0]`);
    const to = text(pair[1], `${label}[${index}][1]`);
    if (!eventIds.has(from) || !eventIds.has(to)) throw new TypeError(`${label}[${index}] references an unknown event`);
    return Object.freeze([from, to]);
  }));
}

function cyclic(eventIds, causality) {
  const graph = createGraph({ nodes: [...eventIds].map((id) => ({ id })) });
  for (const [from, to] of causality) graph.addEdge({ from, to });
  return !isAcyclic(graph);
}

function admittedPlay(play, index, eventIds, causalKeys) {
  const moves = texts(play, `strategy.plays[${index}]`);
  const unknown = moves.filter((move) => !eventIds.has(move));
  const noncausal = moves.slice(1).flatMap((move, at) => causalKeys.has(`${moves[at]}\u0000${move}`) ? [] : [[moves[at], move]]);
  return Object.freeze({ moves, admitted: unknown.length === 0 && noncausal.length === 0, unknown: Object.freeze(unknown), noncausal: Object.freeze(noncausal.map(Object.freeze)) });
}

/** Project one explicit agent declaration; no registry, filesystem, or process state is acquired. */
export function projectAgentOperationTopology(input) {
  record(input, "input");
  const harness = record(input.harness, "harness");
  const run = record(input.run, "run");
  const events = (input.events ?? []).map((candidate, index) => {
    record(candidate, `events[${index}]`);
    const charge = candidate.charge === "active" || candidate.charge === "potential" ? candidate.charge : null;
    if (charge === null) throw new TypeError(`events[${index}].charge must be active or potential`);
    return Object.freeze({ id: text(candidate.id, `events[${index}].id`), predicate: text(candidate.predicate, `events[${index}].predicate`), charge, polarity: charge === "active" ? "negative" : "positive" });
  });
  const eventIds = new Set(events.map(({ id }) => id));
  if (eventIds.size !== events.length) throw new TypeError("event ids must be unique");
  const causality = pairs(input.causality ?? [], "causality", eventIds);
  if (cyclic(eventIds, causality)) throw new TypeError("causality must be acyclic");
  const conflict = pairs(input.conflict ?? [], "conflict", eventIds);
  const causalKeys = new Set(causality.map(([from, to]) => `${from}\u0000${to}`));
  const plays = (input.strategy?.plays ?? []).map((play, index) => admittedPlay(play, index, eventIds, causalKeys));
  const invalidPlays = plays.filter(({ admitted }) => !admitted);
  const settled = run.settled === true;
  return Object.freeze({
    kind: "agent-operation-topology",
    harness: Object.freeze({
      term: Object.freeze(["agent-harness", text(harness.id, "harness.id")]),
      agent: text(harness.agent, "harness.agent"),
      channels: texts(harness.channels ?? [], "harness.channels"),
      utterances: Number.isSafeInteger(harness.utterances) && harness.utterances >= 0 ? harness.utterances : 0,
    }),
    loop: Object.freeze({
      id: text(run.id, "run.id"),
      stop: text(run.stop ?? "running", "run.stop"),
      settled,
      regime: text(run.regime ?? (settled ? "settled" : "running"), "run.regime"),
      turns: Number.isSafeInteger(run.turns) && run.turns >= 0 ? run.turns : 0,
      finalAnswer: settled ? text(run.finalAnswer, "run.finalAnswer") : null,
    }),
    arena: Object.freeze({ kind: "agent-event-structure", events: Object.freeze(events), causality, conflict }),
    strategy: Object.freeze({
      kind: "agent-strategy",
      plays: Object.freeze(plays.map(({ moves }) => moves)),
      report: Object.freeze({ wellFormed: invalidPlays.length === 0, playCount: plays.length, invalidPlays: Object.freeze(invalidPlays) }),
      flow: Object.freeze({
        kind: "agent-strategy-flow",
        challenge: events.filter(({ polarity }) => polarity === "negative").length,
        skill: events.filter(({ polarity }) => polarity === "positive").length,
        reason: invalidPlays.length === 0 ? null : "strategy contains a noncausal or unknown move",
        mismatch: invalidPlays.length,
      }),
    }),
    witness: Object.freeze({ eventCount: events.length, causalEdgeCount: causality.length, conflictEdgeCount: conflict.length, admittedPlayCount: plays.length - invalidPlays.length }),
  });
}
