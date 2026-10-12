import { admit, defineType, receiptType, refusalType } from "@red-cup-engineering/computer-data-engine";
import { MCP_CLIENT_ENDPOINT_SCHEMA, mcpClientEndpointType } from "@red-cup-engineering/computer-platform/mcp-endpoint";
import policySchema from "../data/records/schema/agent-harness-policy.schema.json" with { type: "json" };
import sourcesSchema from "../data/records/schema/agent-harness-sources.schema.json" with { type: "json" };
import projectionSchema from "../data/records/schema/agent-harness-projection.schema.json" with { type: "json" };
import observationSchema from "../data/records/schema/agent-harness-observation.schema.json" with { type: "json" };
import refusalSchema from "../data/records/schema/agent-harness-refusal.schema.json" with { type: "json" };

/**
 * The agent-harness object types, declared once through the data engine from
 * the schema pool this section keeps. Every operation in this package admits
 * its input and output through these declarations; no shape is declared inline.
 */
function established(result) {
  if (!result.ok) throw new TypeError(`agent-harness type declaration refused: ${JSON.stringify(result.refusal)}`);
  return result.value;
}

function carrier(name, description, schema, references = []) {
  return established(defineType({ id: schema.$id, name, description, parents: [], schema, references }));
}

/** The MCP owner declares the client endpoint; this package only references it. */
export const MCP_CLIENT_ENDPOINT_TYPE = mcpClientEndpointType;
export const AGENT_HARNESS_POLICY_TYPE = carrier("AgentHarnessPolicy", "The one authored input for one actor on one agent runtime.", policySchema, [MCP_CLIENT_ENDPOINT_SCHEMA]);
export const AGENT_HARNESS_SOURCES_TYPE = carrier("AgentHarnessSources", "Observed existence and texts of every path a policy references.", sourcesSchema);
export const AGENT_HARNESS_PROJECTION_TYPE = carrier("AgentHarnessProjection", "Every file a runtime reads, as exact text, with the identity of the set.", projectionSchema);
export const AGENT_HARNESS_OBSERVATION_TYPE = carrier("AgentHarnessObservation", "The runtime surface as it is on disk, by content identity.", observationSchema);
export const AGENT_HARNESS_REFUSAL_TYPE = carrier("AgentHarnessRefusal", "A typed non-admission with a stable code.", refusalSchema);

/** The engine's own receipt and refusal declarations are the ones effects return; this package adds none. */
export const RECEIPT_TYPE = receiptType;
export const ENGINE_REFUSAL_TYPE = refusalType;

/** Form one typed refusal as the failing arm of a Result. Never throws. */
export function refuse(code, message, details) {
  const refusal = details === undefined ? { kind: "refusal", code, message } : { kind: "refusal", code, message, details };
  const admitted = admit(AGENT_HARNESS_REFUSAL_TYPE, refusal);
  if (!admitted.ok) return Object.freeze({ ok: false, refusal: Object.freeze({ kind: "refusal", code: "projection-not-admitted", message: `refusal itself was not admitted: ${message}` }) });
  return Object.freeze({ ok: false, refusal: Object.freeze(refusal) });
}

/** Form the succeeding arm of a Result. */
export function accept(value) {
  return Object.freeze({ ok: true, value });
}

/** Admit a value through a declared type as a Result whose refusal carries the given code. */
export function admitAs(type, value, code, label) {
  const admitted = admit(type, value);
  if (admitted.ok) return accept(admitted.value);
  return refuse(code, `${label} was not admitted by ${type.name}`, { issues: admitted.refusal.issues.map((issue) => ({ path: issue.path, message: issue.message })) });
}
