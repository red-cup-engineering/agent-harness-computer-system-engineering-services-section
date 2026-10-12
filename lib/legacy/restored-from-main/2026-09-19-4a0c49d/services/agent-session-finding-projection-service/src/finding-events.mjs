import { createHash } from "node:crypto";

export const findingChargeNames = Object.freeze(["absurd", "potential", "active", "stable"]);
const charges = new Set(findingChargeNames);

function optionalText(value) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text === "" ? null : text;
}

function requiredText(value, name) {
  const text = optionalText(value);
  if (text === null) throw new TypeError(`${name} must be nonempty text`);
  return text;
}

function stringList(value) {
  const values = Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : [];
  return Object.freeze(values.map(optionalText).filter((item) => item !== null));
}

function subjectTerms(value) {
  const terms = Array.isArray(value) ? value : stringList(value).flatMap((item) => item.split("/"));
  return Object.freeze(terms.map(optionalText).filter((item) => item !== null));
}

function jsonValue(value) {
  return value === undefined ? null : JSON.parse(JSON.stringify(value));
}

function digest(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function slugSubject(subject) {
  return subject.join("/").toLowerCase().replace(/[^a-z0-9]+/gu, "-").replace(/^-+|-+$/gu, "").slice(0, 56) || "subject";
}

/** Admit one charged finding without reading or writing session memory. */
export function admitSessionFinding(params, options = {}) {
  const at = requiredText(options.at ?? params.at, "at");
  const session = requiredText(params.session ?? params.session_id, "session");
  const subject = subjectTerms(params.subject);
  if (subject.length === 0) throw new TypeError("subject must contain at least one term");
  const predicate = requiredText(params.predicate, "predicate");
  const charge = optionalText(params.charge ?? params.value) ?? "potential";
  if (!charges.has(charge)) throw new TypeError(`charge must be one of ${findingChargeNames.join(", ")}: ${charge}`);
  const object = jsonValue(params.object);
  const note = jsonValue(params.note);
  const evidence = stringList(params.evidence);
  const optional = Object.fromEntries(["focus", "intent", "trace"].map((key) => [key, optionalText(params[key])]).filter(([, value]) => value !== null));
  const seed = { session, subject, predicate, charge, object, note, ...optional, evidence, at };
  const eventId = `session-finding-event:${digest(seed).slice(0, 24)}`;
  const findingId = `session-finding:${slugSubject(subject)}:${digest(seed).slice(0, 12)}`;
  const value = Object.freeze({
    kind: "agent-session.finding.event",
    event: "recorded",
    eventId,
    findingId,
    at,
    session,
    subject,
    predicate,
    charge,
    ...(object === null ? {} : { object }),
    ...(note === null ? {} : { note }),
    ...optional,
    ...(evidence.length === 0 ? {} : { evidence }),
    source: optionalText(params.source) ?? "agent-session-finding-projection-service",
  });
  return Object.freeze({
    kind: "agent-session.finding.admission",
    accepted: true,
    id: findingId,
    value,
    event: Object.freeze([findingId, "agent-session.finding.recorded", value, Object.freeze({ at, eventId })]),
  });
}
