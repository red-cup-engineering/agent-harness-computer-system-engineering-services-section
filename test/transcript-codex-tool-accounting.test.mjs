import assert from "node:assert/strict";
import test from "node:test";
import { projectCodexToolAccounting } from "../src/transcripts/codex-tool-accounting.mjs";

const row = (type, payload) => ({ type, payload });

test("correlates native results by call_id and retains only compact accounting", () => {
  const secret = "DO-NOT-RETAIN-THIS-PROMPT-OR-OUTPUT";
  const accounting = projectCodexToolAccounting([
    row("event_msg", { type: "task_started", turn_id: "turn-1" }),
    row("response_item", { type: "custom_tool_call", call_id: "one", name: "exec", input: secret, status: "completed" }),
    row("response_item", { type: "custom_tool_call_output", call_id: "one", output: JSON.stringify({ exit_code: 1, secret }) }),
    row("response_item", { type: "function_call", call_id: "two", name: "exec", arguments: secret }),
    row("response_item", { type: "function_call_output", call_id: "two", output: secret }),
    row("response_item", { type: "function_call", call_id: "three", name: "wait_threads", arguments: secret }),
    row("event_msg", { type: "task_complete", turn_id: "turn-1" }),
  ]).turns[0];
  assert.deepEqual(accounting.counts, { calls: 3, results: 2, missingResults: 1, failures: 1, waits: 1, retries: 1, outputBytes: Buffer.byteLength(JSON.stringify({ exit_code: 1, secret })) + Buffer.byteLength(secret) });
  assert.equal(accounting.observation.coverage, "partial-for-observed-calls");
  assert.equal(accounting.heuristicAvoidability.retries, 1);
  assert.equal(accounting.state, "completed");
  assert.equal(JSON.stringify(accounting).includes(secret), false);
  assert.equal(JSON.stringify(accounting).includes("one"), false);
});

test("marks aborted turns interrupted instead of leaving them ongoing", () => {
  const accounting = projectCodexToolAccounting([
    row("event_msg", { type: "task_started", turn_id: "turn-aborted" }),
    row("response_item", { type: "function_call", call_id: "call", name: "exec" }),
    row("event_msg", { type: "turn_aborted", turn_id: "turn-aborted" }),
  ]).turns[0];
  assert.equal(accounting.state, "interrupted");
  assert.equal(accounting.counts.missingResults, 1);
});
