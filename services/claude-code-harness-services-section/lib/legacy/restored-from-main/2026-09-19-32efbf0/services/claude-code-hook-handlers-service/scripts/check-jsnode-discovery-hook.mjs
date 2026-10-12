#!/usr/bin/env node
// PreToolUse: refuses authoring a brand-new JavaScript or TypeScript source
// file when the transcript shows no prior capability-graph discovery call.
//
// This house built an executable behavior-and-package graph expressly so that
// a new function or data class is never authored before checking whether the
// capability already exists. The check is the transcript's own evidence that
// the search happened, not an agent's memory that it should have.
import { CONTINUE, block, filePathOf } from "@red-cup-engineering/agent-lifecycle-hook-service";
import { processStreams, runAgentLifecycleHook } from "@red-cup-engineering/agent-lifecycle-hook-service/run-agent-lifecycle-hook";
import { hasExtension } from "@red-cup-engineering/filepath-services-section";
import { statPath } from "@red-cup-engineering/stat-path-service";
import { transcriptHasToolUse } from "./session-transcript.mjs";

export const BYPASS_ENV_VAR = "JSNODE_DISCOVERY_HOOK_BYPASS";
const CODE_EXTENSIONS = Object.freeze([".mjs", ".mts", ".cjs", ".cts", ".ts", ".tsx", ".js", ".jsx"]);
// A generated tree, a scratch space, or a test is not where a capability is
// first seated, so authoring one needs no prior search.
const EXCLUDED_PATH_PATTERN = /\/(node_modules|scratchpad|dist|build|coverage|\.claude)\/|(^|\/)test(s)?\//u;
const DISCOVERY_TOOL_PATTERN = /^(jsnode_|mcp__jsnode-server__)/u;

/**
 * Rules on one PreToolUse event: a new code carrier written with no prior
 * capability-graph search in the transcript is blocked.
 *
 * @param {object} event - one AgentLifecycleEvent.
 * @param {{environment?: Record<string, string|undefined>, stat?: typeof statPath, readText?: Function}} [options]
 * @returns {Promise<object>} an AgentLifecycleResponse, or a Result carrying one.
 */
export async function checkJsnodeDiscovery(event, { environment = process.env, stat = statPath, readText } = {}) {
  if (environment[BYPASS_ENV_VAR] === "1") return CONTINUE;
  if (event.tool?.name !== "Write") return CONTINUE;
  const filePath = filePathOf(event);
  if (filePath === undefined || !hasExtension(filePath, CODE_EXTENSIONS)) return CONTINUE;
  if (EXCLUDED_PATH_PATTERN.test(filePath.split("\\").join("/"))) return CONTINUE;
  const observed = await stat({ path: filePath });
  if (observed.exists) return CONTINUE;
  const transcriptPath = event.session?.transcriptPath;
  if (typeof transcriptPath !== "string" || transcriptPath === "") {
    return block(`no transcript is available to verify a capability-graph search happened before the new file '${filePath}' (bypass with ${BYPASS_ENV_VAR}=1)`);
  }
  if (await transcriptHasToolUse(transcriptPath, (name) => DISCOVERY_TOOL_PATTERN.test(name), readText)) return CONTINUE;
  return block(
    `this transcript shows no jsnode-server discovery call before writing new file '${filePath}'. `
    + "Load the jsnode-server tools first (ToolSearch \"select:jsnode_search,jsnode_duplication,jsnode_atlas,jsnode_package,jsnode_query\") "
    + "and use jsnode_search/jsnode_atlas to find the package that should own this capability, or jsnode_duplication to check for an "
    + "existing implementation, before authoring a new function or data class here "
    + `(bypass with ${BYPASS_ENV_VAR}=1 only when you have already confirmed by another route that nothing upstream provides this)`,
  );
}

if (import.meta.main) {
  const result = await runAgentLifecycleHook({ handler: checkJsnodeDiscovery, streams: processStreams() });
  process.exitCode = result.exitCode;
}
