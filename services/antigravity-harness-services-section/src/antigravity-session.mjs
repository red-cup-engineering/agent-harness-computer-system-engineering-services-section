/**
 * The Antigravity dialect of the carrier session runner (agent-harness `carrier/session.mjs`):
 * `agy` in headless stream-json, on the Google AI Pro subscription this host is signed in to.
 * Antigravity's own facts, read from its output rather than assumed:
 *
 *   input      one NDJSON user event on stdin (`promptOf` frames the runner's prompt file as one);
 *   thread     the conversation id every event carries (`conversation_id`), resumed with `--conversation`;
 *   carrier    agy's event stream only echoes the model asked for (`init.model`, without its effort);
 *              its own log (`--log-file <artifactDir>/agy.log`) names what it propagated to its
 *              backend, as a label ("Gemini 3.8 Flash (Low)"), up to the runner's frontier. The label
 *              is read as the house reads every carrier, a model and an effort (`gemini-3.8-flash`,
 *              `low`), and nothing else of the log (it also holds the account's email) is kept;
 *   message    the result event's validated `structured_output` when the session was given an output
 *              schema, else its response text; a result whose status is not SUCCESS is no message;
 *   usage      the result's token usage (`input_tokens`, `output_tokens`, `thinking_tokens`,
 *              `cache_read_tokens`) in the house's token-usage fields;
 *   quota      a weekly-compute refusal is allowance exhaustion, not a transient fault.
 *
 * Authority is the runner's, not agy's (observed 2026-10-03): headless agy writes files in its
 * workspace and /tmp unasked, `--mode` has no effect while slash commands are disabled, and
 * `--sandbox` confines its terminal inconsistently (the workspace read-only to it, or nothing once a
 * write is granted). So every session runs as the carrier's own home (`home`: its settings'
 * permission allowlist, its MetroPlat MCP client, the account's login linked in) and is confined by
 * its unit (`confinement`): the filesystem is read-only but for its artifacts, that home, agy's
 * login directory and, for `workspace-write`, its workspace and that workspace's git directory.
 * A reading session also keeps `--sandbox`. No session is given `--dangerously-skip-permissions`.
 */
import { execFileSync } from "node:child_process";
import { existsSync, realpathSync, statSync } from "node:fs";
import path from "node:path";

import { artifact, readOptional } from "../../../src/carrier/session.mjs";
import { CARRIER_WORKSPACE_RULE, assertNotSharedCheckout } from "../../../src/carrier/workspace.mjs";

const EFFORTS = new Set(["low", "medium", "high", "xhigh", "max"]);
const EFFECTS = new Set(["read-only", "workspace-write"]);

/** Antigravity's names for an MCP server's tools: agy configures MCP globally and calls them through `call_mcp_tool`. */
export const antigravityToolName = (server, tool) => `${server}/${tool}`;

/** The stdin bytes of one turn: a single stream-json user event. */
export const antigravityPrompt = (text) => `${JSON.stringify({ event: "user", message: { role: "user", content: [{ type: "text", text }] } })}\n`;

function checkEffects(effects = "read-only") {
  if (!EFFECTS.has(effects)) throw new TypeError(`Antigravity effects must be one of ${[...EFFECTS].join(", ")}`);
  return effects;
}

const LOG_FILE = "agy.log";
const MODEL_LINE = /^([IWEF])(\d{2})(\d{2}) (\d{2}):(\d{2}):(\d{2})\.\d+\s.*Propagating selected model override to backend: label="([^"]+)"/u;

/** The carrier agy's log last propagated at or before `before` (ms): the label's model ("Gemini 3.8 Flash (High)"
 *  is `gemini-3.8-flash`), the effort in its parentheses (`high`), and evidence naming the log and line time. */
export function readAntigravityLogModel(file, { before = Infinity } = {}) {
  const text = readOptional(file);
  if (text === undefined) return undefined;
  const year = new Date(Number.isFinite(before) ? before : Date.now()).getFullYear();
  let found;
  for (const line of text.split(/\r?\n/u)) {
    if (!line.includes("Propagating selected model override")) continue;
    const match = MODEL_LINE.exec(line);
    if (match === null) continue;
    const [, , month, day, hour, minute, second, label] = match;
    if (new Date(year, Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second)).getTime() > before) continue;
    const model = label.replace(/\([^)]*\)/gu, "").trim().toLowerCase().replace(/\s+/gu, "-");
    if (model === "") continue;
    const effort = /\(([^)]+)\)/u.exec(label)?.[1].trim().toLowerCase();
    found = { model, ...(effort === undefined || effort === "" ? {} : { reasoningEffort: effort }), evidence: `${file}#${line.split(/\s+/u)[0]} ${line.split(/\s+/u)[1]}` };
  }
  return found;
}

const GEMINI_EFFORTS = new Set(["low", "medium", "high"]);

function sharedArguments({ model, reasoningEffort, effects, outputSchema, addDirs = [], artifactDir }) {
  if (reasoningEffort !== undefined && !EFFORTS.has(reasoningEffort)) throw new TypeError("invalid Antigravity effort");
  if (outputSchema !== undefined && (outputSchema === null || typeof outputSchema !== "object" || Array.isArray(outputSchema))) throw new TypeError("Antigravity JSON schema must be an object");
  let selectedModel = model;
  let selectedEffort = reasoningEffort;
  if (model !== undefined && model !== "default") {
    const geminiBase = model.startsWith("gemini-3.8-flash") ? "gemini-3.8-flash" : model.startsWith("gemini-4-argon") ? "gemini-4-argon" : undefined;
    if (geminiBase !== undefined) {
      const rest = model.slice(geminiBase.length);
      if (rest === "") {
        if (reasoningEffort !== undefined && !GEMINI_EFFORTS.has(reasoningEffort)) throw new TypeError("invalid Antigravity effort");
        selectedModel = reasoningEffort === undefined ? model : `${geminiBase}-${reasoningEffort}`;
      } else if (rest.startsWith("-")) {
        const suffix = rest.slice(1);
        if (!GEMINI_EFFORTS.has(suffix) || (reasoningEffort !== undefined && reasoningEffort !== suffix)) {
          throw new TypeError("invalid Antigravity effort");
        }
        selectedModel = model;
      } else {
        throw new TypeError("invalid Antigravity effort");
      }
      selectedEffort = undefined;
    }
  }
  return [
    "--input-format", "stream-json", "--output-format", "stream-json", "--disable-slash-commands",
    ...(checkEffects(effects) === "read-only" ? ["--sandbox"] : []),
    ...(artifactDir === undefined ? [] : ["--log-file", artifact(artifactDir, LOG_FILE)]),
    ...(selectedModel === undefined || selectedModel === "default" ? [] : ["--model", selectedModel]),
    ...(selectedEffort === undefined ? [] : ["--effort", selectedEffort]),
    ...addDirs.flatMap((directory) => ["--add-dir", directory]),
    ...(outputSchema === undefined ? [] : ["--json-schema", JSON.stringify(outputSchema)]),
    // An empty attached print prompt: the turn comes from the stream-json input.
    "-p=",
  ];
}

/** A result's token usage in the house's token-usage fields (organizing `TOKEN_USAGE_RESOURCES`). */
export function antigravityTokenUsage(usage) {
  if (usage === null || typeof usage !== "object") return undefined;
  const fields = {
    input_tokens: usage.input_tokens,
    cached_input_tokens: usage.cache_read_tokens,
    cache_write_input_tokens: usage.cache_write_tokens,
    output_tokens: usage.output_tokens,
    reasoning_output_tokens: usage.thinking_tokens,
  };
  return Object.fromEntries(Object.entries(fields).filter(([, value]) => Number.isSafeInteger(value)));
}

const QUOTA_REFUSAL = /quota|rate.?limit|resource.?exhausted|usage limit|\b429\b|weekly/iu;
const TRANSIENT = /overloaded|unavailable|\b50[0234]\b|internal server error|deadline exceeded/iu;

function isAgyErrorRetryable(error) {
  const match = /^AGY_ERROR:\s*(\{[^\r\n]*\})\s*$/mu.exec(error);
  if (match === null) return false;
  try { return JSON.parse(match[1])?.retryable === true; } catch { return false; }
}

const LOGIN = path.join(".gemini", "antigravity-cli", "antigravity-oauth-token");

/** A carrier home: a directory holding agy's own state for one character, with the account's login linked in. */
function antigravityHome(home) {
  if (typeof home !== "string" || !path.isAbsolute(home) || !existsSync(path.join(home, LOGIN))) throw new TypeError("an Antigravity session needs its carrier home (with the account's login linked in)");
  return home;
}

/** What a session may write: its home, agy's login directory (the token refreshes there) and, when it
 *  writes its workspace, that task worktree and the git directory of that worktree alone (its index
 *  and HEAD; the repository's shared objects and refs stay read-only, the runner commits and names the
 *  candidate). The unit's working directory is the task worktree itself: never the shared checkout. */
export function antigravityConfinement({ effects = "read-only", cwd, home }) {
  const carrierHome = antigravityHome(home);
  const workspace = assertNotSharedCheckout(antigravityDialect, cwd);
  const writable = [carrierHome, path.dirname(realpathSync(path.join(carrierHome, LOGIN)))];
  if (checkEffects(effects) === "workspace-write") {
    writable.push(workspace);
    try { writable.push(path.resolve(workspace, execFileSync("git", ["rev-parse", "--absolute-git-dir"], { cwd: workspace, encoding: "utf8" }).trim())); } catch { /* not a repository */ }
  }
  return Object.freeze({ writable: Object.freeze(writable), environment: Object.freeze({ HOME: carrierHome }) });
}

/** The Antigravity CLI as a carrier dialect. */
export const antigravityDialect = Object.freeze({
  name: "antigravity",
  label: "Antigravity",
  pool: "antigravity",
  unit: "antigravity-task",
  tasks: "antigravity-tasks",
  reservationKind: "metroplat.antigravity-provider-reservation",
  executable: "agy",
  // PATH is passed; HOME is the carrier's own (`confinement`).
  environment: Object.freeze([]),
  evidence: "antigravity-conversation",
  allowance: "google-ai-pro-antigravity",
  usageLimit: 1,
  toolName: antigravityToolName,
  checkOptions: ({ effects, home }) => { checkEffects(effects); antigravityHome(home); },
  confinement: (options) => antigravityConfinement(options),
  promptOf: antigravityPrompt,
  workspaceRule: CARRIER_WORKSPACE_RULE,
  // Every session, reading or writing, runs in a task worktree of its own, never the shared checkout.
  startArguments: (options) => (assertNotSharedCheckout(antigravityDialect, options.cwd), sharedArguments(options)),
  resumeArguments: (options) => (assertNotSharedCheckout(antigravityDialect, options.cwd), [...sharedArguments(options), "--conversation", options.thread]),
  readSession: (directory) => {
    let thread;
    let result;
    for (const line of (readOptional(artifact(directory, "events.jsonl")) ?? "").split(/\r?\n/u)) {
      if (line.trim() === "") continue;
      let event;
      try { event = JSON.parse(line); } catch { continue; }
      if (event === null || typeof event !== "object") continue;
      const id = event.conversation_id ?? event.step_update?.conversation_id ?? event.result?.conversation_id;
      if (thread === undefined && typeof id === "string" && id !== "") thread = id;
      if (event.event === "result") result = event.result;
    }
    if (typeof result?.conversation_id === "string" && result.conversation_id !== "") thread = result.conversation_id;
    const errors = [];
    const failed = result !== undefined && result.status !== "SUCCESS";
    if (failed) {
      const detail = String(result.error ?? result.response ?? "").slice(0, 500);
      errors.push(`${QUOTA_REFUSAL.test(detail) ? "antigravity-weekly-compute-exhausted: " : ""}Antigravity ended ${result.status}${detail === "" ? "" : `: ${detail}`}`);
    }
    const structured = result?.structured_output;
    const message = failed || result === undefined ? undefined
      : structured !== undefined && structured !== null ? JSON.stringify(structured)
        : typeof result.response === "string" && result.response.trim() !== "" ? result.response.trim() : undefined;
    const usage = antigravityTokenUsage(result?.usage);
    const frontier = existsSync(artifact(directory, "exit-code")) ? artifact(directory, "exit-code") : artifact(directory, "events.jsonl");
    const carrier = existsSync(frontier) ? readAntigravityLogModel(artifact(directory, LOG_FILE), { before: statSync(frontier).mtimeMs }) : undefined;
    return {
      thread, message, failed, errors,
      ...(usage === undefined ? {} : { usage }),
      ...(carrier === undefined ? {} : { model: carrier.model, ...(carrier.reasoningEffort === undefined ? {} : { reasoningEffort: carrier.reasoningEffort }), carrierEvidence: carrier.evidence }),
    };
  },
  // A quota refusal is allowance exhaustion; only overload or server faults are worth another attempt.
  transient: (result) => !result.ok && !(result.errors ?? []).some((error) => QUOTA_REFUSAL.test(error)) && (result.errors ?? []).some((error) => TRANSIENT.test(error) || isAgyErrorRetryable(error)),
  startupFailure: (result) => result.thread === undefined && !(result.errors ?? []).some((error) => QUOTA_REFUSAL.test(error)) && (result.errors ?? []).some((error) => /^Antigravity ended ERROR: invalid model selection\b[^\r\n]*--effort is not supported for model\b/iu.test(error)),
});
