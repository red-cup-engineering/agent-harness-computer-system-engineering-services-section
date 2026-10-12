import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { cumulativeCounterDelta, cumulativeTokenDelta, findSessionFiles, scanSessionFiles } from "../src/shared.mjs";
import { codexSessionTranscriptDialect as dialect } from "../src/codex-dialect.mjs";

test("enumerateSessionFiles reads the day-sharded layout, padded across zones", () => {
  const root = mkdtempSync(join(tmpdir(), "codex-dialect-"));
  const directory = join(root, "2026", "07", "29");
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, "rollout.jsonl"), "");
  const files = dialect.enumerateSessionFiles(root, new Date("2026-07-29T08:00:00.000Z"), new Date("2026-07-29T09:00:00.000Z"));
  assert.deepEqual(files, [join(directory, "rollout.jsonl")]);
});

test("rowKind classifies turn-context, tool-call, and named event_msg payloads", () => {
  assert.equal(dialect.rowKind({ type: "turn_context", payload: { model: "gpt-5.6-sol" } }), "turn-context");
  assert.equal(dialect.rowKind({ type: "response_item", payload: { type: "custom_tool_call", name: "exec" } }), "tool-call");
  assert.equal(dialect.rowKind({ type: "response_item", payload: { type: "function_call", name: "spawn_agent" } }), "tool-call");
  assert.equal(dialect.rowKind({ type: "event_msg", payload: { type: "user_message" } }), "user-message");
  assert.equal(dialect.rowKind({ type: "event_msg", payload: { type: "task_complete" } }), "task-complete");
  assert.equal(dialect.rowKind({ type: "event_msg", payload: { type: "patch_apply_end" } }), "patch-apply-end");
  assert.equal(dialect.rowKind({ type: "event_msg", payload: { type: "web_search_end" } }), "web-search-end");
  assert.equal(dialect.rowKind({ type: "event_msg", payload: { type: "context_compacted" } }), "context-compacted");
  assert.equal(dialect.rowKind({ type: "event_msg", payload: { type: "thread_goal_updated" } }), "thread-goal-updated");
  assert.equal(dialect.rowKind({ type: "event_msg", payload: { type: "token_count" } }), "token-count");
  assert.equal(dialect.rowKind({ type: "event_msg", payload: { type: "anything_else" } }), "other");
});

test("modelOf and tokenUsageOf read only their own row shapes", () => {
  assert.equal(dialect.modelOf({ type: "turn_context", payload: { model: "gpt-5.6-sol" } }), "gpt-5.6-sol");
  assert.equal(dialect.modelOf({ type: "event_msg", payload: {} }), null);
  const usage = dialect.tokenUsageOf({ type: "event_msg", payload: { type: "token_count", info: { total_token_usage: { input_tokens: 100, cached_input_tokens: 80, output_tokens: 10, reasoning_output_tokens: 5 } } } });
  assert.deepEqual(usage, { input: 100, cached: 80, output: 10, reasoning: 5 });
  assert.deepEqual(dialect.nativeTokenUsageOf({ type: "event_msg", payload: { type: "token_count", info: { total_token_usage: { input_tokens: 100, cached_input_tokens: 80, cache_write_input_tokens: 7, output_tokens: 10, reasoning_output_tokens: 5, total_tokens: 117 } } } }), { input_tokens: 100, cached_input_tokens: 80, cache_write_input_tokens: 7, output_tokens: 10, reasoning_output_tokens: 5, total_tokens: 117 });
  assert.equal(dialect.nativeTokenUsageOf({ type: "event_msg", payload: { type: "token_count" } }), null);
  assert.equal(dialect.tokenUsageOf({ type: "turn_context", payload: {} }), null);
});

test("toolCallsOf and the singular accessors agree, and never surface tool arguments", () => {
  const secret = "DO-NOT-DISCLOSE";
  const row = { type: "response_item", payload: { type: "custom_tool_call", name: "exec", call_id: "call-1", input: secret, status: "completed" } };
  const calls = dialect.toolCallsOf(row);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], { name: "exec", transport: "custom_tool_call", callId: "call-1", status: "completed" });
  assert.equal(dialect.toolNameOf(row), "exec");
  assert.equal(dialect.toolTransportOf(row), "custom_tool_call");
  assert.equal(dialect.callIdOf(row), "call-1");
  assert.equal(JSON.stringify(calls).includes(secret), false);
});

test("isToolCallRow is structural even when a tool call names nothing usable, matching sensor.mjs's original tolerance", () => {
  const nameless = { type: "response_item", payload: { type: "custom_tool_call", name: "" } };
  assert.equal(dialect.isToolCallRow(nameless), true);
  assert.deepEqual(dialect.toolCallsOf(nameless), []);
  assert.equal(dialect.toolNameOf(nameless), null);
  assert.equal(dialect.rowKind(nameless), "tool-call");
});

test("toolClassPatterns classify by tool name only", () => {
  assert.match("mcp__inference-work-lot-market__contract_inference_work", dialect.toolClassPatterns.market);
  assert.match("apply_patch", dialect.toolClassPatterns.patch);
  assert.match("exec_command", dialect.toolClassPatterns.exec);
  assert.doesNotMatch("exec_command", dialect.toolClassPatterns.patch);
});

test("safeMetadata never carries message text or tool input/output", () => {
  const secret = "DO-NOT-DISCLOSE-TRANSCRIPT-TEXT";
  const row = { timestamp: "2026-07-29T08:01:00.000Z", type: "event_msg", payload: { type: "user_message", message: secret } };
  const metadata = dialect.safeMetadata(row);
  assert.deepEqual(metadata, { timestamp: "2026-07-29T08:01:00.000Z", type: "event_msg", payloadType: "user_message", role: null, name: null });
  assert.equal(JSON.stringify(metadata).includes(secret), false);
});

test("providerCells and recordTypes are the exact strings modeled-union-dimension validates", () => {
  assert.equal(dialect.providerCells.toolObservation, "urn:ame:codex-session-activity-provider:tool-observation");
  assert.equal(dialect.recordTypes.toolObservation, "CodexToolInvocationObservation");
  assert.equal(dialect.recordTypes.toolObservationReceipt, "CodexToolInvocationObservationReceipt");
});

test("cumulative token deltas are exclusive and treat a lower counter as a reset", () => {
  assert.deepEqual(cumulativeTokenDelta(
    { input: 100, cached: 80, output: 30, reasoning: 10 },
    { input: 20, cached: 5, output: 12, reasoning: 4 },
  ), { uncachedInput: 15, cachedInput: 5, output: 8, reasoning: 4, total: 32 });
});

test("cumulative counter deltas preserve each native provider counter across a reset", () => {
  assert.deepEqual(cumulativeCounterDelta(
    { input_tokens: 100, cached_input_tokens: 80, cache_write_input_tokens: 7, output_tokens: 30, reasoning_output_tokens: 10, total_tokens: 137 },
    { input_tokens: 4, cached_input_tokens: 2, cache_write_input_tokens: 1, output_tokens: 3, reasoning_output_tokens: 1, total_tokens: 7 },
    ["input_tokens", "cached_input_tokens", "cache_write_input_tokens", "output_tokens", "reasoning_output_tokens", "total_tokens"],
  ), { input_tokens: 4, cached_input_tokens: 2, cache_write_input_tokens: 1, output_tokens: 3, reasoning_output_tokens: 1, total_tokens: 7 });
});

test("explicit native file scans validate paths, identify bytes, and retain no malformed row", () => {
  const root = mkdtempSync(join(tmpdir(), "codex-explicit-scan-"));
  const directory = join(root, "2026", "09", "06");
  mkdirSync(directory, { recursive: true });
  const selected = join(directory, "rollout-session-a.jsonl");
  const ignored = join(directory, "rollout-session-b.jsonl");
  writeFileSync(selected, '{"timestamp":"2026-09-06T01:00:00.000Z","type":"event_msg"}\nnot-json\n');
  writeFileSync(ignored, '{"timestamp":"2026-09-06T01:00:00.000Z","type":"event_msg"}\n');
  const files = findSessionFiles(dialect, { sessionRoot: root, matchFile: (path) => path.endsWith("session-a.jsonl") });
  const rows = [];
  const scan = scanSessionFiles(dialect, { sessionRoot: root, files, label: "test scan", identifyFile: () => "opaque-receipt", visit: (row) => rows.push(row) });
  assert.deepEqual(scan.files, [selected]);
  assert.equal(scan.receipts.get(selected), "opaque-receipt");
  assert.equal(scan.malformedRows, 1);
  assert.equal(rows.length, 1);
  const outside = join(tmpdir(), "outside-session.jsonl"); writeFileSync(outside, "");
  assert.throws(() => scanSessionFiles(dialect, { sessionRoot: root, files: [outside], label: "test scan", visit() {} }), /outside/u);
  const linked = join(directory, "linked.jsonl"); symlinkSync(selected, linked);
  assert.throws(() => scanSessionFiles(dialect, { sessionRoot: root, files: [linked], label: "test scan", visit() {} }), /outside/u);
  const externalDirectory = mkdtempSync(join(tmpdir(), "codex-symlink-escape-"));
  const externalFile = join(externalDirectory, "outside.jsonl"); writeFileSync(externalFile, "");
  const linkedDirectory = join(root, "linked-directory"); symlinkSync(externalDirectory, linkedDirectory);
  assert.throws(() => scanSessionFiles(dialect, { sessionRoot: root, files: [join(linkedDirectory, "outside.jsonl")], label: "test scan", visit() {} }), /outside/u);
});
