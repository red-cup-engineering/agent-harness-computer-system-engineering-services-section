#!/usr/bin/env node
// PreToolUse: refuses a write under a path whose purpose this house has
// already settled, where that purpose forbids the app carrying capability
// code of its own (a UI, a composition point).
//
// This exists so "should I fix this app's build in place" is never a live
// question a session has to ask or a Founder has to keep answering: the
// settled purpose already answers it -- move the capability to its real
// script-tier home and migrate the app to consume it. Founder-ruled
// 2026-09-11, after repeating "MetroPlat is the UI for MARSH" and "FeltOS
// composes, it does not hold" across many sessions: "if you were listening to
// my 'make it so you are configured with the right agents, skills, to follow
// our methods' then 'Should I fix metroplat?' would never be a question you
// would ask me... you would have the agents, skills, etc., to know the
// question is invalid as formed."
//
// The registry is the machine's own record, found through its
// AgentHarnessPolicy; `--registry` is an override only.
import { CONTINUE, block, filePathOf } from "@red-cup-engineering/agent-lifecycle-hook-service";
import { processStreams, runAgentLifecycleHook } from "@red-cup-engineering/agent-lifecycle-hook-service/run-agent-lifecycle-hook";
import { readFileText } from "@red-cup-engineering/file-services/read-file";
import { argument } from "@red-cup-engineering/javascript-node-services-section/argv";
import { readMachineParameters, repositoryRootOf } from "./machine-parameters.mjs";

export const BYPASS_ENV_VAR = "SETTLED_APP_PURPOSE_HOOK_BYPASS";
const QUALIFYING_TOOLS = new Set(["Write", "Edit", "MultiEdit"]);

/**
 * The settled purpose whose path this write falls under, or undefined.
 *
 * @param {object} registry - a SettledAppPurposeRegistry record.
 * @param {string} filePath - the written path.
 * @returns {object|undefined}
 */
export function settledPurposeFor(registry, filePath) {
  const normalized = filePath.split("\\").join("/");
  return (registry?.entries ?? []).find((candidate) => typeof candidate?.pathContains === "string" && normalized.includes(candidate.pathContains));
}

/**
 * Rules on one PreToolUse event: a write inside an app whose settled purpose
 * forbids capability code is blocked, naming that purpose and its repair.
 *
 * @param {object} event - one AgentLifecycleEvent.
 * @param {object} [options]
 * @param {string} [options.registryPath] - an explicit override; otherwise derived from the machine's policy.
 * @param {Record<string, string|undefined>} [options.environment]
 * @param {typeof readFileText} [options.readText]
 * @returns {Promise<object>} an AgentLifecycleResponse, or a Result carrying one.
 */
export async function checkSettledAppPurpose(event, { registryPath, environment = process.env, readText = readFileText } = {}) {
  if (environment[BYPASS_ENV_VAR] === "1") return CONTINUE;
  if (!QUALIFYING_TOOLS.has(event.tool?.name)) return CONTINUE;
  const filePath = filePathOf(event);
  if (filePath === undefined) return CONTINUE;
  let resolvedRegistryPath = registryPath;
  if (resolvedRegistryPath === undefined) {
    const root = repositoryRootOf(event, { environment });
    if (root === undefined) return CONTINUE;
    resolvedRegistryPath = (await readMachineParameters({ root, environment, readText })).settledAppPurposeRegistry;
  }
  let registry;
  try {
    registry = JSON.parse(await readText(resolvedRegistryPath));
  } catch {
    // A machine that has settled no purpose forbids nothing.
    return CONTINUE;
  }
  const entry = settledPurposeFor(registry, filePath);
  if (entry === undefined) return CONTINUE;
  return block(
    `'${filePath}' is inside ${entry.app}, whose purpose this house has already settled: ${entry.purpose} ${entry.instruction} `
    + `(bypass with ${BYPASS_ENV_VAR}=1 only for a genuinely purpose-conforming change, e.g. pure UI/composition wiring, not a capability fix)`,
  );
}

if (import.meta.main) {
  const streams = processStreams();
  const registryPath = argument("--registry", streams.arguments);
  const result = await runAgentLifecycleHook({
    handler: (event) => checkSettledAppPurpose(event, registryPath === undefined ? {} : { registryPath }),
    streams,
  });
  process.exitCode = result.exitCode;
}
