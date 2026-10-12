import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { observeNativeUsage } from "../src/native-usage.mjs";

const root = () => mkdtempSync(join(tmpdir(), "codex-native-usage-"));
const row = (timestamp, type, payload) => JSON.stringify({ timestamp, type, payload });
test("native receipts yield exact turn deltas, duration, and a marked subscription allocation estimate", () => {
  const sessionsRoot = root(), directory = join(sessionsRoot, "2026", "07", "26"); mkdirSync(directory, { recursive: true });
  const usage = (input, cached, cacheWrite, output, reasoning, total) => ({ input_tokens: input, cached_input_tokens: cached, cache_write_input_tokens: cacheWrite, output_tokens: output, reasoning_output_tokens: reasoning, total_tokens: total });
  const rate_limits = { primary: { used_percent: 25, window_minutes: 10080, resets_at: 1785628800 }, plan_type: "pro" };
  const lines = [
    row("2026-07-26T00:00:00.000Z", "session_meta", { id: "session-1", source: "vscode" }),
    row("2026-07-26T00:00:01.000Z", "event_msg", { type: "token_count", info: { total_token_usage: usage(100, 80, 7, 10, 2, 117), model_context_window: 1000 }, rate_limits }),
    row("2026-07-26T00:00:02.000Z", "event_msg", { type: "task_started", turn_id: "turn-1" }),
    row("2026-07-26T00:00:02.100Z", "turn_context", { turn_id: "turn-1", model: "gpt-test", effort: "medium" }),
    row("2026-07-26T00:00:03.000Z", "response_item", { type: "custom_tool_call", call_id: "call-1", name: "exec", input: "never retained", status: "completed" }),
    row("2026-07-26T00:00:03.500Z", "response_item", { type: "custom_tool_call_output", call_id: "call-1", output: JSON.stringify({ exit_code: 0, output: "never retained" }) }),
    row("2026-07-26T00:00:02.200Z", "response_item", {type:'function_call',call_id:'tool-1',name:'exec'}),
    row("2026-07-26T00:00:02.300Z", "response_item", {type:'function_call',call_id:'tool-1',name:'exec'}),
    row("2026-07-26T00:00:02.400Z", "response_item", {type:'function_call_output',call_id:'tool-1',output:'not counted'}),
    row("2026-07-26T00:00:04.000Z", "event_msg", { type: "patch_apply_end", turn_id: "turn-1", call_id: "call-1", success: true, status: "completed", changes: { "/workspace/a.mjs": { type: "add", unified_diff: "+code" } } }),
    row("2026-07-26T00:00:05.000Z", "event_msg", { type: "token_count", info: { total_token_usage: usage(160, 120, 11, 25, 5, 188), model_context_window: 1000 }, rate_limits }),
    row("2026-07-26T00:00:07.000Z", "event_msg", { type: "task_complete", turn_id: "turn-1" }),
  ];
  writeFileSync(join(directory, "rollout-session-1.jsonl"), `${lines.join("\n")}\n`);
  const gauges = observeNativeUsage({ sessionsRoot, sessionId: "session-1", turnId: "turn-1" });
  assert.deepEqual(gauges.latestTurn.usage, { input_tokens: 60, cached_input_tokens: 40, cache_write_input_tokens: 4, output_tokens: 15, reasoning_output_tokens: 3, total_tokens: 71 });
  assert.deepEqual(gauges.latestTurn.exclusiveTokenMix, { uncachedInputTokens: 20, cachedInputTokens: 40, ordinaryOutputTokens: 12, reasoningOutputTokens: 3 });
  assert.deepEqual(gauges.latestTurn.wallTime.amount, { numerator: "5000", denominator: "1" });
  assert.equal(gauges.latestTurn.model, "gpt-test");
  assert.equal(gauges.latestTurn.reasoningEffort, "medium");
  assert.deepEqual(gauges.latestTurn.workProducts[0].files, ["/workspace/a.mjs"]);
  assert.match(gauges.latestTurn.workProducts[0].patchDigest, /^ni:\/\/\/sha-256;[A-Za-z0-9_-]{43}$/u);
  assert.deepEqual(gauges.weekly.subscriptionAllocation.amount, { numerator: "600", denominator: "13" });
  assert.equal(gauges.weekly.estimatedCostPerObservedToken.status, "internal-estimate-not-provider-price");
  assert.equal(gauges.latestTurn.estimatedSubscriptionAllocation.status, "internal-estimate-not-provider-price");
  assert.deepEqual(gauges.latestTurn.toolAccounting.counts, { calls: 2, results: 2, missingResults: 0, failures: 0, waits: 0, retries: 0, outputBytes: Buffer.byteLength(JSON.stringify({ exit_code: 0, output: "never retained" })) + Buffer.byteLength("not counted") });
  assert.equal(JSON.stringify(gauges.latestTurn.toolAccounting).includes("never retained"), false);
  assert.equal(gauges.monetaryPricePerToken, "unknown");
  assert.equal(gauges.transcriptRetainedByEnterprise, false);
});

test("an aborted native turn is reported interrupted rather than forever ongoing", () => {
  const sessionsRoot = root(), directory = join(sessionsRoot, "2026", "07", "28"); mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, "rollout-session-3.jsonl"), `${[
    row("2026-07-28T00:00:00.000Z", "session_meta", { id: "session-3" }),
    row("2026-07-28T00:00:01.000Z", "event_msg", { type: "task_started", turn_id: "turn-3" }),
    row("2026-07-28T00:00:02.000Z", "event_msg", { type: "turn_aborted", turn_id: "turn-3" }),
  ].join("\n")}\n`);
  assert.equal(observeNativeUsage({ sessionsRoot, sessionId: "session-3", turnId: "turn-3", includeWeekly: false }).latestTurn.state, "interrupted");
});

test("missing usage retains the last counter and a reset accumulates each observed segment", () => {
  const sessionsRoot = root(), directory = join(sessionsRoot, "2026", "07", "27"); mkdirSync(directory, { recursive: true });
  const usage = (input, cached, cacheWrite, output, reasoning, total) => ({ input_tokens: input, cached_input_tokens: cached, cache_write_input_tokens: cacheWrite, output_tokens: output, reasoning_output_tokens: reasoning, total_tokens: total });
  const lines = [
    row("2026-07-27T00:00:00.000Z", "session_meta", { id: "session-2" }),
    row("2026-07-27T00:00:01.000Z", "event_msg", { type: "token_count", info: { total_token_usage: usage(100, 80, 0, 10, 2, 110) } }),
    row("2026-07-27T00:00:02.000Z", "event_msg", { type: "task_started", turn_id: "turn-2" }),
    row("2026-07-27T00:00:03.000Z", "event_msg", { type: "token_count" }),
    row("2026-07-27T00:00:04.000Z", "event_msg", { type: "token_count", info: { total_token_usage: usage(130, 90, 5, 15, 3, 150) } }),
    row("2026-07-27T00:00:05.000Z", "event_msg", { type: "token_count", info: { total_token_usage: usage(4, 2, 1, 3, 1, 7) } }),
    row("2026-07-27T00:00:06.000Z", "event_msg", { type: "token_count", info: { total_token_usage: usage(9, 5, 2, 7, 2, 16) } }),
    row("2026-07-27T00:00:07.000Z", "event_msg", { type: "task_complete", turn_id: "turn-2" }),
  ];
  writeFileSync(join(directory, "rollout-session-2.jsonl"), `${lines.join("\n")}\n`);
  const gauges = observeNativeUsage({ sessionsRoot, sessionId: "session-2", turnId: "turn-2", includeWeekly: false });
  assert.deepEqual(gauges.latestTurn.usage, { input_tokens: 39, cached_input_tokens: 15, cache_write_input_tokens: 7, output_tokens: 12, reasoning_output_tokens: 3, total_tokens: 56 });
});
