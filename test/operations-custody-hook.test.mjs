import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { custodyHookEntries, decide, isOperationsCode, writtenPaths } from "../src/operations-custody-hook.mjs";

const OPS = "/house/lib/phezi-ochage/services/561-group/services/operations-services-section";

test("executable source in any Operations section is refused, legacy included; data is not", () => {
  assert.equal(isOperationsCode(`${OPS}/lib/fleet.mjs`), true);
  assert.equal(isOperationsCode(`${OPS}/services/channels-services-section/src/x.js`), true, "child sections of Operations");
  assert.equal(isOperationsCode("/h/services/computer-operations-services-section/scripts/run.sh"), true);
  assert.equal(isOperationsCode(`${OPS}/lib/agency/skills/x/SKILL.md`), false);
  assert.equal(isOperationsCode(`${OPS}/data/records/policy.json`), false);
  assert.equal(isOperationsCode(`${OPS}/lib/legacy/old/thing.mjs`), true, "legacy is no place to park code");
  assert.equal(isOperationsCode(`${OPS}/node_modules/pkg/index.js`), false);
  assert.equal(isOperationsCode("/h/services/engineering-services-section/src/engine.mjs"), false);
  assert.equal(isOperationsCode("src/x.mjs", `${OPS}/services/a-services-section`), true, "relative paths resolve against cwd");
});

test("Claude edit tools and Codex apply_patch envelopes are both read", () => {
  assert.deepEqual(writtenPaths({ tool_name: "Write", tool_input: { file_path: "/a/b.mjs" } }), ["/a/b.mjs"]);
  assert.deepEqual(writtenPaths({ tool_name: "NotebookEdit", tool_input: { notebook_path: "/a/n.ipynb" } }), ["/a/n.ipynb"]);
  const patch = "apply_patch <<'EOF'\n*** Begin Patch\n*** Add File: lib/new.mjs\n+x\n*** Update File: README.md\n*** End Patch\nEOF";
  assert.deepEqual(writtenPaths({ tool_name: "Bash", tool_input: { command: patch } }), ["lib/new.mjs", "README.md"]);
  assert.deepEqual(writtenPaths({ tool_name: "Bash", tool_input: { command: "ls" } }), []);
});

test("a refusal names the rule and the Engineering destination; an allowed call prints nothing", () => {
  const denied = decide({ tool_name: "Edit", tool_input: { file_path: `${OPS}/lib/evidence.mjs` } });
  assert.equal(denied.permissionDecision, "deny");
  assert.match(denied.permissionDecisionReason, /science-engineering-operations-parameterize-in-order/u);
  assert.match(denied.permissionDecisionReason, /Red Cup Engineering owner/u);
  assert.equal(decide({ tool_name: "Write", tool_input: { file_path: `${OPS}/data/records/x.json` } }), undefined);
  const hook = fileURLToPath(new URL("../src/operations-custody-hook.mjs", import.meta.url));
  const run = (event) => spawnSync(process.execPath, [hook], { input: JSON.stringify(event), encoding: "utf8" });
  assert.equal(JSON.parse(run({ tool_name: "Write", tool_input: { file_path: `${OPS}/src/a.ts` } }).stdout).hookSpecificOutput.permissionDecision, "deny");
  assert.equal(run({ tool_name: "Write", tool_input: { file_path: `${OPS}/content/a.md` } }).stdout, "");
  assert.equal(run("not json").stdout, "");
});

test("hook entries target edit tools for Claude and the shell tool for Codex", () => {
  assert.equal(custodyHookEntries("/h.mjs").PreToolUse[0].matcher, "Write|Edit|MultiEdit|NotebookEdit");
  assert.equal(custodyHookEntries("/h.mjs", { provider: "codex" }).PreToolUse[0].matcher, "Bash");
});
