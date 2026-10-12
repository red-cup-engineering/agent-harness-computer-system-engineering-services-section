function object(value, label) { if (value === null || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${label} must be an object`); return value; }
function text(value, label) { if (typeof value !== "string" || value.trim() === "") throw new TypeError(`${label} must be non-empty text`); return value.trim(); }
function slug(value) { return value.toLowerCase().replace(/[^a-z0-9]+/gu, "-").replace(/^-|-$/gu, "").slice(0, 72) || "peer"; }
function channel(kind, endpoint, role) { return Object.freeze({ channel: kind, endpoint, role }); }

/** Project a federation from an explicit local card, declared peers, and ledger snapshot. */
export function projectAgentFederation(input) {
  object(input, "input"); const local = object(input.local, "local"); const ledger = object(input.ledger, "ledger");
  const peers = Object.freeze((input.peers ?? []).map((endpoint, index) => Object.freeze({ id: `peer:${slug(text(endpoint, `peers[${index}]`))}`, endpoint, status: "declared" })));
  const entries = Array.isArray(ledger.entries) ? ledger.entries : [];
  const localId = text(local.agent?.id, "local.agent.id");
  return Object.freeze({
    kind: "agent-harness.federation",
    generatedAt: text(input.generatedAt ?? new Date().toISOString(), "generatedAt"),
    protocol: text(input.protocol ?? "agent-federation.v1", "protocol"),
    topology: peers.length === 0 ? "local-boundary" : "declared-peers",
    local,
    peers,
    channels: Object.freeze([
      channel("package-script", "read-agent-card", "local"), channel("package-script", "handoff-agent", "local"), channel("package-script", "read-federation", "local"),
      channel("http", "/read-agent-card", "projection"), channel("http", "/handoff-agent", "projection"), channel("http", "/read-federation", "projection"),
      channel("openapi", "/openapi.json", "projection"), channel("mcp", "/mcp", "projection"), channel("webux", "/", "projection"),
    ]),
    carrier: Object.freeze({ kind: "agent-federation", members: Object.freeze([localId, ...peers.map(({ id }) => id)]) }),
    handoff: Object.freeze({ protocol: text(input.handoffProtocol ?? "agent-handoff.v1", "handoffProtocol"), requiredFields: Object.freeze(["from", "to", "intent", "focus", "evidence", "controls"]), recordOperation: "handoff-agent record=true", previewOperation: "handoff-agent" }),
    ledger: Object.freeze({ log: ledger.log ?? null, state: ledger.state ?? null, handoffWitnesses: entries.filter(({ predicate }) => predicate === "operations-manifold.agent.handed-off" || predicate === "agent.handed-off").length }),
    witness: Object.freeze({ peers: peers.length, channels: 9, ledgerEntries: entries.length }),
  });
}
