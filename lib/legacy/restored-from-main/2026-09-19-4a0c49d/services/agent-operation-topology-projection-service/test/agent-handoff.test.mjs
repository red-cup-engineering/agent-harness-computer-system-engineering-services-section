import assert from "node:assert/strict";
import test from "node:test";
import { projectAgentHandoff } from "../src/agent-handoff.mjs";

test("projects a deterministic handoff packet from explicit carriers", () => {
  const input = {
    generatedAt: "2026-08-30T00:00:00.000Z", intent: "consume capability", to: "peer.example", record: true,
    card: { agent: { id: "nog.codex-harness" }, capabilities: { focus: "sites/ops.561.group" }, authority: { canAcceptHandoff: true, safetyEnvelope: "local-package-script" }, surface: { httpPost: "/{process}" } },
    coverage: { gaps: [], coveredTerms: ["consume", "capability"] },
    workSnapshot: { items: [{ id: "work:consume", title: "Consume capability", status: "active" }] },
    evidence: ["provider test"],
  };
  const packet = projectAgentHandoff(input);
  assert.match(packet.id, /^handoff:peer-example:/u);
  assert.equal(packet.work.id, "work:consume");
  assert.deepEqual(packet.controls.map(({ verdict }) => verdict), ["pass", "pass", "pass", "pass", "pass"]);
  assert.equal(projectAgentHandoff(input).id, packet.id);
});
