#!/usr/bin/env node
/**
 * PreToolUse hook entrypoint: reads the Claude Code hook payload from
 * stdin, lints a "Task" tool's brief, and prints a non-blocking
 * hookSpecificOutput.additionalContext when it finds a gap. Never denies
 * the tool call -- a heuristic lint is advisory, not a gate.
 */

import { lintDispatchBrief } from "../src/brief-lint.mjs";
import { readJavascriptNodeStandardInputText } from "@red-cup-engineering/read-javascript-node-standard-input-text-service";

/**
 * @param {string} raw
 * @returns {{tool_name?: string, tool_input?: object} | null}
 */
function parseHookPayload(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

const raw = (await readJavascriptNodeStandardInputText({ type: "JavascriptNodeStandardInputTextReadRequest", version: 1 }, { standardInput: process.stdin })).text;
const payload = parseHookPayload(raw);

if (!payload || payload.tool_name !== "Task") {
  process.exit(0);
}

const warnings = lintDispatchBrief(payload.tool_input ?? {});

if (warnings.length === 0) {
  process.exit(0);
}

process.stdout.write(
  JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      additionalContext:
        "dispatch-agent-discipline lint found possible brief gaps:\n" +
        warnings.map((w) => `- ${w}`).join("\n"),
    },
  }),
);
process.exit(0);
