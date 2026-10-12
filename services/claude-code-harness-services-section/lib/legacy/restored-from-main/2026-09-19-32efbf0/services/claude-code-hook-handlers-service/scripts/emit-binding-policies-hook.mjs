#!/usr/bin/env node
// SessionStart: names the policies binding this worker, read fresh from the
// planning engine, as the session's own additional context. A session that
// has to be told its binding policies in a brief forgets them; a session
// that reads them at every start cannot.
//
// The engine invocation goes through the house command effect owner
// (execute-javascript-node-command-service), never a shell: the engine's
// entrypoint, its log, the listed kind, and the repository root are
// parameters, and the engine's own JSON output is parsed rather than piped
// through a text filter. Failure adds nothing and blocks nothing: a session
// start must never fail because the planning engine is unavailable.
import { CONTINUE, respond } from "@red-cup-engineering/agent-lifecycle-hook-service";
import { processStreams, runAgentLifecycleHook } from "@red-cup-engineering/agent-lifecycle-hook-service/run-agent-lifecycle-hook";
import { executeJavascriptNodeCommand } from "@red-cup-engineering/execute-javascript-node-command-service";
import { confinePath } from "@red-cup-engineering/filepath-services-section";
import { argument } from "@red-cup-engineering/javascript-node-services-section/argv";

const DEFAULT_ENGINE = "dev/apps/simple-planning-engine.mjs";
const DEFAULT_ENGINE_DATA = "dev/data/logs/simple-planning-engine-log.jsonl";
const DEFAULT_KIND = "policy";
// The planning engine's own repository coordinates: shared by every machine
// and every session, not machine paths. Redirectable without touching this
// code through the environment or the flags below, since the platform's
// invocation passes no per-handler arguments.
export const ENGINE_ENV_VAR = "PLANNING_ENGINE_ENTRYPOINT";
export const ENGINE_DATA_ENV_VAR = "PLANNING_ENGINE_DATA";
export const HEADER =
  "Policies binding this worker (planning engine, native policy envelopes):";

/**
 * Renders the engine's entity list as the context block a session reads: the
 * header line, then one `- <id>: <name>` line per policy, in the engine's
 * own order.
 *
 * @param {readonly object[]} entities - the engine's `list_entities` result.
 * @returns {string} the context block, or "" when nothing is listed.
 */
export function renderBindingPolicies(entities) {
  if (!Array.isArray(entities) || entities.length === 0) return "";
  const lines = entities
    .filter((entity) => entity !== null && typeof entity === "object" && typeof entity.id === "string")
    .map((entity) => `- ${entity.id}: ${entity.name ?? ""}${typeof entity.description === "string" && entity.description.trim() ? ` — ${entity.description.trim()}` : ""}`);
  return lines.length === 0 ? "" : [HEADER, ...lines].join("\n");
}

/**
 * The environment the engine runs under: this process's own string values,
 * plus the engine's log location.
 *
 * @param {string} engineData - absolute path to the engine's log file.
 * @param {Record<string, string|undefined>} [environment] - defaults to process.env.
 * @returns {Record<string, string>}
 */
export function engineEnvironment(engineData, environment = process.env) {
  const value = {};
  for (const [key, item] of Object.entries(environment)) if (typeof item === "string") value[key] = item;
  value.PLANNING_ENGINE_DATA = engineData;
  return value;
}

/**
 * Reads the policies binding this worker from the planning engine.
 *
 * @param {object} options
 * @param {string} options.root - repository root the engine and its log resolve against.
 * @param {string} [options.engine] - repository-relative engine entrypoint.
 * @param {string} [options.engineData] - repository-relative engine log.
 * @param {string} [options.kind] - the entity kind to list.
 * @param {Record<string, string|undefined>} [options.environment]
 * @param {typeof executeJavascriptNodeCommand} [options.execute] - injectable for tests.
 * @returns {readonly object[]} the listed entities, or [] when the engine could not answer.
 */
export function readBindingPolicies({ root, engine = DEFAULT_ENGINE, engineData = DEFAULT_ENGINE_DATA, kind = DEFAULT_KIND, environment, execute = executeJavascriptNodeCommand } = {}) {
  const directory = confinePath({ root }).path;
  const receipt = execute({
    type: "JavascriptNodeCommandExecutionRequest",
    version: 1,
    command: process.execPath,
    arguments: [confinePath({ root, path: engine }).path, "call", "list_entities", JSON.stringify({ kind })],
    directory,
    environment: engineEnvironment(confinePath({ root, path: engineData }).path, environment),
    input: null,
  });
  if (receipt.result.status !== 0) return [];
  try {
    const entities = JSON.parse(receipt.result.stdout);
    // list_entities already returns the replacement engine's full native
    // envelopes; do not replay the ledger once per policy through get_entity.
    return Array.isArray(entities) ? entities.filter((entity) => entity !== null && typeof entity === "object" && entity.kind === kind && typeof entity.id === "string" && entity.body && typeof entity.body === "object") : [];
  } catch {
    return [];
  }
}

/**
 * Rules on one SessionStart event: the binding policies as additionalContext,
 * or nothing at all.
 *
 * @param {object} event - one AgentLifecycleEvent.
 * @param {{root?: string, read?: typeof readBindingPolicies, environment?: Record<string, string|undefined>}} [options] - remaining options pass to the read.
 * @returns {object} an AgentLifecycleResponse, or a Result carrying one.
 */
export function emitBindingPolicies(event, { root, read = readBindingPolicies, environment = process.env, ...rest } = {}) {
  const fromEnvironment = {
    ...(environment[ENGINE_ENV_VAR] === undefined ? {} : { engine: environment[ENGINE_ENV_VAR] }),
    ...(environment[ENGINE_DATA_ENV_VAR] === undefined ? {} : { engineData: environment[ENGINE_DATA_ENV_VAR] }),
  };
  const repositoryRoot = root ?? environment.CLAUDE_PROJECT_DIR ?? event.session?.cwd;
  if (typeof repositoryRoot !== "string" || repositoryRoot === "") return CONTINUE;
  let additionalContext = "";
  try {
    additionalContext = renderBindingPolicies(read({ root: repositoryRoot, ...fromEnvironment, ...rest }));
  } catch {
    // The planning engine, or this hook's reading of it, could not answer;
    // the session starts with nothing added rather than not at all.
    return CONTINUE;
  }
  return additionalContext === "" ? CONTINUE : respond({ additionalContext });
}

if (import.meta.main) {
  const streams = processStreams();
  const options = {};
  for (const [key, flag] of [["root", "--root"], ["engine", "--engine"], ["engineData", "--engine-data"], ["kind", "--kind"]]) {
    const value = argument(flag, streams.arguments);
    if (value !== undefined) options[key] = value;
  }
  const result = await runAgentLifecycleHook({ handler: (event) => emitBindingPolicies(event, options), streams });
  process.exitCode = result.exitCode;
}
