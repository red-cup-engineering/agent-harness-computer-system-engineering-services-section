import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const scriptPath = fileURLToPath(
  new URL("../scripts/lint-agent-brief.mjs", import.meta.url),
);

/**
 * @param {string} rawStdin
 * @returns {Promise<{stdout: string, code: number}>}
 */
function runHookRaw(rawStdin) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath], {
      cwd: path.dirname(scriptPath),
    });
    let stdout = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => resolve({ stdout, code }));
    child.stdin.end(rawStdin);
  });
}

/**
 * @param {object} payload
 * @returns {Promise<{stdout: string, code: number}>}
 */
function runHook(payload) {
  return runHookRaw(JSON.stringify(payload));
}

test("prints nothing for a non-Task tool", async () => {
  const { stdout, code } = await runHook({
    tool_name: "Bash",
    tool_input: { command: "ls" },
  });
  assert.equal(code, 0);
  assert.equal(stdout, "");
});

test("prints nothing for a complete Task brief", async () => {
  const prompt =
    "Fix the off-by-one error in src/pagination.mjs where the last page " +
    "of results is dropped when the total count is an exact multiple of " +
    "the page size. Add a regression test covering that exact-multiple " +
    "case. Report the exact `node --test` counts before and after the fix.";
  const { stdout, code } = await runHook({
    tool_name: "Task",
    tool_input: { prompt },
  });
  assert.equal(code, 0);
  assert.equal(stdout, "");
});

test("emits additionalContext for a short Task brief", async () => {
  const { stdout, code } = await runHook({
    tool_name: "Task",
    tool_input: { prompt: "fix the bug" },
  });
  assert.equal(code, 0);
  const parsed = JSON.parse(stdout);
  assert.equal(
    parsed.hookSpecificOutput.hookEventName,
    "PreToolUse",
  );
  assert.match(
    parsed.hookSpecificOutput.additionalContext,
    /possible brief gaps/,
  );
});

test("exits cleanly on malformed stdin", async () => {
  const { stdout, code } = await runHookRaw("not json");
  assert.equal(code, 0);
  assert.equal(stdout, "");
});
