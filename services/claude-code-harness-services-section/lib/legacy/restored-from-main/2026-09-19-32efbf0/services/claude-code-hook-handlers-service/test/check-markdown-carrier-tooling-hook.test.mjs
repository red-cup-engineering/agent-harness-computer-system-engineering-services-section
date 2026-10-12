import test from "node:test";
import assert from "node:assert/strict";
import { BYPASS_ENV_VAR, checkMarkdownCarrierTooling } from "../scripts/check-markdown-carrier-tooling-hook.mjs";
import { lifecycleEvent, responseOf } from "./lifecycle-event.mjs";

const environment = {};
const rule = (tool, filePath) => responseOf(checkMarkdownCarrierTooling(lifecycleEvent({ event: "PreToolUse", tool, toolInput: { file_path: filePath } }), { environment }));

test("every raw file tool writing a Markdown carrier is blocked, naming the operator that owns it", () => {
  for (const tool of ["Write", "Edit", "MultiEdit"]) {
    const response = rule(tool, "lib/services/thing/README.md");
    assert.equal(response.disposition, "block");
    assert.match(response.reason, /markdown-engineering-services-section/);
    assert.match(response.reason, /write-markdown-file/);
    assert.match(response.reason, new RegExp(tool));
  }
  assert.equal(rule("Write", "notes/2026/a.markdown").disposition, "block");
});

test("a non-Markdown carrier, another tool, and a call naming no path all continue", () => {
  assert.equal(rule("Write", "lib/services/thing/src/thing.mjs").disposition, "continue");
  assert.equal(rule("Bash", undefined).disposition, "continue");
  assert.equal(rule("Write", undefined).disposition, "continue");
  assert.equal(responseOf(checkMarkdownCarrierTooling(lifecycleEvent({ event: "PreToolUse" }), { environment })).disposition, "continue");
});

test("the bypass is explicit and per-process, never a default", () => {
  const event = lifecycleEvent({ event: "PreToolUse", tool: "Write", toolInput: { file_path: "a.md" } });
  assert.equal(responseOf(checkMarkdownCarrierTooling(event, { environment: { [BYPASS_ENV_VAR]: "1" } })).disposition, "continue");
  assert.equal(responseOf(checkMarkdownCarrierTooling(event, { environment: { [BYPASS_ENV_VAR]: "yes" } })).disposition, "block");
});
