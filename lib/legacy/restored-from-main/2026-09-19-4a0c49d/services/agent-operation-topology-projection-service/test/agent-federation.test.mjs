import assert from "node:assert/strict";
import test from "node:test";
import { projectAgentFederation } from "../src/agent-federation.mjs";

test("projects declared peers and counts explicit handoff witnesses", () => {
  const result = projectAgentFederation({ local: { agent: { id: "local" } }, peers: ["https://peer.example"], ledger: { log: "log", state: "state", entries: [{ predicate: "agent.handed-off" }] }, generatedAt: "2026-08-30T00:00:00.000Z" });
  assert.equal(result.topology, "declared-peers");
  assert.equal(result.carrier.members.length, 2);
  assert.equal(result.ledger.handoffWitnesses, 1);
});
