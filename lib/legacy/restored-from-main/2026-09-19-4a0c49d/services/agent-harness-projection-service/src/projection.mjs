import { decodeToml, encodeToml } from "@red-cup-engineering/toml-codec-service";
import { mcpServerTable } from "./runtimes/codex.mjs";
import { mcpServer } from "./runtimes/claude.mjs";
import { jsonText } from "./runtimes/shared.mjs";
import { identifyContent } from "@red-cup-engineering/computer-data-engine";
import { AGENT_RUNTIMES } from "./runtimes/index.mjs";
import { admitAgentHarnessPolicy, admitAgentHarnessSources, referencedSources, resolveAgentHarnessPolicy } from "./policy.mjs";
import { AGENT_HARNESS_OBSERVATION_TYPE, AGENT_HARNESS_PROJECTION_TYPE, accept, admitAs, refuse } from "./types.mjs";

/**
 * The projection morphism and its drift comparison. Both are pure: a policy
 * and observed sources go in, a projection or a typed refusal comes out; a
 * projection and an observation go in, agreement or a drift refusal comes out.
 */

/** Admit one AgentHarnessProjection. */
export function admitAgentHarnessProjection(value) {
  return admitAs(AGENT_HARNESS_PROJECTION_TYPE, value, "projection-not-admitted", "agent harness projection");
}

/** Admit one AgentHarnessObservation. */
export function admitAgentHarnessObservation(value) {
  return admitAs(AGENT_HARNESS_OBSERVATION_TYPE, value, "projection-not-admitted", "agent harness observation");
}

/** The content identity of one file's text: the drift comparison's unit. */
export function identifyText(text) {
  return identifyContent({ text });
}

/** Project one policy, against observed sources, onto its runtime's file surface. */
export function projectAgentHarness({ policy, sources }) {
  const resolved = resolveAgentHarnessPolicy({ policy, sources });
  if (!resolved.ok) return resolved;
  const runtime = AGENT_RUNTIMES[policy.runtime];
  if (!runtime) return refuse("runtime-unsupported", `no runtime parameterization for '${policy.runtime}'`, { runtime: policy.runtime });
  const rendered = runtime.render(resolved.value);
  if (!rendered.ok) return rendered;
  return projectionOfFiles(policy, sources.root, rendered.value);
}

function projectionOfFiles(policy, root, renderedFiles) {
  const seen = new Set();
  for (const file of renderedFiles) {
    if (seen.has(file.path)) return refuse("duplicate-projected-path", `two projected files share the path ${file.path}`, { path: file.path });
    seen.add(file.path);
  }
  const files = [...renderedFiles].sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0)).map((file) => Object.freeze({ ...file }));
  const projection = {
    kind: "agent-harness-projection",
    version: 1,
    actor: policy.actor,
    runtime: policy.runtime,
    root,
    files,
    identity: identifyContent({ actor: policy.actor, runtime: policy.runtime, files: files.map((file) => ({ path: file.path, identity: identifyText(file.text) })) }),
  };
  return admitAgentHarnessProjection(projection);
}

/**
 * Compare a projection with what is on disk. Agreement is the succeeding arm;
 * any missing file or differing identity is one drift refusal naming every
 * difference, so a caller repairs the whole surface at once.
 */
export function driftOfAgentHarness({ projection, observation }) {
  const admittedProjection = admitAgentHarnessProjection(projection);
  if (!admittedProjection.ok) return admittedProjection;
  const admittedObservation = admitAgentHarnessObservation(observation);
  if (!admittedObservation.ok) return admittedObservation;
  const observed = new Map(observation.files.map((file) => [file.path, file]));
  const missing = [];
  const differing = [];
  for (const file of projection.files) {
    const entry = observed.get(file.path);
    if (!entry || !entry.exists) { missing.push(file.path); continue; }
    if (entry.identity !== identifyText(file.text)) differing.push(file.path);
  }
  if (missing.length === 0 && differing.length === 0) return accept(Object.freeze({ kind: "agent-harness-agreement", version: 1, identity: projection.identity, files: projection.files.length }));
  return refuse("drift", `the ${projection.runtime} harness at ${projection.root} has drifted from its projection`, { missing, differing });
}

/** Project only the shared MCP component, retaining all other user configuration. */
export function projectAgentHarnessMcp({ policy, sources, existing = "" }) {
  const admitted = admitAgentHarnessPolicy(policy);
  if (!admitted.ok) return admitted;
  const observed = admitAgentHarnessSources(sources);
  if (!observed.ok) return observed;
  for (const reference of referencedSources(policy, { component: "mcp" })) {
    const entry = sources.observations.find(entry => entry.path === reference.path);
    if (!entry?.exists || entry.kind !== reference.kind) return refuse("source-absent", `MCP source is not a ${reference.kind}: ${reference.path}`, { path: reference.path });
  }
  const codex = policy.runtime === "codex";
  const path = codex ? ".codex/config.toml" : ".mcp.json";
  let data;
  try { data = existing ? (codex ? decodeToml(existing) : JSON.parse(existing)) : {}; }
  catch (error) { return refuse("record-unreadable", `existing MCP configuration is unreadable: ${error.message}`, { path }); }
  const key = codex ? "mcp_servers" : "mcpServers";
  const render = codex ? mcpServerTable : mcpServer;
  data[key] = { ...data[key], ...Object.fromEntries(Object.entries(policy.mcpServers).map(([name, endpoint]) => [name, render(sources.root, endpoint)])) };
  return projectionOfFiles(policy, sources.root, [{ path, text: codex ? encodeToml(data) : jsonText(data) }]);
}
