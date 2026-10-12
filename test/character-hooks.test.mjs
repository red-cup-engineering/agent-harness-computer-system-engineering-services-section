import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { frontmatterRule, readGuardRule, specificationRule, subagentRule } from "../services/claude-code-harness-services-section/src/character-hooks.mjs";

const cli = fileURLToPath(new URL("../services/claude-code-harness-services-section/scripts/character-hook.mjs", import.meta.url));
const hook = (name, payload, ...args) => spawnSync(process.execPath, [cli, name, ...args], { input: JSON.stringify(payload), encoding: "utf8" });
const write = (file_path, content) => ({ tool_name: "Write", tool_input: { file_path, content } });

test("a subagent must be a named type; untyped and general-purpose subagents are refused", () => {
  assert.equal(subagentRule({ tool_name: "Agent", tool_input: { subagent_type: "Explore" } }).block, false);
  assert.equal(subagentRule({ tool_name: "Agent", tool_input: {} }).block, true);
  assert.equal(subagentRule({ tool_name: "Task", tool_input: { subagent_type: "general-purpose" } }).block, true);
  assert.equal(subagentRule({ tool_name: "Read", tool_input: {} }).block, false);
});

test("Markdown frontmatter needs name and description and admits no self-declared role or class", () => {
  assert.equal(frontmatterRule(write("a.md", "---\nname: a\ndescription: d\n---\n")).block, false);
  assert.equal(frontmatterRule(write("a.md", "No frontmatter at all.\n")).block, false);
  assert.equal(frontmatterRule(write("a.txt", "---\nclass: x\n---\n")).block, false);
  const refused = frontmatterRule(write("a.md", "---\ntype: surface-file\nclass: x\n---\n"));
  assert.equal(refused.block, true);
  for (const reason of ["missing required key: name", "missing required key: description", "forbidden key value: type: surface-file", "forbidden key: class"]) assert.match(refused.reason, new RegExp(reason, "u"));
});

test("a specification needs type: specification, version, date and authors", () => {
  const path = "store/governance/rules/specifications/characters.md";
  assert.equal(specificationRule(write(path, "---\ntype: specification\nversion: 1\ndate: 2026-10-10\nauthors: [emsenn]\n---\n")).block, false);
  assert.match(specificationRule(write(path, "no header\n")).reason, /must have YAML frontmatter/u);
  assert.match(specificationRule(write(path, "---\ntype: note\nversion: 1\ndate: x\nauthors: []\n---\n")).reason, /must include 'type: specification'/u);
  assert.match(specificationRule(write(path, "---\ntype: specification\n---\n")).reason, /missing: version:, date:, authors:/u);
  assert.equal(specificationRule(write("store/notes/x.md", "nothing\n")).block, false);
});

test("reads inside the store are refused and reads outside it go ahead", () => {
  assert.match(readGuardRule({ tool_name: "Read", tool_input: { file_path: "/var/store/rom/SOUL.md" } }, "/var/store/rom").reason, /direct read of "SOUL\.md"/u);
  assert.equal(readGuardRule({ tool_name: "Grep", tool_input: { path: "/var/store/rom" } }, "/var/store/rom").block, true);
  assert.equal(readGuardRule({ tool_name: "Read", tool_input: { file_path: "/var/store/romance/x.md" } }, "/var/store/rom").block, false);
  assert.equal(readGuardRule({ tool_name: "Write", tool_input: { file_path: "/var/store/rom/x.md" } }, "/var/store/rom").block, false);
});

test("the hook command blocks with exit status 2 and lets an allowed call through with 0", () => {
  const blocked = hook("block-agent-subagents", { tool_name: "Agent", tool_input: { subagent_type: "general-purpose" } });
  assert.equal(blocked.status, 2); assert.match(blocked.stderr, /general-purpose subagents are prohibited/u);
  assert.equal(hook("block-agent-subagents", { tool_name: "Agent", tool_input: { subagent_type: "Plan" } }).status, 0);
  const guarded = hook("guard-reads", { tool_name: "Read", tool_input: { file_path: "/var/store/rom/MEMORY.md" } }, "/var/store/rom");
  assert.equal(guarded.status, 2); assert.equal(JSON.parse(guarded.stdout).continue, false);
  assert.equal(spawnSync(process.execPath, [cli, "lint-frontmatter"], { input: "not json", encoding: "utf8" }).status, 0);
  assert.equal(spawnSync(process.execPath, [cli, "no-such-hook"], { input: "{}", encoding: "utf8" }).status, 1);
});
