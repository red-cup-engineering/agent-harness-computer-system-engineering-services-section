/**
 * The Claude Code dialect of the carrier session runner (agent-harness `carrier/session.mjs`):
 * `claude -p` in stream-json, on the subscription this host is signed in to. Claude Code's own
 * facts, read rather than assumed:
 *
 *   thread     the session id, pinned by the runner (`--session-id`, derived from the task id, so a
 *              restarted host resumes the same session with `--resume`) and witnessed by the init event;
 *   carrier    the model and effort the session's own transcript records on its assistant turns
 *              (`<config>/projects/<cwd>/<session>.jsonl`), up to the runner's frontier; the
 *              requested model is not the observed one;
 *   message    the result event's validated `structured_output` when the session was given an output
 *              schema, else its result text; a result that is an error is no message;
 *   usage      the result's token usage in the house's token-usage fields;
 *   allowance  the subscription's windows as the CLI's rate-limit event states them (`five_hour`,
 *              `seven_day`: utilization and reset), evidence for the allowance ledger;
 *   startup    every configured MCP server is required: one the init event shows unconnected is a
 *              failed start, as Codex's required server is.
 *
 * Permissions are least privilege: `dontAsk` denies every tool not allowed here, and what is
 * allowed follows the session's effects. A `read-only` session reads, searches and calls the node's
 * MetroPlat; a `workspace-write` one may also edit files under its working directories (its cwd and
 * `addDirs`) and check and test JavaScript. No session pushes, resets or rewrites history.
 */
import { createHash } from "node:crypto";
import { closeSync, existsSync, openSync, readdirSync, readSync, statSync } from "node:fs";
import { observeNativeToolAccounting } from "../../../src/transcripts/native-tool-observation.mjs";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { artifact, readOptional } from "../../../src/carrier/session.mjs";
import { hookSettingsArguments } from "../../../src/host-resource-hook.mjs";
import { CARRIER_WORKSPACE_RULE, assertNotSharedCheckout } from "../../../src/carrier/workspace.mjs";

/** The host-resource controller as this package holds it; a session lives no longer than the process that runs from it. */
const HOST_RESOURCE_HOOK = fileURLToPath(new URL("../../../src/host-resource-hook.mjs", import.meta.url));

const EFFORTS = new Set(["low", "medium", "high", "xhigh", "max"]);
const EFFECTS = new Set(["read-only", "workspace-write"]);

/** The session id a task's first session runs under: a UUID derived from the task id. */
export function claudeSessionId(taskId) {
  const hex = createHash("sha256").update(`claude-code-session:${taskId}`).digest("hex").split("");
  hex[12] = "4";
  hex[16] = "89ab"[Number.parseInt(hex[16], 16) % 4];
  const h = hex.join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

/** Claude Code's names for an MCP server's tools. */
export const claudeToolName = (server, tool) => `mcp__${server}__${tool}`;

const READ_TOOLS = Object.freeze(["Read", "Grep", "Glob", "Bash(git log:*)", "Bash(git show:*)", "Bash(git diff:*)", "Bash(git status:*)", "Bash(git ls-files:*)", "Bash(git grep:*)"]);
const WRITE_TOOLS = Object.freeze(["Edit", "Write", "NotebookEdit", "Bash(node --check:*)", "Bash(node --test:*)"]);
const DENIED_TOOLS = Object.freeze(["Bash(git push:*)", "Bash(git reset:*)", "Bash(git rebase:*)", "Bash(git checkout:*)", "Bash(git stash:*)", "Bash(git clean:*)", "Bash(codex:*)", "Bash(claude:*)"]);

/** The tools a session's effects allow, and the MCP servers it may call. */
export function claudeAllowedTools({ effects = "read-only", mcpServer }) {
  if (!EFFECTS.has(effects)) throw new TypeError(`Claude Code effects must be one of ${[...EFFECTS].join(", ")}`);
  return [...READ_TOOLS, ...(effects === "workspace-write" ? WRITE_TOOLS : []), ...(mcpServer === undefined ? [] : [`mcp__${mcpServer}`])];
}

function sharedArguments({ model, reasoningEffort, effects, mcpConfig, mcpServer, office, outputSchema, addDirs = [] }) {
  if (reasoningEffort !== undefined && !EFFORTS.has(reasoningEffort)) throw new TypeError("invalid Claude Code effort");
  if (mcpServer !== undefined && !/^[A-Za-z0-9_-]+$/u.test(mcpServer)) throw new TypeError("the MCP server must be a configured server name");
  if (office !== undefined && !(typeof office.name === "string" && /^[a-z0-9-]+$/u.test(office.name) && typeof office.prompt === "string" && office.prompt.length > 0)) {
    throw new TypeError("an office projection is { name, description, prompt }");
  }
  return [
    "-p", "--output-format", "stream-json", "--verbose",
    // The session's whole configuration is what the carrier gives it: no user, project or local settings, hooks or CLAUDE.md drift.
    // The one hook it is given is the host-resource controller, so a carrier session is denied the
    // commands that crashed the machine (an unscoped status of a 70k-file worktree) like any other.
    "--setting-sources", "", ...hookSettingsArguments(HOST_RESOURCE_HOOK), "--permission-mode", "dontAsk",
    ...(model === undefined ? [] : ["--model", model]),
    ...(reasoningEffort === undefined ? [] : ["--effort", reasoningEffort]),
    ...(mcpConfig === undefined ? [] : ["--mcp-config", mcpConfig]), "--strict-mcp-config",
    "--allowedTools", ...claudeAllowedTools({ effects, mcpServer }),
    "--disallowedTools", ...DENIED_TOOLS,
    ...addDirs.flatMap((directory) => ["--add-dir", directory]),
    ...(office === undefined ? [] : ["--agents", JSON.stringify({ [office.name]: { description: office.description ?? office.name, prompt: office.prompt } }), "--agent", office.name]),
    ...(outputSchema === undefined ? [] : ["--json-schema", JSON.stringify(outputSchema)]),
  ];
}

/** Read the carrier testimony of a Claude Code session from its own transcript: the model and effort
 *  of its last main-thread assistant turn at or before `before`. */
export function readClaudeSessionContext(thread, { before = Infinity, configHome = process.env.CLAUDE_CONFIG_DIR ?? path.join(homedir(), ".claude") } = {}) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(thread ?? "")) return undefined;
  const projects = path.join(configHome, "projects");
  let folders;
  try { folders = readdirSync(projects); } catch (error) { if (error.code === "ENOENT") return undefined; throw error; }
  const files = folders.map((folder) => path.join(projects, folder, `${thread}.jsonl`)).filter((file) => existsSync(file));
  if (files.length !== 1) return undefined;
  const file = files[0];
  const fd = openSync(file, "r");
  try {
    let position = statSync(file).size;
    let tail = Buffer.alloc(0);
    const contextOf = (line) => {
      const text = line.toString("utf8");
      if (!/"type"\s*:\s*"assistant"/u.test(text)) return undefined;
      let entry;
      try { entry = JSON.parse(text); } catch { return undefined; }
      if (entry.type !== "assistant" || entry.isSidechain === true || !Number.isFinite(Date.parse(entry.timestamp)) || Date.parse(entry.timestamp) > before) return undefined;
      const model = entry.message?.model;
      if (typeof model !== "string" || model.length === 0 || model === "<synthetic>") return undefined;
      return Object.freeze({ model, ...(typeof entry.effort === "string" ? { reasoningEffort: entry.effort } : {}), evidence: `${file}#${entry.uuid ?? entry.timestamp}` });
    };
    // Search backwards: no full transcript load or inference from task settings.
    while (position > 0) {
      const size = Math.min(position, 65_536);
      position -= size;
      const chunk = Buffer.alloc(size);
      readSync(fd, chunk, 0, size, position);
      const bytes = Buffer.concat([chunk, tail]);
      let end = bytes.length;
      for (let index = bytes.length - 1; index >= 0; index--) {
        if (bytes[index] !== 10) continue;
        const context = contextOf(bytes.subarray(index + 1, end));
        if (context !== undefined) return context;
        end = index;
      }
      tail = bytes.subarray(0, end);
    }
    return contextOf(tail);
  } finally { closeSync(fd); }
}

/** A result's token usage in the house's token-usage fields (organizing `TOKEN_USAGE_RESOURCES`). */
export function claudeTokenUsage(usage) {
  if (usage === null || typeof usage !== "object") return undefined;
  const fields = {
    input_tokens: usage.input_tokens,
    cached_input_tokens: usage.cache_read_input_tokens,
    cache_write_input_tokens: usage.cache_creation_input_tokens,
    output_tokens: usage.output_tokens,
    reasoning_output_tokens: usage.output_tokens_details?.thinking_tokens,
  };
  return Object.fromEntries(Object.entries(fields).filter(([, value]) => Number.isSafeInteger(value)));
}

const TRANSIENT = /overloaded|\b529\b|\b503\b|internal server error|api_error_status:5\d\d/iu;
const UNCONNECTED_MCP = /required MCP server .* did not connect/u;

/** The Claude Code CLI as a carrier dialect. */
export const claudeCodeDialect = Object.freeze({
  name: "claude-code",
  label: "Claude Code",
  pool: "claude",
  unit: "claude-task",
  tasks: "claude-tasks",
  reservationKind: "metroplat.claude-provider-reservation",
  executable: "claude",
  environment: Object.freeze(["CLAUDE_CONFIG_DIR"]),
  evidence: "claude-session",
  // Every Claude Code session on this account draws on its subscription's stated windows (CIE content/allowances).
  allowance: "claude-max",
  // Flow bounds of the carrier (agent-harness `carrier/flow-bounds.mjs`): what one task may draw when
  // its caller states no route budget, and how much variable context a prompt may inline.
  budget: Object.freeze({ turns: 6, tokens: 1_000_000 }),
  ceiling: 6_000,
  bytesPerToken: 4,
  // The result's output tokens already hold its thinking tokens.
  tokensOf: (usage) => ["input_tokens", "cache_write_input_tokens", "output_tokens"].reduce((sum, field) => sum + (Number.isFinite(usage[field]) ? usage[field] : 0), 0),
  // The subscription carries this house's interactive sessions too; headless carriers take few at once.
  usageLimit: 2,
  toolName: claudeToolName,
  checkOptions: ({ effects = "read-only" }) => { if (!EFFECTS.has(effects)) throw new TypeError(`Claude Code effects must be one of ${[...EFFECTS].join(", ")}`); },
  workspaceRule: CARRIER_WORKSPACE_RULE,
  // Every session, reading or writing, runs in a task worktree of its own, never the shared checkout.
  startArguments: (options) => [...sharedArguments({ ...options, cwd: assertNotSharedCheckout(claudeCodeDialect, options.cwd) }), "--session-id", claudeSessionId(options.taskId ?? path.basename(options.artifactDir))],
  resumeArguments: (options) => [...sharedArguments({ ...options, cwd: assertNotSharedCheckout(claudeCodeDialect, options.cwd) }), "--resume", options.thread],
  readSession: (directory) => {
    let init;
    let result;
    let allowance;
    for (const line of (readOptional(artifact(directory, "events.jsonl")) ?? "").split(/\r?\n/u)) {
      if (line.trim() === "") continue;
      let event;
      try { event = JSON.parse(line); } catch { continue; }
      if (event.type === "system" && event.subtype === "init") init ??= event;
      else if (event.type === "rate_limit_event" && event.rate_limit_info !== undefined) allowance = event.rate_limit_info;
      else if (event.type === "result") result = event;
    }
    const errors = [];
    const thread = typeof init?.session_id === "string" ? init.session_id : typeof result?.session_id === "string" ? result.session_id : undefined;
    const unconnected = (init?.mcp_servers ?? []).filter((server) => server?.status !== "connected");
    for (const server of unconnected) errors.push(`required MCP server ${server.name} did not connect (${server.status})`);
    const failed = unconnected.length > 0 || (result !== undefined && (result.is_error === true || result.subtype !== "success"));
    if (result !== undefined && failed) errors.push(`Claude Code ended ${result.subtype}${result.api_error_status ? ` (api_error_status:${result.api_error_status})` : ""}: ${String(result.result ?? "").slice(0, 500)}`);
    if (allowance?.status !== undefined && allowance.status !== "allowed") errors.push(`claude-allowance-${allowance.status}: ${allowance.rateLimitType ?? "window"} resets ${allowance.resetsAt === undefined ? "unknown" : new Date(allowance.resetsAt * 1000).toISOString()}`);
    const message = failed || result === undefined ? undefined
      : result.structured_output !== undefined && result.structured_output !== null ? JSON.stringify(result.structured_output)
        : typeof result.result === "string" && result.result.trim() !== "" ? result.result.trim() : undefined;
    const frontier = existsSync(artifact(directory, "exit-code")) ? artifact(directory, "exit-code") : artifact(directory, "events.jsonl");
    const carrier = thread === undefined || !existsSync(frontier) ? undefined : readClaudeSessionContext(thread, { before: statSync(frontier).mtimeMs });
    const toolAccounting = carrier !== undefined && existsSync(artifact(directory, "exit-code"))
      ? observeNativeToolAccounting({ runtime: "claude", evidence: carrier.evidence, before: statSync(frontier).mtimeMs }) : undefined;
    const usage = claudeTokenUsage(result?.usage);
    return {
      thread, message, failed, errors,
      ...(usage === undefined ? {} : { usage }),
      ...(toolAccounting === undefined ? {} : { toolAccounting }),
      ...(allowance === undefined ? {} : { allowance }),
      ...(carrier === undefined ? {} : { model: carrier.model, reasoningEffort: carrier.reasoningEffort, carrierEvidence: carrier.evidence }),
    };
  },
  stopReason: (directory) => {
    for (const line of (readOptional(artifact(directory, "events.jsonl")) ?? "").split(/\r?\n/u)) {
      if (!line.includes('"init"')) continue;
      let event;
      try { event = JSON.parse(line); } catch { continue; }
      if (event.type !== "system" || event.subtype !== "init") continue;
      const unconnected = (event.mcp_servers ?? []).find((server) => server?.status !== "connected");
      return unconnected === undefined ? undefined : `required MCP server ${unconnected.name} did not connect (${unconnected.status})`;
    }
    return undefined;
  },
  transient: (result) => !result.ok && (result.errors ?? []).some((error) => TRANSIENT.test(error)),
  startupFailure: (result) => !result.ok && (result.errors ?? []).some((error) => UNCONNECTED_MCP.test(error)),
});
