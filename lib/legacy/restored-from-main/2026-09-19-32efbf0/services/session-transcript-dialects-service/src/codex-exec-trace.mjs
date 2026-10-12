import { createHash } from "node:crypto";

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value !== null && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

function hash(value) {
  return createHash("sha256").update(stable(value)).digest("hex").slice(0, 16);
}

function record(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function string(value) {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function boundedLimit(value) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? Math.max(1, Math.min(500, parsed)) : 80;
}

export function parseCodexExecJsonl(input) {
  if (typeof input !== "string") throw new TypeError("Codex exec JSONL must be text");
  return Object.freeze(input.split(/\r?\n/u).flatMap((line, index) => {
    if (line.trim() === "") return [];
    let event;
    try { event = JSON.parse(line); } catch (error) { throw new TypeError(`Codex exec event line ${index + 1}: ${error.message}`); }
    if (record(event) === null || string(event.type) === null) throw new TypeError(`Codex exec event line ${index + 1}: expected object with string type`);
    return [Object.freeze({ ...event })];
  }));
}

function runOf(events, explicit) {
  if (string(explicit) !== null) return explicit;
  for (const event of events) {
    const thread = string(event.thread_id ?? event.threadId);
    if (thread !== null) return `thread.${thread}`;
  }
  return `run.${hash(events)}`;
}

function itemId(item) {
  return string(item.id) ?? hash(item);
}

function eventId(event, ordinal) {
  const item = record(event.item);
  if (item !== null) return `item.${itemId(item)}.${ordinal}`;
  return `${string(event.turn_id ?? event.turnId) === null ? "event" : `turn.${event.turn_id ?? event.turnId}`}.${ordinal}`;
}

function traceEntries(events, run) {
  const entries = [];
  for (const [ordinal, event] of events.entries()) {
    const subject = `codex.exec.${run}.${eventId(event, ordinal)}`;
    const provenance = Object.freeze({ source: "codex.exec.json", run, ordinal, type: event.type });
    entries.push(Object.freeze({ subject: `codex.exec.${run}`, predicate: "codex.exec.has-event", object: subject, provenance }));
    entries.push(Object.freeze({ subject, predicate: "codex.exec.event.has-type", object: event.type, provenance }));
    for (const [predicate, value] of [["codex.exec.event.in-thread", event.thread_id ?? event.threadId], ["codex.exec.event.in-turn", event.turn_id ?? event.turnId]]) {
      if (string(value) !== null) entries.push(Object.freeze({ subject, predicate, object: value, provenance }));
    }
    const item = record(event.item);
    if (item !== null) {
      const itemTerm = `codex.item.${itemId(item)}`;
      entries.push(Object.freeze({ subject, predicate: "codex.exec.event.has-item", object: itemTerm, provenance }));
      for (const [predicate, value] of [["codex.item.has-type", item.type], ["codex.item.has-status", item.status], ["codex.item.ran-command", item.command], ["codex.item.has-text", item.text]]) {
        if (string(value) !== null) entries.push(Object.freeze({ subject: itemTerm, predicate, object: value, provenance }));
      }
      entries.push(Object.freeze({ subject: itemTerm, predicate: "codex.item.has-raw", object: Object.freeze({ ...item }), provenance }));
    }
    const usage = record(event.usage);
    if (usage !== null) entries.push(Object.freeze({ subject, predicate: "codex.exec.event.has-usage", object: Object.freeze({ ...usage }), provenance }));
  }
  return Object.freeze(entries);
}

function chargeFor(status, eventType) {
  const value = String(status ?? "").toLowerCase();
  if (["completed", "succeeded"].includes(value) || eventType.endsWith(".completed")) return "potential";
  if (["failed", "errored", "error"].includes(value) || eventType.endsWith(".failed")) return "stable";
  if (["cancelled", "canceled"].includes(value)) return "absurd";
  return "active";
}

function commandItems(events, run) {
  const latest = new Map();
  for (const [ordinal, event] of events.entries()) {
    const item = record(event.item);
    if (item === null || (item.type !== "command_execution" && string(item.command) === null)) continue;
    latest.set(itemId(item), { item, event, ordinal });
  }
  return Object.freeze([...latest].map(([id, { item, event, ordinal }]) => Object.freeze({
    kind: "codex.exec.work.item",
    id: `codex.work.${run}.${id}`,
    task: Object.freeze({ id: `codex.task.${run}.${id}`, command: string(item.command), goal: "execute-command" }),
    office: "codex",
    status: chargeFor(item.status, event.type),
    evidence: Object.freeze([`codex.item.${id}`, `codex.exec.event.${event.type}`, `codex.exec.ordinal.${ordinal}`]),
  })));
}

function reports(events, run) {
  return Object.freeze(events.flatMap((event, ordinal) => {
    const item = record(event.item);
    if (item === null || (item.type !== "command_execution" && string(item.command) === null)) return [];
    const id = itemId(item);
    return [Object.freeze({ kind: "codex.exec.work.report", id: `codex.report.${run}.${id}.${ordinal}`, work: `codex.work.${run}.${id}`, office: "codex", charge: chargeFor(item.status, event.type), at: string(event.timestamp ?? event.created_at ?? event.createdAt ?? event.at), evidence: Object.freeze([`codex.item.${id}`, `codex.exec.event.${event.type}`]) })];
  }));
}

function tokenCount(usage, keys) {
  for (const key of keys) if (typeof usage[key] === "number" && Number.isFinite(usage[key]) && usage[key] >= 0) return Math.round(usage[key]);
  return 0;
}

function costs(events, run, generatedAt) {
  return Object.freeze(events.flatMap((event, ordinal) => {
    const usage = record(event.usage);
    if (usage === null) return [];
    let input = tokenCount(usage, ["input_tokens", "prompt_tokens", "inputTokens", "promptTokens"]);
    const output = tokenCount(usage, ["output_tokens", "completion_tokens", "outputTokens", "completionTokens"]);
    const total = tokenCount(usage, ["total_tokens", "totalTokens"]);
    if (input + output === 0) input = total;
    if (input + output === 0) return [];
    return [Object.freeze({ id: `cost:codex-exec:${run}:${ordinal}`, operation: "codex-exec", endpoint: "openai", model: string(usage.model), dollars: typeof usage.costUsd === "number" ? usage.costUsd : 0, tokens: Object.freeze({ input, output }), transactionTime: string(event.timestamp ?? event.created_at ?? event.createdAt ?? event.at) ?? generatedAt, evidence: Object.freeze([`codex.exec.${run}.event.${ordinal}`, `codex.exec.event.${event.type}`]) })];
  }));
}

function counts(values, key) {
  const result = {};
  for (const value of values) result[value[key]] = (result[value[key]] ?? 0) + 1;
  return Object.freeze(result);
}

/** Pure projection of one `codex exec --json` JSONL body. */
export function projectCodexExecTrace(jsonl, options = {}) {
  const events = parseCodexExecJsonl(jsonl);
  const run = runOf(events, options.run);
  const generatedAt = string(options.generatedAt) ?? new Date().toISOString();
  const entries = traceEntries(events, run);
  const readings = Object.freeze(entries.map((entry) => Object.freeze({ ...entry, value: "potential" })));
  const work = commandItems(events, run);
  const workReports = reports(events, run);
  const costEvents = costs(events, run, generatedAt);
  const findings = Object.freeze(readings.map((reading) => Object.freeze({ session: `codex.exec.${run}`, subject: reading.subject.split("."), predicate: reading.predicate, charge: reading.value, object: reading.object, note: Object.freeze({ source: "codex.exec.trace", run, provenance: reading.provenance }) })));
  const limit = boundedLimit(options.limit);
  return Object.freeze({
    kind: "session-transcript.codex-exec-trace",
    generatedAt,
    run,
    ...(string(options.focus) === null ? {} : { focus: options.focus }),
    source: Object.freeze({ kind: string(options.sourceKind) ?? "jsonl", ...(string(options.file) === null ? {} : { file: options.file }) }),
    summary: Object.freeze({ events: events.length, entries: entries.length, utterances: entries.length, readings: readings.length, findings: findings.length, work: work.length, reports: workReports.length, costs: costEvents.length, statuses: counts(workReports, "charge"), eventTypes: counts(events, "type"), truncated: events.length > limit || entries.length > limit || readings.length > limit }),
    trace: Object.freeze({ run, events: Object.freeze(events.slice(0, limit)), entries: Object.freeze(entries.slice(0, limit)), readings: Object.freeze(readings.slice(0, limit)) }),
    findings,
    work,
    reports: workReports,
    costs: costEvents,
  });
}

export function projectAgentRunTrace(jsonl, options = {}) {
  const trace = projectCodexExecTrace(jsonl, options);
  return Object.freeze({ ...trace, kind: "session-transcript.agent-run-trace", format: "codex-exec-jsonl", codec: "project-codex-exec-trace", codecProjection: trace });
}
