#!/usr/bin/env node
// PostToolUse: the architecture gate. A JavaScript or TypeScript carrier just
// written under the repository's own service tree is cruised at once against
// this house's dependency-cruiser ruleset and its admitted known-violations
// record, and a new violation blocks the write with the cruiser's own text.
//
// This exists so import stratification is enforced at the moment a carrier is
// authored rather than discovered later in a review: the gate is the cruiser's
// exit status, never a report of it. The cruiser's advice about its own
// installation is filtered out so a refusal names only the violation.
import { CONTINUE, block, filePathOf } from "@red-cup-engineering/agent-lifecycle-hook-service";
import { processStreams, runAgentLifecycleHook } from "@red-cup-engineering/agent-lifecycle-hook-service/run-agent-lifecycle-hook";
import { executeJavascriptNodeCommand } from "@red-cup-engineering/execute-javascript-node-command-service";
import { confinePath, hasExtension } from "@red-cup-engineering/filepath-services-section";
import { argument } from "@red-cup-engineering/javascript-node-services-section/argv";
import { statPath } from "@red-cup-engineering/stat-path-service";

const QUALIFYING_TOOLS = new Set(["Write", "Edit", "MultiEdit"]);
const CHECKED_EXTENSIONS = Object.freeze([".mjs", ".cjs", ".js", ".mts", ".ts"]);
const CHECKED_PREFIX = "lib/";
// The house's own analysis section, shared by every machine and every
// session: a repository coordinate, not a machine one. Redirectable without
// touching this code through the environment or the flags below, since the
// platform's invocation passes no per-handler arguments.
export const CONFIG_ENV_VAR = "ARCHITECTURE_GATE_CONFIG";
export const KNOWN_VIOLATIONS_ENV_VAR = "ARCHITECTURE_GATE_KNOWN_VIOLATIONS";
const ANALYSIS_SECTION =
  "lib/emsenn/services/561-group/services/engineering-services-section/services/computer-engineering-services-section"
  + "/services/computer-code-engineering-services-section/services/javascript-engineering-services-section"
  + "/services/javascript-node-services-section/services/jsnode-workspace-analysis-services-section";
const DEFAULT_CONFIG = `${ANALYSIS_SECTION}/.dependency-cruiser.cjs`;
const DEFAULT_KNOWN_VIOLATIONS = `${ANALYSIS_SECTION}/.dependency-cruiser-known-violations.json`;
// The cruiser prints advice about its own installation alongside real
// findings; a refusal must name the violation and nothing else.
const ADVISORY_PATTERNS = Object.freeze(["globally installed", "recommend to install", "project instead", "transpilers at", "TypeScript, Vue"]);

/**
 * The repository-relative coordinate of a written carrier this gate cruises,
 * or undefined when the written path is not one: a JavaScript or TypeScript
 * source file inside the repository's own service tree.
 *
 * @param {string|undefined} filePath - the written path, absolute or repository-relative.
 * @param {string} root - the repository root.
 * @returns {string|undefined}
 */
export function checkedCarrier(filePath, root) {
  if (typeof filePath !== "string" || filePath === "") return undefined;
  if (!hasExtension(filePath, CHECKED_EXTENSIONS)) return undefined;
  let confined;
  try {
    confined = confinePath({ root, path: filePath, allowRoot: false });
  } catch {
    return undefined;
  }
  return confined.relativePath.startsWith(CHECKED_PREFIX) ? confined.relativePath : undefined;
}

/**
 * The cruiser's own findings with its installation advice removed.
 *
 * @param {string} text - the cruiser's combined output.
 * @returns {string}
 */
export function violationText(text) {
  return String(text)
    .split("\n")
    .filter((line) => line !== "" && !ADVISORY_PATTERNS.some((pattern) => line.includes(pattern)))
    .join("\n");
}

/**
 * Cruises one carrier and reports the gate's decision.
 *
 * @param {object} options
 * @param {string} options.filePath - repository-relative carrier coordinate.
 * @param {string} options.root - the repository root the cruise runs from.
 * @param {string} [options.config] - repository-relative dependency-cruiser config.
 * @param {string} [options.knownViolations] - repository-relative known-violations record.
 * @param {typeof executeJavascriptNodeCommand} [options.execute] - injectable for tests.
 * @returns {{clean: true}|{clean: false, reason: string}}
 */
export function cruiseCarrier({ filePath, root, config = DEFAULT_CONFIG, knownViolations = DEFAULT_KNOWN_VIOLATIONS, execute = executeJavascriptNodeCommand } = {}) {
  const directory = confinePath({ root }).path;
  const receipt = execute({
    type: "JavascriptNodeCommandExecutionRequest",
    version: 1,
    command: "depcruise",
    arguments: [
      "--config", confinePath({ root, path: config }).path,
      "--ignore-known", confinePath({ root, path: knownViolations }).path,
      "--output-type", "err",
      "--max-depth", "1",
      confinePath({ root, path: filePath }).path,
    ],
    directory,
    environment: null,
    input: null,
  });
  if (receipt.result.status === 0) return { clean: true };
  const reason = violationText(`${receipt.result.stdout}\n${receipt.result.stderr}\n${receipt.result.error}`);
  return { clean: false, reason: reason === "" ? "the architecture gate could not run" : reason };
}

/**
 * Rules on one PostToolUse event: a written carrier that now violates the
 * dependency ruleset is blocked with the cruiser's finding.
 *
 * @param {object} event - one AgentLifecycleEvent.
 * @param {{root?: string, stat?: typeof statPath, environment?: Record<string, string|undefined>}} [options] - remaining options pass to the cruise.
 * @returns {Promise<object>} an AgentLifecycleResponse, or a Result carrying one.
 */
export async function checkArchitectureGate(event, { root, stat = statPath, environment = process.env, ...rest } = {}) {
  if (!QUALIFYING_TOOLS.has(event.tool?.name)) return CONTINUE;
  const fromEnvironment = {
    ...(environment[CONFIG_ENV_VAR] === undefined ? {} : { config: environment[CONFIG_ENV_VAR] }),
    ...(environment[KNOWN_VIOLATIONS_ENV_VAR] === undefined ? {} : { knownViolations: environment[KNOWN_VIOLATIONS_ENV_VAR] }),
  };
  const repositoryRoot = root ?? environment.CLAUDE_PROJECT_DIR ?? event.session?.cwd;
  if (typeof repositoryRoot !== "string" || repositoryRoot === "") return CONTINUE;
  const filePath = checkedCarrier(filePathOf(event), repositoryRoot);
  if (filePath === undefined) return CONTINUE;
  const observed = await stat({ path: confinePath({ root: repositoryRoot, path: filePath }).path });
  if (!observed.exists) return CONTINUE;
  const cruise = cruiseCarrier({ filePath, root: repositoryRoot, ...fromEnvironment, ...rest });
  return cruise.clean ? CONTINUE : block(cruise.reason);
}

if (import.meta.main) {
  const streams = processStreams();
  const options = {};
  for (const [key, flag] of [["root", "--root"], ["config", "--config"], ["knownViolations", "--known-violations"]]) {
    const value = argument(flag, streams.arguments);
    if (value !== undefined) options[key] = value;
  }
  const result = await runAgentLifecycleHook({ handler: (event) => checkArchitectureGate(event, options), streams });
  process.exitCode = result.exitCode;
}
