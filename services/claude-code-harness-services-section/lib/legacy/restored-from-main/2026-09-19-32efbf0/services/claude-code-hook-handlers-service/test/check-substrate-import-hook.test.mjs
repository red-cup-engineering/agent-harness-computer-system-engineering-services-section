import test from "node:test";
import assert from "node:assert/strict";
import { BYPASS_ENV_VAR, checkSubstrateImport } from "../scripts/check-substrate-import-hook.mjs";
import { lifecycleEvent, responseOf } from "./lifecycle-event.mjs";

const environment = {};
const absent = () => { throw new Error("ENOENT"); };

async function rule(event, options = {}) {
  return responseOf(await checkSubstrateImport(event, { environment, readText: absent, ...options }));
}

test("a brand-new JavaScript carrier reaching for a substrate a house service owns is blocked", async () => {
  const event = lifecycleEvent({
    event: "PreToolUse",
    tool: "Write",
    toolInput: { file_path: "lib/services/thing/src/thing.mjs", content: 'import { readFileSync } from "node:fs";\nexport const a = 1;\n' },
  });
  const response = await rule(event);
  assert.equal(response.disposition, "block");
  assert.match(response.reason, /node:fs/);
  assert.match(response.reason, new RegExp(BYPASS_ENV_VAR));
});

test("an Edit's resulting text is computed from the file's current text, and only new imports are findings", async () => {
  const currentText = 'import { readFileSync } from "node:fs";\nexport const a = 1;\n';
  const event = lifecycleEvent({
    event: "PreToolUse",
    tool: "Edit",
    toolInput: { file_path: "lib/services/thing/src/thing.mjs", old_string: "export const a = 1;", new_string: "export const a = 2;" },
  });
  assert.equal((await rule(event, { readText: async () => currentText })).disposition, "continue");

  const adding = lifecycleEvent({
    event: "PreToolUse",
    tool: "Edit",
    toolInput: { file_path: "lib/services/thing/src/thing.mjs", old_string: "export const a = 1;", new_string: 'import { spawnSync } from "node:child_process";\nexport const a = 1;' },
  });
  const response = await rule(adding, { readText: async () => "export const a = 1;\n" });
  assert.equal(response.disposition, "block");
  assert.match(response.reason, /node:child_process/);
});

test("a clean carrier, a non-JavaScript path, another tool, and an unreadable pending text continue", async () => {
  assert.equal((await rule(lifecycleEvent({ event: "PreToolUse", tool: "Write", toolInput: { file_path: "lib/a.mjs", content: "export const a = 1;\n" } }))).disposition, "continue");
  assert.equal((await rule(lifecycleEvent({ event: "PreToolUse", tool: "Write", toolInput: { file_path: "lib/a.md", content: 'import "node:fs";' } }))).disposition, "continue");
  assert.equal((await rule(lifecycleEvent({ event: "PreToolUse", tool: "Bash", toolInput: { command: "ls" } }))).disposition, "continue");
  assert.equal((await rule(lifecycleEvent({ event: "PreToolUse", tool: "Edit", toolInput: { file_path: "lib/a.mjs", old_string: "a" } }))).disposition, "continue");
  assert.equal((await rule(lifecycleEvent({ event: "PreToolUse" }))).disposition, "continue");
});

test("the bypass is explicit", async () => {
  const event = lifecycleEvent({ event: "PreToolUse", tool: "Write", toolInput: { file_path: "lib/a.mjs", content: 'import "node:fs";' } });
  assert.equal((await rule(event, { environment: { [BYPASS_ENV_VAR]: "1" } })).disposition, "continue");
});
