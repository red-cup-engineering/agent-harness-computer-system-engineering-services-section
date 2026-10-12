// working : (agent, subject, read, opts) -> work-process   [HACKING: action-tower generator]
//
// Sustained subconscious work: the agent contributes a claim-record about a subject by reading (its
// `read` fn = evidence-gathering against files). working is the Scott-continuous generator of the
// action tower (parallel to positing). Returns the agent's claim-record contribution plus a
// work-process record. PURE: the durable per-agent contribution-write is the lifecycle's job.

const FOUR = ["bottom", "true", "false", "top"];

export default function working(agent, subject, read, opts = {}) {
  if (!agent || typeof agent.id !== "string" || !agent.id)
    throw new TypeError("working: agent.id required");
  if (typeof subject !== "string" || subject.length === 0)
    throw new TypeError("working: subject must be a non-empty string");
  const r = read ? read(agent, subject) : null;
  const value = FOUR.includes(r?.value) ? r.value : "bottom";
  const evidence = Array.isArray(r?.evidence) && r.evidence.length ? r.evidence : [`agent:${agent.id}`];
  const claim = { observer: agent.id, value, evidence };
  return { agent: agent.id, subject, status: "contributed", claim };
}
