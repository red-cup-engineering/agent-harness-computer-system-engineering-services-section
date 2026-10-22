import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { decide } from "../src/host-resource-hook.mjs";
import { isLeaderMessage, spendVerdict, tailRows, turnSpend, weighted } from "../src/spend-breaker.mjs";

const leader = (text) => ({ type: "user", message: { role: "user", content: [{ type: "text", text }] } });
const toolResult = { type: "user", message: { role: "user", content: [{ type: "tool_result", tool_use_id: "t", content: "ok" }] } };
const reply = (id, usage) => ({ type: "assistant", message: { id, role: "assistant", usage } });
const call = (id, cacheRead) => reply(id, { input_tokens: 0, cache_read_input_tokens: cacheRead, output_tokens: 0 });

test("only the Leader's own messages open a turn", () => {
  assert.equal(isLeaderMessage(leader("go")), true);
  assert.equal(isLeaderMessage({ type: "user", message: { role: "user", content: "go" } }), true);
  assert.equal(isLeaderMessage(toolResult), false);
  assert.equal(isLeaderMessage({ ...leader("summary"), isCompactSummary: true }), false);
  assert.equal(isLeaderMessage({ ...leader("reminder"), isMeta: true }), false);
  assert.equal(isLeaderMessage({ type: "user", message: { role: "user", content: "<command-name>/clear</command-name>" } }), false);
});

test("usage is weighted by price relative to input", () => {
  assert.equal(weighted({ input_tokens: 10, cache_read_input_tokens: 100, output_tokens: 2 }), 10 + 10 + 10);
  assert.equal(weighted({ cache_creation_input_tokens: 100, cache_creation: { ephemeral_1h_input_tokens: 40 } }), 60 * 1.25 + 40 * 2);
});

test("a turn's spend starts after the Leader's last message and counts a streamed response once", () => {
  const rows = [leader("first"), call("a", 1e6), leader("second"), call("b", 1e6), call("b", 2e6), toolResult, call("c", 3e6)];
  assert.deepEqual(turnSpend(rows), { spent: 500_000, calls: 2, bounded: true });
});

test("the breaker refuses tools once the turn is over budget, and the Leader's next message resets it", (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), "spend-breaker-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const transcript = path.join(dir, "session.jsonl");
  const write = (rows) => writeFileSync(transcript, rows.map((row) => JSON.stringify(row)).join("\n") + "\n");
  const event = { tool_name: "Bash", tool_input: { command: "echo hi" }, transcript_path: transcript, cwd: dir };
  const env = { AGENT_HOST_GUARD: "on", AGENT_TURN_BUDGET: "1000000", HOME: dir, PATH: "" };

  const spending = [leader("go"), ...Array.from({ length: 30 }, (_, i) => call(`m${i}`, 400_000))];
  write(spending);
  assert.match(spendVerdict(event, { env }), /spend breaker: this turn has spent 1\.2M .* over 30 model calls/u);
  assert.equal(decide(event, { env, cgroup: "" }).permissionDecision, "deny");

  write([...spending, leader("carry on")]);
  assert.equal(spendVerdict(event, { env }), undefined);
  assert.equal(spendVerdict(event, { env: { ...env, AGENT_TURN_BUDGET: "off" } }), undefined);
  assert.equal(spendVerdict({ ...event, transcript_path: path.join(dir, "absent.jsonl") }, { env }), undefined);
});

test("the transcript is read from its end back to the turn's start", (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), "spend-breaker-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const transcript = path.join(dir, "session.jsonl");
  const padding = { type: "assistant", message: { id: "old", content: "x".repeat(4 << 20) } };
  writeFileSync(transcript, [leader("old"), padding, leader("new"), call("n", 10)].map((row) => JSON.stringify(row)).join("\n"));
  const rows = tailRows(transcript);
  assert.deepEqual(turnSpend(rows), { spent: 1, calls: 1, bounded: true });
});
