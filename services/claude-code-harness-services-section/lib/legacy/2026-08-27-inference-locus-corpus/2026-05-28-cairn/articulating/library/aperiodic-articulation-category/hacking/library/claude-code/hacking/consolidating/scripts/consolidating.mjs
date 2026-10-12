// consolidating : session-trace -> memory[]   [HACKING: name admitted]
//
// The "dream". The swarm (a fungible aperiodic enactor, injected like inferring's) infers from a
// session transcript which facts the session established; this settles each into a typed memory row
// carrying provenance (evidence) and a placement (where it belongs). Extension (answer = positing
// into the fiber). Each candidate must pass the governance gate or it is dropped
// (governanceRequiredForImprovement). PURE: returns rows; the durable, dual-filed write is performed
// by the lifecycle entrypoint -- codeRemainsProbe. Being in context is not learning; only these rows.

export default function consolidating(sessionTrace, enactor, { gate, now } = {}) {
  if (!Array.isArray(sessionTrace) || sessionTrace.length === 0)
    throw new TypeError("consolidating: sessionTrace must be a non-empty array of messages");
  const candidates = enactor(sessionTrace); // the swarm infers candidate facts
  if (!Array.isArray(candidates))
    throw new TypeError("consolidating: enactor must return an array of memory candidates");

  const t = (now && now()) || new Date().toISOString();
  const rows = [];
  for (const c of candidates) {
    for (const [k, v] of [["e", c?.e], ["a", c?.a], ["v", c?.v], ["placement", c?.placement]])
      if (typeof v !== "string" || v.length === 0)
        throw new TypeError(`consolidating: candidate.${k} must be a non-empty string`);
    if (!Array.isArray(c.evidence) || c.evidence.length === 0)
      throw new TypeError("consolidating: candidate.evidence (provenance) must be a non-empty array");
    const row = { e: c.e, a: c.a, v: c.v, t, evidence: c.evidence, placement: c.placement };
    if (gate && !gate(row)) continue; // ungoverned candidates never become memory
    rows.push(row);
  }
  return rows;
}
