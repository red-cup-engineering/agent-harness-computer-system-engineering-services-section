import assert from "node:assert/strict";
import test from "node:test";

import { projectAgentRunTrace, projectCodexExecTrace } from "../src/codex-exec-trace.mjs";

const jsonl = [
  { type: "thread.started", thread_id: "abc" },
  { type: "item.completed", thread_id: "abc", item: { id: "cmd", type: "command_execution", command: "npm test", status: "completed" }, usage: { input_tokens: 10, output_tokens: 2 } },
].map(JSON.stringify).join("\n");

test("projects Codex exec JSONL into trace, work, report, finding, and cost carriers", () => {
  const result = projectCodexExecTrace(jsonl, { generatedAt: "2026-08-30T00:00:00.000Z" });
  assert.equal(result.run, "thread.abc");
  assert.equal(result.summary.events, 2);
  assert.equal(result.work[0].status, "potential");
  assert.deepEqual(result.costs[0].tokens, { input: 10, output: 2 });
  assert.equal(projectAgentRunTrace(jsonl, { generatedAt: "2026-08-30T00:00:00.000Z" }).format, "codex-exec-jsonl");
});

test("refuses malformed JSONL with its line number", () => {
  assert.throws(() => projectCodexExecTrace('{"type":', {}), /line 1/u);
});
