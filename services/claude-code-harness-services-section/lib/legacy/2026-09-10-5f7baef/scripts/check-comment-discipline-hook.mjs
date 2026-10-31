#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { checkJavascriptExportCommentDiscipline, egregiousJavascriptExportCommentDisciplineReason } from "@red-cup-engineering/check-javascript-export-comment-discipline-service";
import { cliArgument, readBoundedHookInput } from "./lib/claude-hook-input.mjs";

const CHECKED_TOOLS = new Set(["Write", "Edit"]);
const CHECKED_EXTENSIONS = new Set([".mjs", ".mts"]);
const BYPASS_ENV_VAR = "COMMENT_DISCIPLINE_HOOK_BYPASS";

function resultingText(toolName, toolInput) {
  if (toolName === "Write") return typeof toolInput.content === "string" ? toolInput.content : null;
  if (typeof toolInput.old_string !== "string" || typeof toolInput.new_string !== "string") return null;
  let current;
  try {
    current = readFileSync(toolInput.file_path, "utf8");
  } catch {
    return null;
  }
  return toolInput.replace_all
    ? current.split(toolInput.old_string).join(toolInput.new_string)
    : current.replace(toolInput.old_string, toolInput.new_string);
}

/**
 * Denies a Write or Edit of one .mjs/.mts file whose resulting text carries egregious loose prose comments.
 *
 * @summary Denies a Write or Edit whose resulting JavaScript text has egregious loose prose comments.
 * @param {object} input A Claude Code PreToolUse hook stdin payload.
 * @param {string} expectedEvent The lifecycle event this invocation was projected for.
 * @returns {object} A record naming the decision: allow, skip (not a checked file), or deny with a reason.
 * @throws {TypeError} When the input is not an object or names a different hook event.
 */
export function checkCommentDisciplineHook(input, expectedEvent) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new TypeError("hook input must be a JSON object");
  if (input.hook_event_name !== expectedEvent) throw new TypeError(`hook event '${input.hook_event_name}' does not match projected event '${expectedEvent}'`);
  const toolInput = input.tool_input;
  if (!CHECKED_TOOLS.has(input.tool_name) || !toolInput || typeof toolInput.file_path !== "string") {
    return { decision: "skip", reason: "not a checked Write/Edit tool call" };
  }
  if (!CHECKED_EXTENSIONS.has(extname(toolInput.file_path))) return { decision: "skip", reason: "not a .mjs/.mts file" };
  const text = resultingText(input.tool_name, toolInput);
  if (text === null) return { decision: "skip", reason: "could not resolve the resulting file text" };
  const report = checkJavascriptExportCommentDiscipline({ type: "TextFileRead", path: toolInput.file_path, text });
  const reason = egregiousJavascriptExportCommentDisciplineReason(report);
  return reason ? { decision: "deny", path: toolInput.file_path, reason } : { decision: "allow", path: toolInput.file_path };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  if (process.env[BYPASS_ENV_VAR] === "1") {
    process.exit(0);
  }
  try {
    const result = checkCommentDisciplineHook(await readBoundedHookInput(process.stdin), cliArgument("--expected-event"));
    if (result.decision === "deny") {
      process.stderr.write(`check-comment-discipline-hook: denied ${result.path}: ${result.reason} (bypass with ${BYPASS_ENV_VAR}=1)\n`);
      process.exit(2);
    }
  } catch (error) {
    process.stderr.write(`check-comment-discipline-hook: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
