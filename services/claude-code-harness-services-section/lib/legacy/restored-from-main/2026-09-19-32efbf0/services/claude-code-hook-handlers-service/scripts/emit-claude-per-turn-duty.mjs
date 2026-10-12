#!/usr/bin/env node
// UserPromptSubmit: the turn's own duty, added as context before the model
// reads the prompt -- who this session is (the seated role its policy names,
// verified by the seating law) and which already-declared capabilities are
// relevant to what was just asked (the jsnode capability graph's own answer,
// over the configured MCP endpoint, under a deadline).
//
// A turn that cannot be told either of those still runs: an unavailable
// identity or an unreachable capability graph is stated as unavailable, never
// invented and never fatal.
import { CONTINUE, respond } from "@red-cup-engineering/agent-lifecycle-hook-service";
import { processStreams, runAgentLifecycleHook } from "@red-cup-engineering/agent-lifecycle-hook-service/run-agent-lifecycle-hook";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { readFileText } from "@red-cup-engineering/file-services/read-file";
import { confinePath } from "@red-cup-engineering/filepath-services-section";
import { argument } from "@red-cup-engineering/javascript-node-services-section/argv";
import { readMachineParameters, repositoryRootOf } from "./machine-parameters.mjs";

const MAX_BYTES = 4000;

/**
 * The seated identity this turn speaks from: one of the policy's own roles,
 * resolved against the repository root and verified the way the seating law
 * verifies it (the incumbency seats that exact office, its holder resolves to
 * the named character record, and recognition and induction are both
 * affirmed). An unseated or half-seated policy reads as unavailable rather
 * than being patched with a default.
 *
 * @param {object} options
 * @param {object} options.policy - an admitted AgentHarnessPolicy.
 * @param {string} options.root - repository root the role's record paths resolve against.
 * @param {string} [options.roleId] - which role to speak from; defaults to the policy's first.
 * @param {typeof readFileText} [options.readText]
 * @returns {Promise<{state: "recognized", actor: string, office: string, character: string, incumbency: string}|{state: "unavailable", reason: string}>}
 */
export async function readIdentity({ policy, root, roleId, readText = readFileText } = {}) {
  const roles = Array.isArray(policy?.roles) ? policy.roles : [];
  const role = roleId === undefined ? roles[0] : roles.find((candidate) => candidate.id === roleId);
  if (!role) return { state: "unavailable", reason: roleId === undefined ? "the policy seats no role" : `the policy seats no role '${roleId}'` };
  try {
    const read = async (path) => JSON.parse(await readText(confinePath({ root, path }).path));
    const character = await read(role.character);
    const incumbency = await read(role.incumbency);
    if (
      incumbency.holder !== character.id
      || incumbency.office !== role.office
      || incumbency.recognition !== "t"
      || incumbency.induction !== "t"
    ) return { state: "unavailable", reason: `role '${role.id}' is not recognized and inducted` };
    return { state: "recognized", actor: policy.actor, office: incumbency.office, character: character.id, incumbency: incumbency.id };
  } catch (error) {
    return { state: "unavailable", reason: error instanceof Error ? error.message : String(error) };
  }
}

function byteLength(text) {
  return Buffer.byteLength(text, "utf8");
}

function appendEntries(prefix, entries, bytes) {
  let text = prefix;
  for (const entry of entries) {
    const separator = text === prefix ? "" : "; ";
    if (byteLength(text) + byteLength(separator) + byteLength(entry) > bytes) continue;
    text += `${separator}${entry}`;
  }
  return text;
}

/**
 * Renders the capability graph's answer as one bounded context line: every
 * declared invocation and export it named, whole entries only, never a
 * truncated coordinate. A refusal or an outage is rendered as itself, with the
 * sizes the projector reported, so a context-less turn is diagnosable from the
 * transcript alone.
 *
 * @param {unknown} value - the capability graph's result.
 * @param {number} [bytes] - the byte budget for this line.
 * @returns {string}
 */
export function renderContext(value, bytes = MAX_BYTES) {
  if (!value || typeof value !== "object") return "context: unavailable";
  if (value.kind === "coding-context.relevance.refusal") {
    const reason = value.reason ?? "request refused";
    const sizes = [
      typeof value.requiredBytes === "number" ? `needed ${value.requiredBytes}b` : null,
      typeof value.maxBytes === "number" ? `budget ${value.maxBytes}b` : null,
      typeof value.promptBytes === "number" ? `prompt ${value.promptBytes}b` : null,
    ].filter((entry) => entry !== null);
    return sizes.length > 0 ? `context: refused (${reason}; ${sizes.join(", ")})` : `context: refused (${reason})`;
  }
  if (value.kind === "coding-context.unavailable" || value.isError) return `context: unavailable (${value.reason ?? "request failed"})`;
  const invocations = new Set();
  const descriptions = new Set();
  const prefix = value.metadata?.root ? `${value.metadata.root}/` : "";
  for (const row of value.packages ?? []) {
    if (row?.package) descriptions.add(`package ${row.package}${row.packagePath ? ` at ${row.packagePath}` : ""}`);
    for (const bin of row?.bins ?? []) {
      if (bin?.bin && bin?.target) invocations.add(`invoke ${bin.bin}: ${prefix}${row.packagePath}/${bin.target.replace(/^\.\//u, "")}`);
    }
    for (const exported of row?.exports ?? []) {
      if (row?.package) descriptions.add(`export ${exported === "." ? row.package : `${row.package}/${String(exported).replace(/^\.\//u, "")}`}`);
    }
  }
  for (const row of value.scripts ?? []) {
    if (row?.bin && row?.target) invocations.add(`invoke ${row.bin}: ${prefix}${row.packagePath}/${row.target.replace(/^\.\//u, "")}`);
  }
  if (invocations.size + descriptions.size === 0) return "context: no matching declared capability";
  return appendEntries("relevant capability evidence: ", [...invocations, ...descriptions], bytes);
}

/**
 * Asks the configured capability-graph MCP endpoint which declared
 * capabilities are relevant to one prompt.
 *
 * @param {string} prompt - the turn's exact prompt.
 * @param {string} mcpConfigText - the MCP client configuration's JSON text.
 * @param {AbortSignal} [signal]
 * @returns {Promise<object>}
 */
export async function queryContext(prompt, mcpConfigText, signal) {
  const url = JSON.parse(mcpConfigText)?.mcpServers?.["jsnode-server"]?.url;
  if (typeof url !== "string") throw new Error("configured jsnode-server MCP endpoint is unavailable");
  const client = new Client({ name: "claude-per-turn-context", version: "1" });
  const transport = new StreamableHTTPClientTransport(new URL(url));
  const abort = () => {
    void client.close();
  };
  signal?.addEventListener("abort", abort, { once: true });
  try {
    await client.connect(transport);
    const result = await client.callTool({ name: "jsnode_context", arguments: { prompt, limit: 4, maxBytes: MAX_BYTES } }, undefined, { signal });
    if (result.isError) {
      return { kind: "coding-context.unavailable", isError: true, reason: result.content?.[0]?.text ?? "MCP context request failed" };
    }
    return result.structuredContent ?? JSON.parse(result.content?.[0]?.text ?? "{}");
  } finally {
    signal?.removeEventListener("abort", abort);
    await client.close();
  }
}

/**
 * Races one call against a deadline, aborting it when the deadline passes.
 *
 * @param {(signal: AbortSignal) => Promise<unknown>} call
 * @param {number} [milliseconds]
 * @returns {Promise<unknown>}
 */
export async function withTimeout(call, milliseconds = 3000) {
  const controller = new AbortController();
  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const error = new Error("context deadline exceeded");
      controller.abort(error);
      reject(error);
    }, milliseconds);
  });
  try {
    return await Promise.race([call(controller.signal), deadline]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Rules on one UserPromptSubmit event: the turn's identity line and relevant
 * capability evidence, as additionalContext.
 *
 * @param {object} event - one AgentLifecycleEvent.
 * @param {object} [options]
 * @param {object} options.policy - an admitted AgentHarnessPolicy.
 * @param {string} [options.root] - repository root; defaults to CLAUDE_PROJECT_DIR or the event's cwd.
 * @param {string} [options.roleId]
 * @param {string} [options.mcpConfig] - repository-relative MCP client configuration.
 * @param {(prompt: string, mcpConfigText: string, signal: AbortSignal) => Promise<object>} [options.callContext]
 * @param {typeof readFileText} [options.readText]
 * @returns {Promise<object>} an AgentLifecycleResponse, or a Result carrying one.
 */
export async function emitPerTurnDuty(event, { policy, root, roleId, mcpConfig = ".mcp.json", callContext = queryContext, readText = readFileText } = {}) {
  if (typeof event?.prompt !== "string") return CONTINUE;
  const repositoryRoot = root ?? process.env.CLAUDE_PROJECT_DIR ?? event.session?.cwd;
  if (typeof repositoryRoot !== "string" || repositoryRoot === "") return CONTINUE;
  const identity = await readIdentity({ policy, root: repositoryRoot, roleId, readText });
  let context;
  try {
    const mcpConfigText = await readText(confinePath({ root: repositoryRoot, path: mcpConfig }).path);
    context = await withTimeout((signal) => callContext(event.prompt, mcpConfigText, signal));
  } catch (error) {
    context = { kind: "coding-context.unavailable", reason: error instanceof Error ? error.message : String(error) };
  }
  const identityLine = identity.state === "recognized"
    ? `actor: ${identity.actor}; office: ${identity.office}; character: ${identity.character}; incumbency: ${identity.incumbency}`
    : `identity: unavailable (${identity.reason})`;
  const contextBytes = MAX_BYTES - byteLength(identityLine) - 1;
  return respond({ additionalContext: [identityLine, renderContext(context, contextBytes)].join("\n") });
}

if (import.meta.main) {
  const streams = processStreams();
  const result = await runAgentLifecycleHook({
    handler: async (event) => {
      const root = repositoryRootOf(event, { root: argument("--root", streams.arguments) });
      if (root === undefined) return CONTINUE;
      const machine = await readMachineParameters({ root, policyPath: argument("--policy", streams.arguments) });
      const options = { policy: machine.policy, root };
      for (const [key, flag] of [["roleId", "--role"], ["mcpConfig", "--mcp-config"]]) {
        const value = argument(flag, streams.arguments);
        if (value !== undefined) options[key] = value;
      }
      return emitPerTurnDuty(event, options);
    },
    streams,
  });
  process.exitCode = result.exitCode;
}
