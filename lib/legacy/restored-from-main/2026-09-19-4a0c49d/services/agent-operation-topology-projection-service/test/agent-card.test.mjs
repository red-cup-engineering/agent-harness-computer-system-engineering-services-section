import assert from "node:assert/strict";
import test from "node:test";

import { projectAgentCard } from "../src/agent-card.mjs";

test("projects an agent card from explicit carriers without acquiring them", () => {
  const result = projectAgentCard({ id: "agent", name: "Agent", packageName: "pkg", role: "worker", operations: ["b", "a"], harness: { channels: ["stdio"] }, readiness: { summary: { score: 50, present: 1, partial: 1, missing: 0 }, criteria: [{}, {}], nextWork: ["next"] }, authority: {}, generatedAt: "2026-08-30T00:00:00.000Z" });
  assert.deepEqual(result.capabilities.operations, ["a", "b"]);
  assert.deepEqual(result.witness, { executableCount: 2, channelCount: 1, readinessCriteria: 2, capabilitySearchIncluded: false });
});
