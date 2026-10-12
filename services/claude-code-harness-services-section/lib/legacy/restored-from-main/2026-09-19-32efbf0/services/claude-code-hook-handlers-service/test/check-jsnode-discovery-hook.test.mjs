import test from "node:test";
import assert from "node:assert/strict";
import { BYPASS_ENV_VAR, checkJsnodeDiscovery } from "../scripts/check-jsnode-discovery-hook.mjs";
import { lifecycleEvent, responseOf, textReader } from "./lifecycle-event.mjs";

const environment = {};
const transcript = "/transcripts/s.jsonl";
const absent = async ({ path }) => ({ type: "PathStat", path, exists: false, kind: "absent", size: null, mtimeMs: null });
const present = async ({ path }) => ({ type: "PathStat", path, exists: true, kind: "file", size: 1, mtimeMs: 0 });
const toolUse = (name) => `${JSON.stringify({ message: { role: "assistant", content: [{ type: "tool_use", name, input: {} }] } })}\n`;
const write = (filePath, transcriptPath = transcript) => lifecycleEvent({ event: "PreToolUse", tool: "Write", toolInput: { file_path: filePath }, transcriptPath });

async function rule(event, { files = {}, stat = absent, ...rest } = {}) {
  return responseOf(await checkJsnodeDiscovery(event, { environment, stat, readText: textReader(files), ...rest }));
}

test("a new code carrier with a prior capability-graph search continues", async () => {
  for (const name of ["jsnode_search", "jsnode_duplication", "mcp__jsnode-server__jsnode_atlas"]) {
    assert.equal((await rule(write("lib/a.mjs"), { files: { [transcript]: toolUse(name) } })).disposition, "continue", name);
  }
});

test("a new code carrier with no prior search is refused, naming the tools to load", async () => {
  const response = await rule(write("lib/a.mjs"), { files: { [transcript]: toolUse("Read") } });
  assert.equal(response.disposition, "block");
  assert.match(response.reason, /jsnode_search/);
  assert.match(response.reason, new RegExp(BYPASS_ENV_VAR));
});

test("an existing file, a non-code path, a generated or test path, and another tool all continue", async () => {
  assert.equal((await rule(write("lib/a.mjs"), { stat: present })).disposition, "continue");
  assert.equal((await rule(write("lib/a.md"))).disposition, "continue");
  assert.equal((await rule(write("lib/pkg/test/a.test.mjs"))).disposition, "continue");
  assert.equal((await rule(write("lib/pkg/node_modules/x/a.mjs"))).disposition, "continue");
  assert.equal((await rule(write("lib/pkg/dist/a.mjs"))).disposition, "continue");
  assert.equal((await rule(lifecycleEvent({ event: "PreToolUse", tool: "Edit", toolInput: { file_path: "lib/a.mjs" } }))).disposition, "continue");
  assert.equal((await rule(lifecycleEvent({ event: "PreToolUse", tool: "Write" }))).disposition, "continue");
});

test("no transcript refuses rather than assuming a search happened, and the bypass is explicit", async () => {
  assert.equal((await rule(write("lib/a.mjs", null))).disposition, "block");
  assert.equal(responseOf(await checkJsnodeDiscovery(write("lib/a.mjs"), { environment: { [BYPASS_ENV_VAR]: "1" }, stat: absent })).disposition, "continue");
});
