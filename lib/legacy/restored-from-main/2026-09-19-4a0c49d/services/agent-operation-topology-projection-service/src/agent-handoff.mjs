import { createHash } from "node:crypto";

function object(value, label) { if (value === null || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${label} must be an object`); return value; }
function optionalText(value) { if (value === undefined || value === null) return null; const text = String(value).trim(); return text === "" ? null : text; }
function text(value, label) { const result = optionalText(value); if (result === null) throw new TypeError(`${label} must be non-empty text`); return result; }
function list(value) { return Object.freeze((typeof value === "string" ? [value] : Array.isArray(value) ? value : []).map(optionalText).filter((entry) => entry !== null)); }
function slug(value) { return value.toLowerCase().replace(/[^a-z0-9]+/gu, "-").replace(/^-|-$/gu, "").slice(0, 72) || "agent"; }
function hash(value) { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function control(condition, verdict, evidence, requiredEvidence) { return Object.freeze({ condition, verdict, evidence, requiredEvidence }); }

function selectedWork(snapshot, requested) {
  const items = Array.isArray(snapshot?.items) ? snapshot.items : [];
  const id = optionalText(requested);
  if (id !== null) return items.find((item) => item?.id === id || item?.id?.includes(id) || item?.title === id) ?? null;
  return items.find((item) => item?.status === "active" || item?.workStatus === "doing") ?? null;
}

/** Project a handoff packet and its controls from explicit agent, capability, and work carriers. */
export function projectAgentHandoff(input) {
  object(input, "input");
  const card = object(input.card, "card");
  const coverage = object(input.coverage, "coverage");
  const generatedAt = text(input.generatedAt ?? new Date().toISOString(), "generatedAt");
  const intent = text(input.intent ?? "agent handoff", "intent");
  const focus = optionalText(input.focus) ?? optionalText(card.capabilities?.focus);
  const from = optionalText(input.from) ?? text(card.agent?.id, "card.agent.id");
  const to = text(input.to ?? "external.agent", "to");
  const evidence = list(input.evidence);
  const work = selectedWork(input.workSnapshot, input.work);
  const recordRequested = input.record === true;
  const gaps = Array.isArray(coverage.gaps) ? coverage.gaps : [];
  const coveredTerms = Array.isArray(coverage.coveredTerms) ? coverage.coveredTerms : [];
  const id = `handoff:${slug(to)}:${hash({ from, to, intent, focus, work: work?.id, evidence }).slice(0, 16)}`;
  return Object.freeze({
    kind: "agent-harness.handoff-packet",
    id,
    protocol: text(input.protocol ?? "agent-handoff.v1", "protocol"),
    generatedAt,
    from,
    to,
    intent,
    focus,
    work,
    evidence,
    controls: Object.freeze([
      control("capability", gaps.length === 0 ? "pass" : "repair", gaps.length === 0 ? `covered terms: ${coveredTerms.join(", ") || "none"}` : `coverage gaps: ${gaps.join(", ")}`, "capability coverage for handoff intent"),
      control("read-work", work === null ? "missing" : "pass", work === null ? "no active read-work item selected" : `${work.id}: ${work.title}`, "read-work item or explicit non-read-work handoff rationale"),
      control("authority", card.authority?.canAcceptHandoff === false ? "repair" : "pass", card.authority?.safetyEnvelope ?? "unspecified", "declared handoff authority and safety envelope"),
      control("transport", "pass", "application composes the engineering-owned operation faces", "an application transport over the operation graph"),
      control("witness", recordRequested ? "pass" : "missing", recordRequested ? "record requested" : "preview only; no journal witness will be appended", "record=true when the handoff should become durable evidence"),
    ]),
    payload: Object.freeze({ agentCard: text(card.agent?.id, "card.agent.id"), operationSurface: card.surface?.httpPost ?? null, recommendedEntry: "handoff-agent", capabilityCoverage: coverage }),
    witness: Object.freeze({ selectedWork: work?.id ?? null, capabilityGaps: gaps.length, recordRequested }),
  });
}
