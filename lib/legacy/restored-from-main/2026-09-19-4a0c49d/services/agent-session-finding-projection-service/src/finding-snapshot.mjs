const CHARGES = new Set(["absurd", "potential", "active", "stable"]);

function findingValue(row) {
  if (!Array.isArray(row) || row.length !== 4 || !["agent-session.finding.recorded", "operations-manifold.codex.finding.recorded"].includes(row[1])) return null;
  const value = row[2];
  if (value === null || typeof value !== "object" || !["agent-session.finding.event", "operations-manifold.codex.finding.event"].includes(value.kind) || value.event !== "recorded") return null;
  const findingId = typeof value.findingId === "string" ? value.findingId : typeof row[0] === "string" ? row[0] : null;
  if (findingId === null || typeof value.eventId !== "string" || typeof value.at !== "string" || typeof value.session !== "string" || !Array.isArray(value.subject) || value.subject.length === 0 || typeof value.predicate !== "string" || !CHARGES.has(value.charge)) return null;
  return Object.freeze({ ...value, findingId });
}

function knowledgeJoin(left, right) {
  if (left === "absurd") return right;
  if (right === "absurd" || left === right) return left;
  return "stable";
}

/** Recall the accumulated knowledge charge for one exact subject. */
export function recallFindingStatus(findings, session, subject) {
  const key = subject.join("/");
  return findings.filter((finding) => finding.session === session && finding.subjectKey === key).reduce((status, finding) => knowledgeJoin(status, finding.charge), "absurd");
}

/** Fold supplied finding EAVT rows; no journal acquisition occurs here. */
export function foldFindingEvents(events, options = {}) {
  if (!Array.isArray(events)) throw new TypeError("events must be an array");
  const findings = Object.freeze(events.map(findingValue).filter((value) => value !== null).map((value) => Object.freeze({
    kind: "agent-session.finding",
    id: value.findingId,
    eventId: value.eventId,
    at: value.at,
    session: value.session,
    subject: Object.freeze([...value.subject]),
    subjectKey: value.subject.join("/"),
    predicate: value.predicate,
    charge: value.charge,
    object: value.object ?? null,
    note: value.note ?? null,
    focus: value.focus ?? null,
    intent: value.intent ?? null,
    trace: value.trace ?? null,
    evidence: Object.freeze([...(value.evidence ?? [])]),
    upstream: Object.freeze({ session: value.session, subject: Object.freeze([...value.subject]), predicate: value.predicate, charge: value.charge, ...(value.object === undefined ? {} : { object: value.object }), ...(value.note === undefined ? {} : { note: value.note }), at: value.at }),
  })).sort((left, right) => right.at.localeCompare(left.at)));
  const subjects = new Map();
  for (const finding of findings) subjects.set(JSON.stringify([finding.session, finding.subjectKey]), Object.freeze({ session: finding.session, subject: finding.subject, subjectKey: finding.subjectKey }));
  const recall = Object.freeze([...subjects.values()].map((row) => Object.freeze({ ...row, charge: recallFindingStatus(findings, row.session, row.subject) })).sort((left, right) => left.session.localeCompare(right.session) || left.subjectKey.localeCompare(right.subjectKey)));
  return Object.freeze({ kind: "agent-session.findings", generatedAt: String(options.generatedAt ?? new Date().toISOString()), eventCount: events.length, findingCount: findings.length, findings, recall });
}

export function projectFindings(snapshot, params = {}) {
  const session = typeof params.session === "string" ? params.session.trim() : "";
  const subject = typeof params.subject === "string" ? params.subject.trim() : "";
  const limit = Math.max(1, Math.min(500, Number(params.limit) || 100));
  const findings = snapshot.findings.filter((finding) => (session === "" || finding.session === session) && (subject === "" || finding.subjectKey.includes(subject))).slice(0, limit);
  return Object.freeze({ kind: "agent-session.findings.read", accepted: true, query: Object.freeze({ ...params }), snapshot, findings: Object.freeze(findings), recall: Object.freeze(snapshot.recall.filter((row) => (session === "" || row.session === session) && (subject === "" || row.subjectKey.includes(subject)))) });
}
