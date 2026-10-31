import assert from "node:assert/strict";
import { mkdtempSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { collectClaudeSessionActivity } from "../src/collect-colony-activity.mjs";

function fixture(rows) {
  const root = mkdtempSync(join(tmpdir(), "claude-session-pulse-"));
  const path = join(root, "11111111-1111-4111-8111-111111111111.jsonl");
  writeFileSync(path, `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`, "utf8");
  const mtime = new Date("2026-07-30T12:30:00.000Z");
  utimesSync(path, mtime, mtime);
  return root;
}

test("reports only privacy-bounded metadata inside the exact interval", async () => {
  const secret = "DO-NOT-DISCLOSE-TRANSCRIPT-TEXT";
  const rows = [
    { type: "user", timestamp: "2026-07-30T11:59:59.000Z", message: { role: "user", content: secret } },
    { type: "user", timestamp: "2026-07-30T12:01:00.000Z", message: { role: "user", content: secret } },
    { type: "assistant", timestamp: "2026-07-30T12:02:00.000Z", message: { role: "assistant", model: "claude-sonnet-5", content: [{ type: "tool_use", id: "toolu_1", name: "Bash", input: { command: secret } }], stop_reason: "tool_use" } },
    { type: "user", timestamp: "2026-07-30T12:02:05.000Z", message: { role: "user", content: [{ type: "tool_result", tool_use_id: "toolu_1", is_error: false, content: secret }] } },
    { type: "assistant", timestamp: "2026-07-30T12:03:00.000Z", message: { role: "assistant", model: "claude-sonnet-5", content: [{ type: "text", text: secret }], stop_reason: "end_turn" } },
  ];
  const root = fixture(rows);
  const window = { fromExclusive: "2026-07-30T12:00:00.000Z", toInclusive: "2026-07-30T13:00:00.000Z", baseline: false };
  const pulse = await collectClaudeSessionActivity({ window, recordedAt: window.toInclusive, sessionRoot: root });
  assert.equal(pulse.events.length, 2);
  const work = pulse.events.find((event) => event.domain === "work");
  assert.equal(work.quantities.find((quantity) => quantity.label === "Claude sessions active").amount, "1");
  assert.equal(work.quantities.find((quantity) => quantity.label === "Claude turns completed").amount, "1");
  assert.equal(work.quantities.find((quantity) => quantity.label === "Claude tool invocations").amount, "1");
  assert.equal(work.quantities.find((quantity) => quantity.label === "Claude patch-tool invocations").amount, "0");
  const politics = pulse.events.find((event) => event.domain === "politics");
  assert.equal(politics.quantities[0].amount, "1");
  assert.match(politics.summary, /not automatically classified/u);
  assert.match(pulse.refusals.find((refusal) => refusal.domain === "work").reason, /cannot classify Leader corrections/u);
  assert.equal(JSON.stringify(pulse).includes(secret), false);
});

test("zero political counts are not promoted into consequential events", async () => {
  const rows = [
    { type: "assistant", timestamp: "2026-07-30T12:02:00.000Z", message: { role: "assistant", model: "claude-sonnet-5", content: [{ type: "tool_use", id: "toolu_1", name: "Edit", input: {} }], stop_reason: "tool_use" } },
  ];
  const root = fixture(rows);
  const window = { fromExclusive: "2026-07-30T12:00:00.000Z", toInclusive: "2026-07-30T13:00:00.000Z", baseline: false };
  const pulse = await collectClaudeSessionActivity({ window, recordedAt: window.toInclusive, sessionRoot: root });
  assert.deepEqual(pulse.events.map((event) => event.domain), ["work"]);
  const work = pulse.events.find((event) => event.domain === "work");
  assert.equal(work.quantities.find((quantity) => quantity.label === "Claude patch-tool invocations").amount, "1");
});

test("a quiet interval emits no invented work event", async () => {
  const root = mkdtempSync(join(tmpdir(), "claude-session-quiet-"));
  const window = { fromExclusive: "2026-07-30T12:00:00.000Z", toInclusive: "2026-07-30T13:00:00.000Z", baseline: false };
  const pulse = await collectClaudeSessionActivity({ window, recordedAt: window.toInclusive, sessionRoot: root });
  assert.deepEqual(pulse.events, []);
});

test("a missing session store remains an explicit observation failure", async () => {
  const window = { fromExclusive: "2026-07-30T12:00:00.000Z", toInclusive: "2026-07-30T13:00:00.000Z" };
  await assert.rejects(collectClaudeSessionActivity({ window, sessionRoot: join(tmpdir(), "not-a-claude-session-store") }), /unavailable/u);
});

test("unsupportedDomains and the envelope shape match the colony's ColonyActivityPulseEnvelope contract", async () => {
  const root = mkdtempSync(join(tmpdir(), "claude-session-shape-"));
  const window = { fromExclusive: "2026-07-30T12:00:00.000Z", toInclusive: "2026-07-30T13:00:00.000Z" };
  const pulse = await collectClaudeSessionActivity({ window, recordedAt: window.toInclusive, sessionRoot: root });
  assert.equal(pulse.type, "ColonyActivityPulseEnvelope");
  assert.equal(pulse.colonyActor, "urn:ame:bare-cedar-fog-colony");
  assert.equal(pulse.providerActor, "urn:ame:claude-session-activity-provider:pulse-provider");
  assert.equal(pulse.unsupportedDomains.includes("operations"), true);
  assert.deepEqual(pulse.window, window);
});
