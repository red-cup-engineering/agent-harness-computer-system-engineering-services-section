/**
 * The Codex dialect of the carrier session runner (agent-harness `carrier/session.mjs`): `codex
 * exec` and `codex exec resume`, their JSON event stream, the last message Codex writes with `-o`,
 * and the model and effort its own session file records. Task callers give a session a durable
 * artifact directory; the Codex process runs in the transient user unit `codex-task-<id>`.
 *
 * Everything not Codex's own is the runner's; the names below keep the Codex task rail and its
 * tests on their existing terms.
 */
import { closeSync, existsSync, openSync, readdirSync, readSync, statSync } from "node:fs";
import { observeNativeToolAccounting } from "../../../src/transcripts/native-tool-observation.mjs";
import { homedir } from "node:os";
import path from "node:path";

import {
  POLL_INTERVAL_MS, RETRY_DELAYS_MS, artifact, harnessCapacitySnapshot, harnessConcurrency, harnessTaskArtifactDirectory, inProviderTurn,
  readHarnessSessionArtifacts, readOptional, recoverHarnessSession, releaseProviderTurn, reserveProviderTurn, resumeHarnessSession,
  retryableHarnessSession, retryTransientHarnessSession, runHarnessSession, runReservedProviderTurn, systemdCommand, waitForHarnessSession,
} from "../../../src/carrier/session.mjs";
import {
  CARRIER_WORKSPACE_RULE, FAILED_WORKTREES_KEPT, assertNotSharedCheckout as assertCarrierNotSharedCheckout, carrierTaskWorktree, carrierTraceNamed,
  carrierWorktreeRoot, finishCarrierWorktree, prepareCarrierWorktree, releaseCarrierWorktree,
} from "../../../src/carrier/workspace.mjs";

export { RETRY_DELAYS_MS, systemdCommand };

const SANDBOXES = new Set(["read-only", "workspace-write"]);

/** The names Codex gives an MCP server's tools: its exec tool exposes them as JavaScript
 *  identifiers, so every character outside [A-Za-z0-9_] in the server and tool names reads `_`. */
export const codexToolName = (server, tool) => `mcp__${String(server).replace(/[^A-Za-z0-9_]/gu, "_")}__${String(tool).replace(/[^A-Za-z0-9_]/gu, "_")}`;

/** How a Codex session reaches the MetroPlat instance assigned to its node: the configured server's
 *  command tool, called from its JavaScript exec tool. */
export function codexWorldReading(metroplatServer) {
  const server = typeof metroplatServer === "string" ? metroplatServer.trim() : "";
  const command = server
    ? `await tools.${codexToolName(server, "metroplat_world-command")}`
    : "the metroplat_world_command tool of this node's configured MetroPlat MCP server";
  return `Keep the current assignment and its receiver as the objective. The node's world is a tool in your JavaScript exec tool: ${command}({ line: 'journal' }) reads current obligations; it does not replace this assignment or authorize other work. Recover the matching original Work and its exact source method. Discover the installed contract before invoking an operation. Search historical context only to resolve a named missing premise; retain the source reference and reuse the result rather than repeat orientation. `;
}

const reasoningArgs = (reasoningEffort) => {
  if (reasoningEffort === undefined) return [];
  if (!["none", "minimal", "low", "medium", "high", "xhigh", "max", "ultra"].includes(reasoningEffort)) throw new TypeError("invalid Codex reasoning effort");
  return ["-c", `model_reasoning_effort="${reasoningEffort}"`];
};
// The required server is the node itself on a shared host: its handshake waits on the host's
// capacity, so a headless session grants it the stall a contended host can take (interactive
// configuration keeps its own 60 seconds).
const REQUIRED_MCP_STARTUP_SECONDS = 180;
const requiredMcpArgs = (server) => {
  if (server === undefined) return [];
  if (!/^[A-Za-z0-9_-]+$/u.test(server)) throw new TypeError("required MCP server must be a configured server name");
  return ["-c", `mcp_servers.${server}.required=true`, "-c", `mcp_servers.${server}.startup_timeout_sec=${REQUIRED_MCP_STARTUP_SECONDS}`];
};

/** Read execution testimony from Codex's own session, bounded by the runner's
 * observation frontier. A requested model is not an observed model, and a later
 * resume cannot retroactively qualify an earlier result. The subscription's windows
 * as Codex last stated them (`rate_limits` of its latest token count) come with it. */
export function readCodexSessionContext(thread, { before = Infinity, codexHome = process.env.CODEX_HOME ?? path.join(homedir(), ".codex") } = {}) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(thread ?? "")) return undefined;
  const created = Number.parseInt(thread.replaceAll("-", "").slice(0, 12), 16);
  const files = [];
  for (const offset of [-1, 0, 1]) {
    const day = new Date(created + offset * 86_400_000).toISOString().slice(0, 10).replaceAll("-", "/");
    const folder = path.join(codexHome, "sessions", day);
    try { files.push(...readdirSync(folder).filter(name => name.endsWith(`-${thread}.jsonl`)).map(name => path.join(folder, name))); }
    catch (error) { if (error.code !== "ENOENT") throw error; }
  }
  if (files.length !== 1) return undefined;
  const file = files[0];
  const fd = openSync(file, "r");
  try {
    let position = statSync(file).size;
    let tail = Buffer.alloc(0);
    let limits;
    const limitsOf = text => {
      if (limits !== undefined || !text.includes('"rate_limits"')) return;
      let entry;
      try { entry = JSON.parse(text); } catch { return; }
      if (entry.payload?.type === "token_count" && entry.payload.rate_limits && Date.parse(entry.timestamp) <= before) limits = entry.payload.rate_limits;
    };
    const contextOf = line => {
      const text = line.toString("utf8");
      limitsOf(text);
      if (!/"type"\s*:\s*"turn_context"/u.test(text)) return undefined;
      let entry;
      try { entry = JSON.parse(text); } catch { return undefined; }
      if (entry.type !== "turn_context" || !Number.isFinite(Date.parse(entry.timestamp)) || Date.parse(entry.timestamp) > before || typeof entry.payload?.model !== "string") return undefined;
      const effort = entry.payload.effort ?? entry.payload.reasoning_effort;
      return Object.freeze({ model: entry.payload.model, ...(typeof effort === "string" ? { reasoningEffort: effort } : {}), evidence: `${file}#${entry.timestamp}`, ...(limits === undefined ? {} : { allowance: limits }) });
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

/** A provider with no room for the turn stops a session without the work having failed. */
const TRANSIENT = /at capacity|overloaded/iu;
export const transientCodexFailure = (result) => !result.ok && (result.errors ?? []).some((error) => TRANSIENT.test(error));
// A failed transport handshake before thread.start is not an agent's work
// outcome. Direct receiving opts into three starts, preserving every failure.
// Production allocation retains its own existing startup recovery boundary.
const requiredMcpStartupFailure = result => !result.ok && result.thread === undefined
  && result.exitCode !== undefined && result.exitCode !== 0
  && (result.errors ?? []).some(error => /required MCP servers failed to initialize/u.test(error)
    && /client_credentials token request failed: (502|503|504)\b|timed out handshaking with MCP server after [\d.]+s\b/u.test(error));

/** The Codex session's workspace policy is the carrier's (`carrier/workspace.mjs`); these bind it to
 *  the Codex dialect under the names the Codex task rail and its tests use. */
export const assertNotSharedCheckout = (cwd) => assertCarrierNotSharedCheckout(codexDialect, cwd);
export const CODEX_WORKSPACE_RULE = CARRIER_WORKSPACE_RULE;

const sandboxOf = (sandbox = "workspace-write") => {
  if (!SANDBOXES.has(sandbox)) throw new TypeError(`sandbox must be one of ${[...SANDBOXES].join(", ")}`);
  return sandbox;
};

/** The Codex CLI as a carrier dialect. */
export const codexDialect = Object.freeze({
  name: "codex",
  label: "Codex",
  pool: "codex",
  unit: "codex-task",
  tasks: "codex-tasks",
  reservationKind: "metroplat.codex-provider-reservation",
  executable: "codex",
  environment: Object.freeze(["CODEX_HOME"]),
  evidence: "codex-thread",
  // Every Codex session on this account draws on its ChatGPT plan's stated windows (CIE content/allowances).
  allowance: "chatgpt-codex",
  workspaceRule: CODEX_WORKSPACE_RULE,
  toolName: codexToolName,
  checkOptions: ({ sandbox }) => { sandboxOf(sandbox); },
  startArguments: ({ cwd, sandbox, model, reasoningEffort, requiredMcpServer, lastFile }) => ["exec", "--json", "--skip-git-repo-check", "-C", assertNotSharedCheckout(cwd), "-s", sandboxOf(sandbox), "-o", lastFile, ...(model === undefined ? [] : ["-m", model]), ...reasoningArgs(reasoningEffort), ...requiredMcpArgs(requiredMcpServer), "-"],
  resumeArguments: ({ cwd, thread, sandbox, model, reasoningEffort, requiredMcpServer, lastFile }) => (assertNotSharedCheckout(cwd), ["exec", "resume", "--json", "--skip-git-repo-check", "-o", lastFile, "-c", `sandbox_mode="${sandboxOf(sandbox)}"`, ...(model === undefined ? [] : ["-m", model]), ...reasoningArgs(reasoningEffort), ...requiredMcpArgs(requiredMcpServer), thread, "-"]),
  /** The thread, usage and errors of Codex's event stream, its `-o` last message, and the model and
   *  effort its session file records up to the runner's frontier. */
  readSession: (directory) => {
    let thread;
    let usage;
    const errors = [];
    for (const line of (readOptional(artifact(directory, "events.jsonl")) ?? "").split(/\r?\n/u)) {
      if (line.trim() === "") continue;
      let event;
      try { event = JSON.parse(line); } catch { continue; }
      if (typeof event.thread_id === "string") thread ??= event.thread_id;
      if (event.usage !== undefined) usage = event.usage;
      if (event.type === "error" || event.type === "turn.failed") errors.push(event.message ?? event.error?.message ?? JSON.stringify(event).slice(0, 500));
    }
    const rawMessage = readOptional(artifact(directory, "last-message.txt"));
    const message = rawMessage === undefined || rawMessage.trim() === "" ? undefined : rawMessage.trim();
    const frontier = existsSync(artifact(directory, "exit-code")) ? artifact(directory, "exit-code") : artifact(directory, "events.jsonl");
    const carrier = thread === undefined || !existsSync(frontier) ? undefined : readCodexSessionContext(thread, { before: statSync(frontier).mtimeMs });
    const toolAccounting = carrier !== undefined && existsSync(artifact(directory, "exit-code"))
      ? observeNativeToolAccounting({ runtime: "codex", evidence: carrier.evidence, before: statSync(frontier).mtimeMs }) : undefined;
    return { thread, message, usage, errors, ...(toolAccounting === undefined ? {} : { toolAccounting }), ...(carrier === undefined ? {} : { model: carrier.model, reasoningEffort: carrier.reasoningEffort, carrierEvidence: carrier.evidence, ...(carrier.allowance === undefined ? {} : { allowance: carrier.allowance }) }) };
  },
  transient: transientCodexFailure,
  startupFailure: requiredMcpStartupFailure,
});

/** Derive the number of concurrent Codex sessions from the host at the moment a queue drains. */
export const codexConcurrency = (environment = process.env, host) => harnessConcurrency(codexDialect, environment, ...(host === undefined ? [] : [host]));
/** Provider-wide host capacity. Different model carriers share the same persisted slot files. */
export const codexCapacitySnapshot = (environment = process.env, host) => harnessCapacitySnapshot(codexDialect, environment, ...(host === undefined ? [] : [host]));
/** Atomically reserve from the host-wide budget. Independent processes and model carriers share it. */
export const inTurn = (task, options) => inProviderTurn(codexDialect, task, options);
export const reserveCodexProviderTurn = (options) => reserveProviderTurn(codexDialect, options);
export const runReservedCodexProviderTurn = (reservation, task) => runReservedProviderTurn(codexDialect, reservation, task);
export const releaseCodexProviderTurn = (reservation) => releaseProviderTurn(codexDialect, reservation);
export async function withReservedCodexProviderTurn(reservation, task) {
  try { return await runReservedCodexProviderTurn(reservation, task); }
  finally { await releaseCodexProviderTurn(reservation); }
}

/** The stable storage owned by one dispatched task (`data/state/codex-tasks/<id>`). */
export const codexTaskArtifactDirectory = (dataRoot, id, formerRoots = []) => harnessTaskArtifactDirectory(codexDialect, dataRoot, id, formerRoots);
/** Derive the result and its actual carrier from runner and native session evidence. */
export const readCodexSessionArtifacts = (directory) => readHarnessSessionArtifacts(codexDialect, directory);
/** Wait for the wrapper's atomic completion marker, stopping its unit when the bound expires. */
export const waitForCodexSession = (options) => waitForHarnessSession(codexDialect, options);
export const retryableCodexSession = (result, options) => retryableHarnessSession(codexDialect, result, options);
export const retryTransientCodexSession = (result, { codex, sandbox = "workspace-write", ...options }) => retryTransientHarnessSession(codexDialect, result, { ...options, sandbox, ...(codex === undefined ? {} : { executable: codex }) });
/** `{ prompt, cwd, artifactDir?, taskId?, sandbox?, model?, reasoningEffort?, requiredMcpServer?, codex?, timeoutMs?, systemRunner?, retryDelaysMs? }`
 *  to `{ ok, exitCode, thread, message, usage, errors }`. A task supplies its durable artifactDir. */
export const runCodexSession = ({ codex, sandbox = "workspace-write", ...options }) => runHarnessSession(codexDialect, { ...options, sandbox, ...(codex === undefined ? {} : { executable: codex }) });
/** Recover only after the original runner is observably gone. */
export const recoverCodexSession = ({ codex, sandbox = "workspace-write", ...options }) => recoverHarnessSession(codexDialect, { ...options, sandbox, ...(codex === undefined ? {} : { executable: codex }) });

export { FAILED_WORKTREES_KEPT };
export const codexWorktreeRoot = (environment = process.env) => carrierWorktreeRoot(codexDialect, environment);
export const codexTaskWorktree = (taskId, environment = process.env) => carrierTaskWorktree(codexDialect, taskId, environment);
export const prepareCodexWorktree = (options) => prepareCarrierWorktree(codexDialect, options);
export const releaseCodexWorktree = (options) => releaseCarrierWorktree(codexDialect, options);
export const codexTraceNamed = carrierTraceNamed;
/** A task's trace, committed and named a candidate to the merge queue (`branch` defaults to `codex/<task>`). */
export const finishCodexWorktree = (options) => finishCarrierWorktree(codexDialect, options);

export const conflictResolutionPrompt = (conflicts) => [
  "While you worked, origin/main moved, and your change no longer joins it cleanly. Your whole change has been replayed onto current origin/main in this worktree; these files hold conflict markers:",
  ...conflicts.map((file) => `- ${file}`),
  "Resolve every conflict so that both main's changes and the intent of your change survive. Where main moved, renamed or restructured what your change touched, carry your change into main's new shape; never restore the old one. Update any other file your change needs in order to stay consistent with current main. If main already does what your change did, make the files match main. A file that says it is generated (\"Generated by …; do not edit\") is never merged by hand: resolve its sources, then run its generator; a lockfile is regenerated by its package manager.",
  "Do not run Git commands that write (add, commit, rebase, reset, checkout, stash): what you leave in the worktree is committed for you. End with one line per file saying how you resolved it.",
  "",
].join("\n");

/**
 * Hand a task's conflicting change back to the session that wrote it: resume its `thread` in the task's
 * worktree, where the change stands replayed onto origin/main with `conflicts` marked. Each resolution
 * keeps its own artifacts (`resolution-<n>/` under the task's directory) and is carried on through a
 * provider's lack of room like the task's session. Resolves true when the session finished its turn.
 */
export async function resolveCodexConflicts({ thread, conflicts, artifactDir, cwd, taskId, sandbox = "workspace-write", model, reasoningEffort, requiredMcpServer, codex, timeoutMs, pollIntervalMs = POLL_INTERVAL_MS, systemRunner = systemdCommand, retryDelaysMs = RETRY_DELAYS_MS, onSession }) {
  if (typeof thread !== "string") return false;
  const number = readdirSync(artifactDir).filter((name) => /^resolution-\d+$/u.test(name)).length + 1;
  const result = await resumeHarnessSession(codexDialect, {
    thread, prompt: conflictResolutionPrompt(conflicts), directory: artifact(artifactDir, `resolution-${number}`), cwd,
    unitTask: `${taskId ?? path.basename(artifactDir)}-resolution-${number}`, sandbox, model, reasoningEffort, requiredMcpServer,
    ...(codex === undefined ? {} : { executable: codex }), ...(timeoutMs === undefined ? {} : { timeoutMs }), pollIntervalMs, systemRunner, retryDelaysMs, onSession,
  });
  return result.ok;
}
