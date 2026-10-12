// Every machine location a hook handler needs, derived from one record: the
// machine's own AgentHarnessPolicy, named by the AGENT_HARNESS_POLICY
// environment variable the runtime is configured with. The platform's
// invocation is exactly `node "$CLAUDE_PROJECT_DIR"/<handler>
// --expected-event <Event>` -- no per-handler arguments -- so nothing a
// handler needs may arrive as a flag, and no repository-relative machine
// path may be written into this code.
//
// What the policy record tells us:
//   * its own location names the machine's harness section, which is the
//     journal custody root and the root of that harness's content and state;
//   * `instructions.source` names the machine section that holds the shared
//     content tree, because a machine's root instructions live under its own
//     `content/`;
//   * `actor` names who is acting.
// The only shapes assumed are the house's own directory conventions
// (`content/`, `data/state/`), never a host, a section name, or a path.
import { admitAgentHarnessPolicy } from "@red-cup-engineering/agent-harness-projection-service/policy";
import { readFileText } from "@red-cup-engineering/file-services/read-file";
import { confinePath, toPosixPath } from "@red-cup-engineering/filepath-services-section";

export const POLICY_ENV_VAR = "AGENT_HARNESS_POLICY";
const CONTENT_DIRECTORY = "content";
const STATE_DIRECTORY = "data/state";
const SETTLED_APP_PURPOSES = "content/harness/settled-app-purposes.json";

/** The parent directory of one absolute posix path. */
function parentOf(path) {
  const segments = toPosixPath(path).split("/");
  segments.pop();
  const parent = segments.join("/");
  return parent === "" ? "/" : parent;
}

/**
 * The machine section that holds a shared content tree, read off the
 * repository-relative coordinate of a machine's root-instructions carrier:
 * everything above that carrier's own `content/` directory.
 *
 * @param {string} instructionsSource - repository-relative path of the root-instructions carrier.
 * @returns {string|undefined} the repository-relative machine section, or undefined when the carrier is not under a `content/` directory.
 */
export function machineSectionOf(instructionsSource) {
  const segments = toPosixPath(instructionsSource).split("/");
  const at = segments.lastIndexOf(CONTENT_DIRECTORY);
  return at <= 0 ? undefined : segments.slice(0, at).join("/");
}

/**
 * Reads the machine's own AgentHarnessPolicy and derives every location a
 * handler needs from it.
 *
 * @param {object} options
 * @param {string} options.root - the repository root a repository-relative policy path resolves against.
 * @param {string} [options.policyPath] - an explicit override; otherwise the AGENT_HARNESS_POLICY environment variable.
 * @param {Record<string, string|undefined>} [options.environment]
 * @param {typeof readFileText} [options.readText]
 * @returns {Promise<{policyPath: string, policy: object, actor: string, harnessSection: string, journalRoot: string, machineSection: string|undefined, machineContentRoot: string|undefined, settledAppPurposeRegistry: string, statePath: (name: string) => string}>}
 * @throws {Error} when no policy is named, or the named record is not an admitted AgentHarnessPolicy.
 */
export async function readMachineParameters({ root, policyPath, environment = process.env, readText = readFileText } = {}) {
  const named = policyPath ?? environment[POLICY_ENV_VAR];
  if (typeof named !== "string" || named === "") {
    throw new Error(`no agent harness policy is named: set ${POLICY_ENV_VAR} in the runtime's environment`);
  }
  if (typeof root !== "string" || root === "") throw new Error("a repository root is required to resolve the harness policy");
  const absolute = toPosixPath(named).startsWith("/") ? confinePath({ root: named }).path : confinePath({ root, path: named }).path;
  const admitted = admitAgentHarnessPolicy(JSON.parse(await readText(absolute)));
  if (!admitted.ok) throw new Error(`${named}: ${admitted.refusal.message}`);
  const policy = admitted.value;
  const harnessSection = parentOf(absolute);
  const machineSection = machineSectionOf(policy.instructions.source);
  return Object.freeze({
    policyPath: absolute,
    policy,
    actor: policy.actor,
    harnessSection,
    journalRoot: harnessSection,
    machineSection: machineSection === undefined ? undefined : confinePath({ root, path: machineSection }).path,
    machineContentRoot: machineSection === undefined ? undefined : confinePath({ root, path: `${machineSection}/${CONTENT_DIRECTORY}` }).path,
    settledAppPurposeRegistry: confinePath({ root: harnessSection, path: SETTLED_APP_PURPOSES }).path,
    statePath: (name) => confinePath({ root: harnessSection, path: `${STATE_DIRECTORY}/${name}` }).path,
  });
}

/**
 * The repository root a handler resolves machine coordinates against: the
 * runtime's project directory, else the event's own working directory.
 *
 * @param {object} event - one AgentLifecycleEvent.
 * @param {{root?: string, environment?: Record<string, string|undefined>}} [options]
 * @returns {string|undefined}
 */
export function repositoryRootOf(event, { root, environment = process.env } = {}) {
  const candidate = root ?? environment.CLAUDE_PROJECT_DIR ?? event?.session?.cwd;
  return typeof candidate === "string" && candidate !== "" ? candidate : undefined;
}
