import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { scratchRoot } from "./support/scratch.mjs";
import path from "node:path";
import test from "node:test";
import { checkClaudeHarness, writeClaudeHarness } from "../services/claude-code-harness-services-section/src/claude-harness-projection.mjs";

const projectionAt = (node) => Object.freeze({
  node,
  files: new Map([[".claude/CLAUDE.md", "standing\n"], [".claude/agents/senior-engineer.md", "agent\n"]]),
  hooks: {}, env: { BASH_MAX_OUTPUT_LENGTH: "20000" }, deny: ["Bash(git stash:*)"], mcpServers: {},
  counts: {}, obstructions: [],
});

test("what the projection no longer yields is found in the directories it owns, with no list of its own writes", (t) => {
  const node = mkdtempSync(path.join(scratchRoot(), "claude-harness-"));
  t.after(() => rmSync(node, { recursive: true, force: true }));
  mkdirSync(path.join(node, ".claude", "agents"), { recursive: true });
  writeFileSync(path.join(node, ".claude", "agents", "vacated-office.md"), "an office no longer seated\n");
  const written = writeClaudeHarness(projectionAt(node));
  assert.deepEqual(written.removed, [".claude/agents/vacated-office.md"]);
  assert.equal(existsSync(path.join(node, ".claude", "agents", "vacated-office.md")), false);
  assert.equal(existsSync(path.join(node, ".claude", ".claude-harness-manifest")), false, "the projection keeps no bookkeeping file");
  assert.equal(JSON.parse(readFileSync(path.join(node, ".claude", "settings.local.json"), "utf8")).env.BASH_MAX_OUTPUT_LENGTH, "20000");
  assert.equal(checkClaudeHarness(projectionAt(node)).current, true);
  writeFileSync(path.join(node, ".claude", "agents", "hand-written.md"), "x\n");
  assert.deepEqual(checkClaudeHarness(projectionAt(node)).drift, [{ path: ".claude/agents/hand-written.md", reason: "no longer projected" }]);
});

test("the servers written into .mcp.json are the servers the settings approve, so a session connects without a prompt", (t) => {
  const node = mkdtempSync(path.join(scratchRoot(), "claude-harness-"));
  t.after(() => rmSync(node, { recursive: true, force: true }));
  const projection = { ...projectionAt(node), mcpServers: { metroplat: { type: "http", url: "https://metroplat.example/mcp" } } };
  writeClaudeHarness(projection);
  const settings = () => JSON.parse(readFileSync(path.join(node, ".claude", "settings.local.json"), "utf8"));
  assert.deepEqual(settings().enabledMcpjsonServers, ["metroplat"]);
  assert.equal(checkClaudeHarness(projection).current, true);
  writeFileSync(path.join(node, ".claude", "settings.local.json"), JSON.stringify({ ...settings(), enabledMcpjsonServers: [] }));
  assert.deepEqual(checkClaudeHarness(projection).drift, [{ path: ".claude/settings.local.json", reason: "enabledMcpjsonServers differs" }]);
});
