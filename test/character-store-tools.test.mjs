import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { characterStoreTools } from "../services/claude-code-harness-services-section/src/character-store-tools.mjs";
import { makeWorkItem } from "../services/claude-code-harness-services-section/src/character-work-items.mjs";

const logger = fileURLToPath(new URL("../services/claude-code-harness-services-section/scripts/character-store-log.mjs", import.meta.url));
const server = fileURLToPath(new URL("../services/claude-code-harness-services-section/scripts/character-store-mcp.mjs", import.meta.url));
const at = new Date("2026-10-10T12:00:00Z");
const store = async () => {
  const root = await mkdtemp("/var/tmp/character-store-");
  await writeFile(path.join(root, "_index.md"), "---\nname: test-character\ndisplay-name: Test Character\n---\n");
  await mkdir(path.join(root, "governance/rules/specifications"), { recursive: true });
  await writeFile(path.join(root, "governance/rules/specifications/memory.md"), "---\ntype: specification\n---\n# Memory\n\nEntries carry a one-line description.\n");
  await mkdir(path.join(root, "prose/concepts"), { recursive: true });
  await writeFile(path.join(root, "prose/concepts/predication.md"), "---\nname: predication\ndescription: Saying something of something.\n---\nPredication relates a subject to a predicate.\n");
  await writeFile(path.join(root, "CLAUDE.md"), "# Test Character\n");
  return root;
};
const toolsOf = (root) => Object.fromEntries(characterStoreTools(root, { session: "session:test", now: () => at }).map((tool) => [tool.name, tool]));
const call = async (tools, name, args) => { const result = await tools[name].handler(args); return { text: result.content[0].text, error: result.isError === true }; };

test("the catalogue carries every tool of the legacy server, each with an object inputSchema", async () => {
  const tools = characterStoreTools(await store());
  assert.deepEqual(tools.map((tool) => tool.name), ["list_specs", "read_spec", "audit", "log_event", "get_surface_files", "retrieve_context", "save_memory", "read_memory", "write_memory", "list_work_items", "settle_work_item", "create_resource", "regenerate_heartbeat"]);
  for (const tool of tools) { assert.equal(tool.inputSchema.type, "object"); assert.equal(typeof tool.handler, "function"); }
});

test("specifications, surface files and context are read from the store", async () => {
  const tools = toolsOf(await store());
  assert.equal((await call(tools, "list_specs")).text, "- memory: Memory");
  assert.match((await call(tools, "read_spec", { slug: "memory" })).text, /one-line description/u);
  assert.deepEqual(await call(tools, "read_spec", { slug: "absent" }), { text: "Spec not found: absent", error: true });
  assert.equal((await call(tools, "get_surface_files")).text, "- CLAUDE.md");
  assert.equal((await call(tools, "retrieve_context", { query: "predicate subject" })).text, "[concept] predication: Saying something of something.");
  assert.equal((await call(tools, "retrieve_context", { query: "nothing-like-this" })).text, "No matching content.");
});

test("memory is saved by category, read back, and written as dated episodic entries", async () => {
  const root = await store(); const tools = toolsOf(root);
  assert.equal((await call(tools, "save_memory", { category: "feedback", slug: "terse-reports", content: "Report tersely.\n" })).text, "Saved: prose/memory/feedback/terse-reports.md");
  assert.equal((await call(tools, "read_memory")).text, "feedback: terse-reports");
  assert.equal((await call(tools, "read_memory", { category: "feedback", slug: "terse-reports" })).text, "Report tersely.\n");
  assert.equal((await call(tools, "write_memory", { slug: "first-session", description: "The first session.", content: "It began." })).text, "Created: prose/memory/2026-10-10-first-session.md");
  assert.equal(await readFile(path.join(root, "prose/memory/2026-10-10-first-session.md"), "utf8"), "---\nname: 2026-10-10-first-session\ndescription: The first session.\n---\n\nIt began.\n");
  assert.match((await call(tools, "write_memory", { slug: "first-session", description: "Again." })).text, /already exists/u);
  assert.equal((await call(tools, "write_memory", { slug: "two-lines", description: "a\nb" })).error, true);
});

test("no tool writes outside the store", async () => {
  const root = await store(); const tools = toolsOf(root);
  const escaped = await call(tools, "create_resource", { path: "../escaped.md", name: "x", description: "y" });
  assert.equal(escaped.error, true); assert.match(escaped.text, /outside the store/u);
  assert.equal(existsSync(path.join(path.dirname(root), "escaped.md")), false);
  assert.equal((await call(tools, "create_resource", { path: "prose/notes/a.md", name: "A", description: "An a.", extra: { kind: "note" } })).text, "Created: prose/notes/a.md");
  assert.equal(await readFile(path.join(root, "prose/notes/a.md"), "utf8"), "---\nname: A\ndescription: An a.\nkind: note\n---\n\n# A\n");
  assert.equal((await call(tools, "create_resource", { path: "prose/notes/a.md", name: "A", description: "An a." })).error, true);
});

test("work-items are listed and settled by witness, and HEARTBEAT is re-rendered", async () => {
  const root = await store(); const tools = toolsOf(root);
  makeWorkItem(root, "write-agents-md", "Write AGENTS.md.", { raisedBy: "emsenn", on: "2026-10-10" });
  makeWorkItem(root, "verify-server", "Verify the server.", { raisedBy: "emsenn", on: "2026-10-10" });
  assert.equal((await call(tools, "list_work_items", { state: "open" })).text, "- [open] verify-server: Verify the server.\n- [open] write-agents-md: Write AGENTS.md.");
  assert.match((await call(tools, "settle_work_item", { slug: "write-agents-md", witnessed_by: "karen-wiener", observed: "AGENTS.md exists" })).text, /Settlement witnessed/u);
  assert.equal((await call(tools, "list_work_items", { state: "settled" })).text, "- [settled] write-agents-md: Write AGENTS.md.");
  assert.doesNotMatch(await readFile(path.join(root, "HEARTBEAT.md"), "utf8"), /write-agents-md/u);
  assert.equal((await call(tools, "regenerate_heartbeat")).text, "HEARTBEAT.md regenerated: 1 open, 1 settled.");
});

test("a store that keeps its work-items elsewhere names that directory once, for every work-item tool", async () => {
  const root = await store(); const items = "work/tasks/legacy-2026-05-13";
  const tools = Object.fromEntries(characterStoreTools(root, { session: "session:test", now: () => at, items }).map((tool) => [tool.name, tool]));
  makeWorkItem(root, "draft-soul", "Draft SOUL.md.", { raisedBy: "emsenn", items, on: "2026-10-10" });
  assert.equal((await call(tools, "list_work_items")).text, "- [open] draft-soul: Draft SOUL.md.");
  await call(tools, "settle_work_item", { slug: "draft-soul", witnessed_by: "emsenn", observed: "SOUL.md renders" });
  assert.match(await readFile(path.join(root, items, "draft-soul.md"), "utf8"), /^## Settlement$/mu);
  assert.equal((await call(tools, "regenerate_heartbeat")).text, "HEARTBEAT.md regenerated: 0 open, 1 settled.");
  assert.match((await call(tools, "regenerate_heartbeat", { items: "../elsewhere" })).text, /outside the store/u);
});

test("the audit reports violations and every call is a row in the session log", async () => {
  const root = await store(); const tools = toolsOf(root);
  assert.match((await call(tools, "audit")).text, /\d+ violation\(s\), \d+ warning\(s\)\.$/u);
  await call(tools, "log_event", { type: "decision", description: "Kept the store." });
  const rows = (await readFile(path.join(root, "code/logs/2026-10-10.jsonl"), "utf8")).trim().split("\n").map((line) => JSON.parse(line));
  assert.deepEqual(rows.map((row) => row.a), ["tool_call", "session_event"]);
  assert.deepEqual(rows[1], { ts: at.toISOString(), e: "session:test", a: "session_event", v: { type: "decision", description: "Kept the store." } });
});

test("character-store-log records a row directly, or logs a PostToolUse call without ever blocking", async () => {
  const root = await store(); const day = new Date().toISOString().slice(0, 10);
  assert.equal(spawnSync(process.execPath, [logger, root, "session:x", "decision", "{\"kept\":true}"]).status, 0);
  const hook = spawnSync(process.execPath, [logger, root], { input: JSON.stringify({ tool_name: "Read", tool_input: { file_path: "a.md" }, tool_response: "text" }) });
  assert.equal(hook.status, 0);
  assert.equal(spawnSync(process.execPath, [logger, root], { input: "not json" }).status, 0);
  const rows = (await readFile(path.join(root, `code/logs/${day}.jsonl`), "utf8")).trim().split("\n").map((line) => JSON.parse(line));
  assert.deepEqual(rows.map(({ e, a, v }) => ({ e, a, v })), [
    { e: "session:x", a: "decision", v: { kept: true } },
    { e: "tool:Read", a: "tool_use", v: { tool: "Read", input: { file_path: "a.md" }, output: "text" } },
  ]);
});

test("the server answers MCP over stdio with the house server", async () => {
  const root = await store();
  const child = spawn(process.execPath, [server, root], { stdio: ["pipe", "pipe", "inherit"] });
  const replies = []; let buffer = "";
  const done = new Promise((resolve, reject) => {
    child.on("exit", (code) => reject(new Error(`the server exited (${code}) before answering`)));
    child.stdout.on("data", (chunk) => {
      buffer += chunk; const lines = buffer.split("\n"); buffer = lines.pop();
      for (const line of lines) if (line.trim()) replies.push(JSON.parse(line));
      if (replies.length === 3) resolve();
    });
  });
  for (const message of [
    { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "0" } } },
    { jsonrpc: "2.0", id: 2, method: "tools/list" },
    { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "read_spec", arguments: { slug: "memory" } } },
  ]) child.stdin.write(`${JSON.stringify(message)}\n`);
  await done; child.kill();
  assert.equal(replies[0].result.serverInfo.name, `character-store:${path.basename(root)}`);
  assert.equal(replies[1].result.tools.length, 13);
  assert.match(replies[2].result.content[0].text, /^---\ntype: specification/u);
});
