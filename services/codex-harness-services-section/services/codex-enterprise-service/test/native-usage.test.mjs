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
  const usage = (input, cached, output, reasoning) => ({ input_tokens: input, cached_input_tokens: cached, cache_write_input_tokens: 0, output_tokens: output, reasoning_output_tokens: reasoning, total_tokens: input + output });
  const rate_limits = { primary: { used_percent: 25, window_minutes: 10080, resets_at: 1785628800 }, plan_type: "pro" };
  const lines = [
    row("2026-07-26T00:00:00.000Z", "session_meta", { id: "session-1", source: "vscode" }),
    row("2026-07-26T00:00:01.000Z", "event_msg", { type: "token_count", info: { total_token_usage: usage(100, 80, 10, 2), model_context_window: 1000 }, rate_limits }),
    row("2026-07-26T00:00:02.000Z", "event_msg", { type: "task_started", turn_id: "turn-1" }),
    row("2026-07-26T00:00:02.100Z", "turn_context", { turn_id: "turn-1", model: "gpt-test", effort: "medium" }),
    row("2026-07-26T00:00:04.000Z", "event_msg", { type: "patch_apply_end", turn_id: "turn-1", call_id: "call-1", success: true, status: "completed", changes: { "/workspace/a.mjs": { type: "add", unified_diff: "+code" } } }),
    row("2026-07-26T00:00:05.000Z", "event_msg", { type: "token_count", info: { total_token_usage: usage(160, 120, 25, 5), model_context_window: 1000 }, rate_limits }),
    row("2026-07-26T00:00:07.000Z", "event_msg", { type: "task_complete", turn_id: "turn-1" }),
  ];
  writeFileSync(join(directory, "rollout-session-1.jsonl"), `${lines.join("\n")}\n`);
  const gauges = observeNativeUsage({ sessionsRoot, sessionId: "session-1", turnId: "turn-1" });
  assert.deepEqual(gauges.latestTurn.usage, { input_tokens: 60, cached_input_tokens: 40, cache_write_input_tokens: 0, output_tokens: 15, reasoning_output_tokens: 3, total_tokens: 75 });
  assert.deepEqual(gauges.latestTurn.exclusiveTokenMix, { uncachedInputTokens: 20, cachedInputTokens: 40, ordinaryOutputTokens: 12, reasoningOutputTokens: 3 });
  assert.deepEqual(gauges.latestTurn.wallTime.amount, { numerator: "5000", denominator: "1" });
  assert.equal(gauges.latestTurn.model, "gpt-test");
  assert.equal(gauges.latestTurn.reasoningEffort, "medium");
  assert.deepEqual(gauges.latestTurn.workProducts[0].files, ["/workspace/a.mjs"]);
  assert.match(gauges.latestTurn.workProducts[0].patchDigest, /^sha256:/u);
  assert.deepEqual(gauges.weekly.subscriptionAllocation.amount, { numerator: "600", denominator: "13" });
  assert.equal(gauges.weekly.estimatedCostPerObservedToken.status, "internal-estimate-not-provider-price");
  assert.equal(gauges.latestTurn.estimatedSubscriptionAllocation.status, "internal-estimate-not-provider-price");
  assert.equal(gauges.monetaryPricePerToken, "unknown");
  assert.equal(gauges.transcriptRetainedByEnterprise, false);
});
