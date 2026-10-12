import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { extractOwnerBlocks, parseJsonLines, resolveRootRollout } from "../scripts/extract-root-session-audit.mjs";

function record(type, payload, timestamp) {
  return JSON.stringify({ type, payload, timestamp });
}

test("resolves a child id to the root and extracts each owner record once in chronology", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "transcript-audit-"));
  try {
    const shard = path.join(directory, "2026", "08", "31");
    await mkdir(shard, { recursive: true });
    const rootId = "root-id";
    const childId = "child-id";
    const owner = "Later owner correction";
    await writeFile(path.join(shard, `rollout-${rootId}.jsonl`), [
      record("session_meta", { id: rootId, source: "vscode" }, "2026-08-31T00:00:00Z"),
      record("response_item", { type: "message", role: "user", content: [{ type: "input_text", text: "# AGENTS.md instructions for /tmp" }] }, "2026-08-31T00:00:01Z"),
      record("response_item", { type: "message", role: "user", content: [{ type: "input_text", text: "Earlier owner request" }] }, "2026-08-31T00:00:02Z"),
      record("response_item", { type: "message", role: "assistant", content: [{ type: "output_text", text: "Wrong action" }] }, "2026-08-31T00:00:03Z"),
      record("response_item", { type: "message", role: "user", content: [{ type: "input_text", text: owner }] }, "2026-08-31T00:00:04Z"),
    ].join("\n"));
    await writeFile(path.join(shard, `rollout-${childId}.jsonl`), [
      record("session_meta", { id: childId, source: { subagent: { thread_spawn: { parent_thread_id: rootId } } } }, "2026-08-31T00:00:05Z"),
      record("response_item", { type: "message", role: "user", content: [{ type: "input_text", text: owner }] }, "2026-08-31T00:00:06Z"),
    ].join("\n"));

    const resolved = await resolveRootRollout(directory, childId);
    assert.equal(resolved.meta.id, rootId);
    const blocks = extractOwnerBlocks(resolved.records);
    assert.deepEqual(blocks.map((block) => block.text), ["Earlier owner request", owner]);
    assert.deepEqual(blocks[0].assistant.map((message) => message.text), ["Wrong action"]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("reports malformed JSONL with its line number", () => {
  assert.throws(() => parseJsonLines("{}\nnope\n"), /line 2/u);
});
