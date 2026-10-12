import assert from "node:assert/strict";
import test from "node:test";
import { projectAgentSessionReading } from "../src/session-reading.mjs";
test("joins supplied journal projections by session", () => {
  const sources = { operations: { entries: [{ id: "op", session: "a", estimatedTokens: 2, budgetBand: "within" }] }, work: { items: [{ id: "work", session: "a" }] }, messages: { messages: [{ id: "message", session: "a", text: "hello" }], channels: [] }, findings: { findings: [{ id: "finding", session: "a" }], recall: [] }, context: { admissions: [], assessments: [] }, checkpoints: { checkpoints: [] } };
  const reading = projectAgentSessionReading(sources, { session: "a" }, { generatedAt: "2026-08-30T00:00:00.000Z" });
  assert.equal(reading.operations.exact, 1); assert.equal(reading.work.exact, 1); assert.equal(reading.messages.entries[0].preview, "hello"); assert.equal(reading.codomain.ready, true);
});
