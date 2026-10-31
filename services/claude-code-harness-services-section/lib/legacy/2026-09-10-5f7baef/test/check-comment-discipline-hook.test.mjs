import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { checkCommentDisciplineHook } from "../scripts/check-comment-discipline-hook.mjs";

function writeInput({ filePath, content }) {
  return {
    hook_event_name: "PreToolUse",
    tool_name: "Write",
    tool_input: { file_path: filePath, content },
  };
}

test("throws when the hook event does not match what was projected", () => {
  assert.throws(() => checkCommentDisciplineHook({ hook_event_name: "PostToolUse" }, "PreToolUse"), TypeError);
});

test("skips a tool call that is not a checked Write/Edit", () => {
  const result = checkCommentDisciplineHook({ hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: {} }, "PreToolUse");
  assert.equal(result.decision, "skip");
});

test("skips a Write to a file outside the checked extensions", () => {
  const result = checkCommentDisciplineHook(writeInput({ filePath: "/tmp/notes.md", content: "hello" }), "PreToolUse");
  assert.equal(result.decision, "skip");
});

test("allows a Write whose resulting .mjs text has no egregious loose comments", () => {
  const content = [
    "/**",
    " * Adds two numbers.",
    " *",
    " * @param {number} a The first addend.",
    " * @param {number} b The second addend.",
    " * @returns {number} The sum.",
    " */",
    "export function add(a, b) {",
    "  return a + b;",
    "}",
    "",
  ].join("\n");
  const result = checkCommentDisciplineHook(writeInput({ filePath: "/tmp/add.mjs", content }), "PreToolUse");
  assert.equal(result.decision, "allow");
});

test("denies a Write whose resulting .mjs text has an egregious loose comment block", () => {
  const lines = [];
  for (let index = 0; index < 10; index += 1) lines.push(`// prose line ${index} explaining at length`);
  lines.push("export function add(a, b) {", "  return a + b;", "}", "");
  const result = checkCommentDisciplineHook(writeInput({ filePath: "/tmp/messy.mjs", content: lines.join("\n") }), "PreToolUse");
  assert.equal(result.decision, "deny");
  assert.match(result.reason, /10-line loose comment/);
});

test("denies an Edit whose reconstructed resulting text has an egregious loose comment block", () => {
  const root = mkdtempSync(join(tmpdir(), "comment-discipline-hook-"));
  const filePath = join(root, "existing.mjs");
  writeFileSync(filePath, "export function noop() {}\n");
  try {
    const lines = [];
    for (let index = 0; index < 10; index += 1) lines.push(`// prose line ${index} explaining at length`);
    const input = {
      hook_event_name: "PreToolUse",
      tool_name: "Edit",
      tool_input: { file_path: filePath, old_string: "export function noop() {}\n", new_string: `${lines.join("\n")}\nexport function noop() {}\n` },
    };
    const result = checkCommentDisciplineHook(input, "PreToolUse");
    assert.equal(result.decision, "deny");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("denies an egregious loose-comment-to-code ratio without any single block over the line threshold", () => {
  const lines = [];
  for (let index = 0; index < 8; index += 1) lines.push(`// short note ${index}`, "");
  lines.push("export const value = 1;", "");
  const result = checkCommentDisciplineHook(writeInput({ filePath: "/tmp/ratio.mjs", content: lines.join("\n") }), "PreToolUse");
  assert.equal(result.decision, "deny");
  assert.match(result.reason, /loose-comment-to-code ratio/);
});
