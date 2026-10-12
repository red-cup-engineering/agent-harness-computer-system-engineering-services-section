function object(value, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${label} must be an object`);
  return value;
}

function text(value, label) {
  if (typeof value !== "string" || value.trim() === "") throw new TypeError(`${label} must be non-empty text`);
  return value.trim();
}

function texts(value, label) {
  if (!Array.isArray(value)) throw new TypeError(`${label} must be an array`);
  return Object.freeze(value.map((item, index) => text(item, `${label}[${index}]`)));
}

/** Project explicit harness, executable, readiness, and capability-search carriers into an agent card. */
export function projectAgentCard(input) {
  object(input, "input");
  const harness = object(input.harness, "harness");
  const readiness = object(input.readiness, "readiness");
  const operations = [...texts(input.operations, "operations")].sort();
  return Object.freeze({
    kind: "agent-harness.agent-card",
    generatedAt: text(input.generatedAt ?? new Date().toISOString(), "generatedAt"),
    protocol: text(input.protocol ?? "agent-card.v1", "protocol"),
    agent: Object.freeze({ id: text(input.id, "id"), name: text(input.name, "name"), package: text(input.packageName, "packageName"), role: text(input.role, "role") }),
    surface: Object.freeze({ scripts: operations.length, webux: input.surface?.webux ?? null, openapi: input.surface?.openapi ?? null, mcp: input.surface?.mcp ?? null, httpPost: input.surface?.httpPost ?? null }),
    channels: texts(harness.channels ?? [], "harness.channels"),
    capabilities: Object.freeze({ operations: Object.freeze(operations), focus: typeof input.focus === "string" ? input.focus : null, coverage: input.coverage ?? null }),
    authority: Object.freeze({ canAcceptHandoff: input.authority?.canAcceptHandoff === true, canRecordWitness: input.authority?.canRecordWitness === true, requiresExplicitRecord: input.authority?.requiresExplicitRecord !== false, safetyEnvelope: text(input.authority?.safetyEnvelope ?? "local-package-script", "authority.safetyEnvelope") }),
    readiness: Object.freeze({ score: readiness.summary?.score ?? 0, present: readiness.summary?.present ?? 0, partial: readiness.summary?.partial ?? 0, missing: readiness.summary?.missing ?? 0, nextWork: Object.freeze([...(readiness.nextWork ?? [])]) }),
    witness: Object.freeze({ executableCount: operations.length, channelCount: harness.channels?.length ?? 0, readinessCriteria: readiness.criteria?.length ?? 0, capabilitySearchIncluded: input.coverage !== null && input.coverage !== undefined }),
  });
}
