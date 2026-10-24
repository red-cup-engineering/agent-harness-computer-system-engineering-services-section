#!/usr/bin/env node
/**
 * operations-custody-hook — refuse executable source written into an Operations section.
 *
 * The 561 Group's rule `science-engineering-operations-parameterize-in-order` (561-group-services-section
 * lib/agency/rules/): Science holds knowledge, Engineering holds executable implementations, Operations
 * (`*-operations-services-section`) holds the data that parameterizes Engineering, and Group/Public sections
 * hold the data that parameterizes Operations. Agents kept writing code into Coesite Operations anyway; this
 * hook stops a harness session before the file exists.
 *
 * Contract (shared with ./host-resource-hook.mjs): the PreToolUse event arrives as JSON on stdin; a refusal
 * leaves as `hookSpecificOutput` with `permissionDecision: "deny"` on stdout and exit 0; anything else prints
 * nothing. Claude Code: Write, Edit, MultiEdit and NotebookEdit carry `tool_input.file_path` (or
 * `notebook_path`). Codex: file edits arrive as an `apply_patch` envelope in `tool_input.command`; every
 * `*** Add File:` / `*** Update File:` / `*** Move to:` path is judged.
 *
 * A path is refused when one of its directories is named `*-operations-services-section`, the file has an
 * executable-source extension, and no directory on the way is `legacy` (retirement of retained legacy code
 * deletes or moves it; it never adds new code) or `node_modules`.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const OPERATIONS = /(^|-)operations-services-section$/u;
const CODE = /\.(?:mjs|cjs|js|jsx|mts|cts|ts|tsx|py|sh|bash|rb|go|rs|scm|el|lua|php|pl)$/iu;
const EXEMPT = new Set(["legacy", "node_modules"]);
const EDIT_TOOLS = /^(?:Write|Edit|MultiEdit|NotebookEdit)$/u;
const PATCH_PATH = /^\*\*\* (?:Add File|Update File|Move to): (.+)$/gmu;
const RULE = "https://github.com/561-group/561-group-services-section/blob/main/lib/agency/rules/science-engineering-operations-parameterize-in-order.json";

/** Whether writing `file` (absolute, or relative to `cwd`) puts executable source into an Operations section. */
export function isOperationsCode(file, cwd = process.cwd()) {
  if (typeof file !== "string" || file === "" || !CODE.test(file)) return false;
  const parts = path.resolve(cwd, file).split(path.sep);
  const directories = parts.slice(0, -1);
  return directories.some((part) => OPERATIONS.test(part)) && !directories.some((part) => EXEMPT.has(part));
}

/** The paths one PreToolUse event would write. */
export function writtenPaths(input) {
  const tool = String(input?.tool_name ?? "");
  const toolInput = input?.tool_input ?? {};
  if (EDIT_TOOLS.test(tool)) return [toolInput.file_path ?? toolInput.notebook_path].filter((p) => typeof p === "string");
  const command = Array.isArray(toolInput.command) ? toolInput.command.join("\n") : String(toolInput.command ?? "");
  if (!command.includes("*** Begin Patch")) return [];
  return [...command.matchAll(PATCH_PATH)].map((match) => match[1].trim());
}

/** The hook's answer to one event: the `hookSpecificOutput` refusal, or undefined to let the call run. */
export function decide(input) {
  const cwd = typeof input?.cwd === "string" ? input.cwd : process.cwd();
  const refused = writtenPaths(input).filter((file) => isOperationsCode(file, cwd));
  if (refused.length === 0) return undefined;
  return {
    hookEventName: "PreToolUse",
    permissionDecision: "deny",
    permissionDecisionReason: `operations custody: ${refused.join(", ")} would put executable source into an Operations section. `
      + "Operations sections hold the data (lib/agency, content, data) that Engineering software reads; build or repair the capability "
      + `at its Red Cup Engineering owner and name it from the Operations data instead. Rule: ${RULE}`,
  };
}

/** The `hooks` object registering this hook (Claude Code settings or Codex hooks.json). */
export function custodyHookEntries(hookPath = fileURLToPath(import.meta.url), { provider = "claude", node = process.execPath, timeout = 10 } = {}) {
  const command = `'${node}' '${hookPath}'`;
  return { PreToolUse: [{ matcher: provider === "codex" ? "Bash" : "Write|Edit|MultiEdit|NotebookEdit", hooks: [{ type: "command", command, timeout }] }] };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const output = decide(JSON.parse(readFileSync(0, "utf8")));
    if (output !== undefined) process.stdout.write(JSON.stringify({ hookSpecificOutput: output }));
  } catch {
    // An unreadable event is not this hook's to refuse.
  }
}
