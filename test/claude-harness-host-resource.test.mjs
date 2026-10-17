// claude-harness-host-resource.test: the node projection carries the host-resource controller into
// the files and settings it writes, keeps what else the settings hold, and retracts it when the
// projection stops yielding it. The projection module is loaded where the workspace packages it
// imports are installed (the monorepo), and these tests are skipped where they are not.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { hookEntries, hostResourceControl, shellQuote } from "../src/host-resource-hook.mjs";

let projection;
try {
  projection = await import("../services/claude-code-harness-services-section/src/claude-harness-projection.mjs");
} catch (error) {
  if (error?.code !== "ERR_MODULE_NOT_FOUND" || !String(error.message).includes("@red-cup-engineering/")) throw error;
}
const skip = projection === undefined ? "the workspace packages of the projection are not installed" : false;

const roots = [];
const nodeDir = () => {
  const dir = mkdtempSync(path.join(tmpdir(), "claude-harness-host-resource-"));
  roots.push(dir);
  return dir;
};
process.on("exit", () => { for (const dir of roots) rmSync(dir, { recursive: true, force: true }); });

// What projectClaudeHarness yields for an agency that seats no one: only the node's controller.
const projectionAt = (node, hostResource = true) => {
  const control = hostResource ? hostResourceControl({ node, codex: false }) : { files: new Map(), hooks: {} };
  return Object.freeze({ kind: "claude-harness.projection", node, settlementRoot: node, files: new Map(control.files), hooks: control.hooks,
    env: Object.freeze({ BASH_MAX_OUTPUT_LENGTH: "20000" }), deny: Object.freeze([]), mcpServers: {}, counts: {}, obstructions: Object.freeze([]) });
};

test("writing the projection references the owning hook source from the settings and keeps the settings it does not own", { skip }, () => {
  const node = nodeDir();
  mkdirSync(path.join(node, ".claude"), { recursive: true });
  writeFileSync(path.join(node, ".claude", "settings.local.json"), JSON.stringify({ disabledMcpjsonServers: ["metroplat"], permissions: { allow: ["Bash(git commit:*)"] }, env: { KEEP: "1" } }));

  const written = projection.writeClaudeHarness(projectionAt(node));
  assert.equal(written.written, 0, "the Claude projection yields no file for the controller; its settings name the source");
  const { source } = hostResourceControl({ node });
  assert.equal(existsSync(path.join(node, ".claude", "hooks")), false, "no hook body is copied beside the settings");
  assert.equal(existsSync(path.join(node, ".codex", "hooks")), false);
  const settings = JSON.parse(readFileSync(path.join(node, ".claude", "settings.local.json"), "utf8"));
  assert.deepEqual(settings.disabledMcpjsonServers, ["metroplat"]);
  assert.deepEqual(settings.permissions.allow, ["Bash(git commit:*)"]);
  assert.equal(settings.env.KEEP, "1");
  assert.equal(settings.hooks.PreToolUse.length, 1);
  assert.equal(settings.hooks.PreToolUse[0].matcher, "Bash|Monitor");
  assert.equal(settings.hooks.PreToolUse[0].hooks[0].command, `${shellQuote(process.execPath)} ${shellQuote(source)}`);
  assert.equal(existsSync(path.join(node, ".codex")), false, "Codex is not this projection's to write");
});

test("the command the settings name is the hook, and it answers a runaway find with a deny", { skip }, () => {
  const node = nodeDir();
  projection.writeClaudeHarness(projectionAt(node));
  const { command } = JSON.parse(readFileSync(path.join(node, ".claude", "settings.local.json"), "utf8")).hooks.PreToolUse[0].hooks[0];
  const event = JSON.stringify({ hook_event_name: "PreToolUse", cwd: node, tool_name: "Bash", tool_input: { command: "find / -name x" } });
  const result = spawnSync("sh", ["-c", command], { input: event, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).hookSpecificOutput.permissionDecision, "deny");
});

test("a check reports the hook as current, then as drifted when its settings change", { skip }, () => {
  const node = nodeDir();
  projection.writeClaudeHarness(projectionAt(node));
  assert.equal(projection.checkClaudeHarness(projectionAt(node)).current, true);
  const settingsFile = path.join(node, ".claude", "settings.local.json");
  const settings = JSON.parse(readFileSync(settingsFile, "utf8"));
  delete settings.hooks;
  writeFileSync(settingsFile, JSON.stringify(settings));
  assert.deepEqual(projection.checkClaudeHarness(projectionAt(node)).drift.map((entry) => entry.reason), ["hooks differ"]);
});

test("a projection that no longer yields the controller retracts its hooks", { skip }, () => {
  const node = nodeDir();
  projection.writeClaudeHarness(projectionAt(node));
  assert.equal(JSON.parse(readFileSync(path.join(node, ".claude", "settings.local.json"), "utf8")).hooks.PreToolUse.length, 1);
  projection.writeClaudeHarness(projectionAt(node, false));
  assert.deepEqual(JSON.parse(readFileSync(path.join(node, ".claude", "settings.local.json"), "utf8")).hooks, { PreToolUse: [] }, "the controller's group is gone");
});
