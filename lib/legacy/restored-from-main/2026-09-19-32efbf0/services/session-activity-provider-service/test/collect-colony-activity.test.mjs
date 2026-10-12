import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { claudeSessionTranscriptDialect } from "@red-cup-engineering/session-transcript-dialects/claude-dialect";
import { codexSessionTranscriptDialect } from "@red-cup-engineering/session-transcript-dialects/codex-dialect";
import { collectColonyActivity } from "../src/collect-colony-activity.mjs";

function claudeFixture(rows) {
  const root = mkdtempSync(join(tmpdir(), "claude-session-pulse-"));
  const path = join(root, "11111111-1111-4111-8111-111111111111.jsonl");
  writeFileSync(path, `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`, "utf8");
  const mtime = new Date("2026-07-30T12:30:00.000Z");
  utimesSync(path, mtime, mtime);
  return root;
}

function codexFixture(rows) {
  const root = mkdtempSync(join(tmpdir(), "codex-session-pulse-"));
  const directory = join(root, "2026", "07", "19");
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, "rollout-test.jsonl"), `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`, "utf8");
  return root;
}

test("Claude: reports only privacy-bounded metadata inside the exact interval", async () => {
  const secret = "DO-NOT-DISCLOSE-TRANSCRIPT-TEXT";
  const rows = [
    { type: "user", timestamp: "2026-07-30T11:59:59.000Z", message: { role: "user", content: secret } },
    { type: "user", timestamp: "2026-07-30T12:01:00.000Z", message: { role: "user", content: secret } },
    { type: "assistant", timestamp: "2026-07-30T12:02:00.000Z", message: { role: "assistant", model: "claude-sonnet-5", content: [{ type: "tool_use", id: "toolu_1", name: "Bash", input: { command: secret } }], stop_reason: "tool_use" } },
    { type: "user", timestamp: "2026-07-30T12:02:05.000Z", message: { role: "user", content: [{ type: "tool_result", tool_use_id: "toolu_1", is_error: false, content: secret }] } },
    { type: "assistant", timestamp: "2026-07-30T12:03:00.000Z", message: { role: "assistant", model: "claude-sonnet-5", content: [{ type: "text", text: secret }], stop_reason: "end_turn" } },
  ];
  const root = claudeFixture(rows);
  const window = { fromExclusive: "2026-07-30T12:00:00.000Z", toInclusive: "2026-07-30T13:00:00.000Z", baseline: false };
  const pulse = await collectColonyActivity(claudeSessionTranscriptDialect, { window, recordedAt: window.toInclusive, sessionRoot: root });
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

test("Claude: zero political counts are not promoted into consequential events", async () => {
  const rows = [
    { type: "assistant", timestamp: "2026-07-30T12:02:00.000Z", message: { role: "assistant", model: "claude-sonnet-5", content: [{ type: "tool_use", id: "toolu_1", name: "Edit", input: {} }], stop_reason: "tool_use" } },
  ];
  const root = claudeFixture(rows);
  const window = { fromExclusive: "2026-07-30T12:00:00.000Z", toInclusive: "2026-07-30T13:00:00.000Z", baseline: false };
  const pulse = await collectColonyActivity(claudeSessionTranscriptDialect, { window, recordedAt: window.toInclusive, sessionRoot: root });
  assert.deepEqual(pulse.events.map((event) => event.domain), ["work"]);
  const work = pulse.events.find((event) => event.domain === "work");
  assert.equal(work.quantities.find((quantity) => quantity.label === "Claude patch-tool invocations").amount, "1");
});

test("Claude: a quiet interval emits no invented work event", async () => {
  const root = mkdtempSync(join(tmpdir(), "claude-session-quiet-"));
  const window = { fromExclusive: "2026-07-30T12:00:00.000Z", toInclusive: "2026-07-30T13:00:00.000Z", baseline: false };
  const pulse = await collectColonyActivity(claudeSessionTranscriptDialect, { window, recordedAt: window.toInclusive, sessionRoot: root });
  assert.deepEqual(pulse.events, []);
});

test("Claude: a missing session store remains an explicit observation failure", async () => {
  const window = { fromExclusive: "2026-07-30T12:00:00.000Z", toInclusive: "2026-07-30T13:00:00.000Z" };
  await assert.rejects(collectColonyActivity(claudeSessionTranscriptDialect, { window, sessionRoot: join(tmpdir(), "not-a-claude-session-store") }), /unavailable/u);
});

test("Claude: unsupportedDomains and the envelope shape match the colony's ColonyActivityPulseEnvelope contract", async () => {
  const root = mkdtempSync(join(tmpdir(), "claude-session-shape-"));
  const window = { fromExclusive: "2026-07-30T12:00:00.000Z", toInclusive: "2026-07-30T13:00:00.000Z" };
  const pulse = await collectColonyActivity(claudeSessionTranscriptDialect, { window, recordedAt: window.toInclusive, sessionRoot: root });
  assert.equal(pulse.type, "ColonyActivityPulseEnvelope");
  assert.equal(pulse.colonyActor, "urn:ame:bare-cedar-fog-colony");
  assert.equal(pulse.providerActor, "urn:ame:claude-session-activity-provider:pulse-provider");
  assert.equal(pulse.unsupportedDomains.includes("operations"), true);
  assert.deepEqual(pulse.window, window);
});

test("Codex: reports only privacy-bounded metadata inside the exact interval", async () => {
  const secret = "DO-NOT-DISCLOSE-TRANSCRIPT-TEXT";
  const rows = [
    { timestamp: "2026-07-20T01:59:59.000Z", type: "event_msg", payload: { type: "user_message", message: secret } },
    { timestamp: "2026-07-20T02:01:00.000Z", type: "event_msg", payload: { type: "user_message", message: secret } },
    { timestamp: "2026-07-20T02:02:00.000Z", type: "response_item", payload: { type: "custom_tool_call", name: "exec", input: secret } },
    { timestamp: "2026-07-20T02:03:00.000Z", type: "event_msg", payload: { type: "patch_apply_end", output: secret } },
    { timestamp: "2026-07-20T02:04:00.000Z", type: "event_msg", payload: { type: "task_complete" } },
  ];
  const root = codexFixture(rows);
  const window = { fromExclusive: "2026-07-20T02:00:00.000Z", toInclusive: "2026-07-20T03:00:00.000Z", baseline: false };
  const pulse = await collectColonyActivity(codexSessionTranscriptDialect, { window, recordedAt: window.toInclusive, sessionRoot: root });
  assert.equal(pulse.events.length, 2);
  assert.equal(pulse.events.find((event) => event.domain === "politics").quantities[0].amount, "1");
  assert.equal(pulse.events.find((event) => event.domain === "work").quantities.find((quantity) => quantity.label === "Codex tool invocations").amount, "1");
  assert.equal(JSON.stringify(pulse).includes(secret), false);
  assert.match(pulse.events.find((event) => event.domain === "politics").summary, /not automatically classified/u);
  assert.match(pulse.refusals.find((refusal) => refusal.domain === "work").reason, /cannot classify Leader corrections/u);
});

test("Codex: zero political and runtime counts are not promoted into consequential events", async () => {
  const rows = [
    { timestamp: "2026-07-20T02:01:00.000Z", type: "response_item", payload: { type: "custom_tool_call", name: "exec" } },
    { timestamp: "2026-07-20T02:02:00.000Z", type: "event_msg", payload: { type: "patch_apply_end" } },
  ];
  const root = codexFixture(rows);
  const window = { fromExclusive: "2026-07-20T02:00:00.000Z", toInclusive: "2026-07-20T03:00:00.000Z", baseline: false };
  const pulse = await collectColonyActivity(codexSessionTranscriptDialect, { window, recordedAt: window.toInclusive, sessionRoot: root });
  assert.deepEqual(pulse.events.map((event) => event.domain), ["work"]);
});

test("Codex: a quiet interval emits no invented work event", async () => {
  const root = mkdtempSync(join(tmpdir(), "codex-session-quiet-"));
  const window = { fromExclusive: "2026-07-20T02:00:00.000Z", toInclusive: "2026-07-20T03:00:00.000Z", baseline: false };
  const pulse = await collectColonyActivity(codexSessionTranscriptDialect, { window, recordedAt: window.toInclusive, sessionRoot: root });
  assert.deepEqual(pulse.events, []);
});

test("Codex: a context compaction is reported as an operations event, unlike Claude", async () => {
  const rows = [
    { timestamp: "2026-07-20T02:02:00.000Z", type: "event_msg", payload: { type: "context_compacted" } },
  ];
  const root = codexFixture(rows);
  const window = { fromExclusive: "2026-07-20T02:00:00.000Z", toInclusive: "2026-07-20T03:00:00.000Z" };
  const pulse = await collectColonyActivity(codexSessionTranscriptDialect, { window, recordedAt: window.toInclusive, sessionRoot: root });
  const operations = pulse.events.find((event) => event.domain === "operations");
  assert.ok(operations, "expected an operations event for a Codex context compaction");
  assert.equal(operations.quantities[0].amount, "1");
  assert.equal(pulse.unsupportedDomains.includes("operations"), false);
});

test("Codex: unsupportedDomains and the envelope shape match the colony's ColonyActivityPulseEnvelope contract", async () => {
  const root = mkdtempSync(join(tmpdir(), "codex-session-shape-"));
  const window = { fromExclusive: "2026-07-20T02:00:00.000Z", toInclusive: "2026-07-20T03:00:00.000Z" };
  const pulse = await collectColonyActivity(codexSessionTranscriptDialect, { window, recordedAt: window.toInclusive, sessionRoot: root });
  assert.equal(pulse.type, "ColonyActivityPulseEnvelope");
  assert.equal(pulse.colonyActor, "urn:ame:bare-cedar-fog-colony");
  assert.equal(pulse.providerActor, "urn:ame:codex-session-activity-provider:pulse-provider");
  assert.equal(pulse.unsupportedDomains.includes("operations"), false);
  assert.deepEqual(pulse.window, window);
});
