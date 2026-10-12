import assert from "node:assert/strict";
import test from "node:test";

import { projectAgentOperationTopology } from "../src/agent-operation-topology.mjs";

const input = {
  harness: { id: "test", agent: "test", channels: ["stdio"] },
  run: { id: "run", stop: "final-answer", settled: true, finalAnswer: "done", turns: 1 },
  events: [
    { id: "request", predicate: "requested", charge: "active" },
    { id: "respond", predicate: "responded", charge: "potential" },
  ],
  causality: [["request", "respond"]],
  conflict: [],
  strategy: { plays: [[], ["request"], ["request", "respond"]] },
};

test("projects and witnesses a well-formed agent event topology", () => {
  const result = projectAgentOperationTopology(input);
  assert.equal(result.strategy.report.wellFormed, true);
  assert.deepEqual(result.witness, { eventCount: 2, causalEdgeCount: 1, conflictEdgeCount: 0, admittedPlayCount: 3 });
  assert.equal(result.arena.events[0].polarity, "negative");
});

test("refuses cyclic causality", () => {
  assert.throws(() => projectAgentOperationTopology({ ...input, causality: [["request", "respond"], ["respond", "request"]] }), /acyclic/u);
});
