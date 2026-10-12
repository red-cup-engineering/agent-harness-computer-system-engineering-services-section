import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { claudeSessionTranscriptDialect } from "@red-cup-engineering/session-transcript-dialects/claude-dialect";
import { codexSessionTranscriptDialect } from "@red-cup-engineering/session-transcript-dialects/codex-dialect";
import { observeToolInvocations } from "../src/observe-tool-invocations.mjs";

function claudeFixture(rows) {
  const root = mkdtempSync(join(tmpdir(), "claude-tool-observation-"));
  const path = join(root, "11111111-1111-4111-8111-111111111111.jsonl");
  const lines = rows.map((row) => (typeof row === "string" ? row : JSON.stringify(row)));
  writeFileSync(path, `${lines.join("\n")}\n`, "utf8");
  const mtime = new Date("2026-07-30T12:30:00.000Z");
  utimesSync(path, mtime, mtime);
  return root;
}

function codexFixture(rows) {
  const root = mkdtempSync(join(tmpdir(), "codex-tool-observation-"));
  const directory = join(root, "2026", "07", "29");
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, "rollout.jsonl"), `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`, "utf8");
  return root;
}

const claudeWindow = { fromExclusive: "2026-07-30T12:00:00.000Z", toInclusive: "2026-07-30T13:00:00.000Z" };
const codexWindow = { fromExclusive: "2026-07-29T08:00:00.000Z", toInclusive: "2026-07-29T09:00:00.000Z" };

test("Claude: observes every tool_use block without disclosing content or call ids, defaulting runtimeStatus to requested", async () => {
  const secret = "DO-NOT-DISCLOSE-PROMPT-ARGUMENT-OR-OUTPUT";
  const root = claudeFixture([
    {
      type: "assistant",
      timestamp: "2026-07-30T12:02:00.000Z",
      message: {
        role: "assistant",
        content: [
          { type: "text", text: secret },
          { type: "tool_use", id: "private-call-one", name: "Bash", input: { command: secret } },
          { type: "tool_use", id: "private-call-two", name: "Edit", input: { file_path: secret } },
        ],
      },
    },
    { type: "user", timestamp: "2026-07-30T12:02:05.000Z", message: { role: "user", content: [{ type: "tool_result", tool_use_id: "private-call-one", content: secret }] } },
  ]);
  const receipt = await observeToolInvocations(claudeSessionTranscriptDialect, { window: claudeWindow, recordedAt: claudeWindow.toInclusive, sessionRoot: root });
  assert.equal(receipt.type, "ClaudeToolInvocationObservationReceipt");
  assert.equal(receipt.observations.length, 2);
  assert.deepEqual(receipt.observations.map(({ requestedTool }) => requestedTool.name), ["Bash", "Edit"]);
  assert.equal(receipt.observations[0].actuator.status, "not-bound-by-transcript-observation");
  assert.equal(receipt.observations[0].invocation.runtimeStatus, "requested");
  assert.equal(receipt.authority.execution, false);
  assert.equal(receipt.authority.actuatorBinding, false);
  const serialized = JSON.stringify(receipt);
  assert.equal(serialized.includes(secret), false);
  assert.equal(serialized.includes("private-call-one"), false);
  assert.equal(serialized.includes("private-call-two"), false);
});

test("Claude: uses the exact open-closed observation interval", async () => {
  const row = (timestamp, id) => ({ type: "assistant", timestamp, message: { role: "assistant", content: [{ type: "tool_use", id, name: "Bash", input: {} }] } });
  const root = claudeFixture([
    row(claudeWindow.fromExclusive, "excluded-at-start"),
    row(claudeWindow.toInclusive, "included-at-end"),
    row("2026-07-30T13:00:00.001Z", "excluded-after-end"),
  ]);
  const receipt = await observeToolInvocations(claudeSessionTranscriptDialect, { window: claudeWindow, sessionRoot: root });
  assert.equal(receipt.observations.length, 1);
});

test("Claude: retains malformed transcript rows as a bounded refusal", async () => {
  const root = claudeFixture([
    "{malformed-json",
    { type: "assistant", timestamp: "2026-07-30T12:10:00.000Z", message: { role: "assistant", content: [{ type: "tool_use", id: "valid", name: "Bash", input: {} }] } },
  ]);
  const receipt = await observeToolInvocations(claudeSessionTranscriptDialect, { window: claudeWindow, sessionRoot: root });
  assert.equal(receipt.observations.length, 1);
  assert.deepEqual(receipt.refusals.map(({ code }) => code), ["malformed-transcript-row-excluded"]);
});

test("Claude: a missing session store remains an explicit observation failure", async () => {
  await assert.rejects(observeToolInvocations(claudeSessionTranscriptDialect, { window: claudeWindow, sessionRoot: join(tmpdir(), "not-a-claude-session-store") }), /unavailable/u);
});

test("Codex: projects exact tool dispatch as an observation carrier without transcript or actuator disclosure, carrying the native runtimeStatus", async () => {
  const secret = "DO-NOT-DISCLOSE-PROMPT-OR-TOOL-INPUT";
  const root = codexFixture([
    { timestamp: "2026-07-29T08:01:00.000Z", type: "response_item", payload: { type: "custom_tool_call", name: "exec", call_id: "private-call-id", input: secret, status: "completed" } },
    { timestamp: "2026-07-29T08:02:00.000Z", type: "response_item", payload: { type: "function_call", name: "spawn_agent", call_id: "private-agent-call", arguments: secret } },
    { timestamp: "2026-07-29T08:03:00.000Z", type: "event_msg", payload: { type: "patch_apply_end", stdout: secret } },
  ]);
  const receipt = await observeToolInvocations(codexSessionTranscriptDialect, { window: codexWindow, recordedAt: codexWindow.toInclusive, sessionRoot: root });
  assert.equal(receipt.type, "CodexToolInvocationObservationReceipt");
  assert.equal(receipt.observations.length, 2);
  assert.deepEqual(receipt.observations.map(({ requestedTool }) => requestedTool.name), ["exec", "spawn_agent"]);
  assert.equal(receipt.observations[0].actuator.status, "not-bound-by-transcript-observation");
  assert.equal(receipt.observations[0].invocation.runtimeStatus, "completed");
  assert.equal(receipt.observations[1].invocation.runtimeStatus, "not-reported");
  assert.equal(receipt.authority.execution, false);
  assert.equal(receipt.authority.restrictedMove, false);
  assert.equal(JSON.stringify(receipt).includes(secret), false);
  assert.equal(JSON.stringify(receipt).includes("private-call-id"), false);
});

test("Codex: a missing session store remains an explicit observation failure", async () => {
  await assert.rejects(observeToolInvocations(codexSessionTranscriptDialect, { window: codexWindow, sessionRoot: join(tmpdir(), "not-a-codex-session-store") }), /unavailable/u);
});
