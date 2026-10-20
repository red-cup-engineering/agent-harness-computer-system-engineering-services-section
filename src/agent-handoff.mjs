// The handoff record: what an agent writes when it ends near its context budget so a fresh agent
// continues the Work from the record instead of from the whole transcript. The record is a
// bounded, structured brief (not a transcript summary) with a content address; the successor's
// prompt is rendered from it deterministically.
//
// Pure: no filesystem or network effect here. scripts/write-agent-handoff.mjs does the writing.
import { createHash } from "node:crypto";

export const HANDOFF_KIND = "agent-handoff-record";
export const HANDOFF_VERSION = 1;
/** A handoff that costs more to read than it saves is not a handoff: about 4 bytes per token. */
export const DEFAULT_MAX_BYTES = 48_000;

const LIST_FIELDS = ["done", "decisions", "openQuestions", "nextSteps", "blockers", "doNotRedo"];
const SECRET_PATTERNS = [
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/u, "a private key block"],
  [/\b(?:sk|pk)-(?:ant-|proj-|live-)?[A-Za-z0-9_-]{20,}/u, "an API key"],
  [/\bgh[pousr]_[A-Za-z0-9]{30,}/u, "a GitHub token"],
  [/\bAKIA[0-9A-Z]{16}\b/u, "an AWS access key id"],
  [/\b(?:password|passwd|secret|api[_-]?key|token)\s*[:=]\s*\S{6,}/iu, "a credential assignment"],
];

const canonical = (value) => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
};

function text(value, label, { optional = false, max = 2000 } = {}) {
  if (value === undefined || value === null || value === "") {
    if (optional) return undefined;
    throw new TypeError(`${label} is required`);
  }
  if (typeof value !== "string") throw new TypeError(`${label} must be a string`);
  if (value.length > max) throw new TypeError(`${label} is ${value.length} characters; the limit is ${max}. Say less, or point at a file.`);
  return value;
}

function list(value, label) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new TypeError(`${label} must be a list`);
  return value.map((entry, index) => {
    if (typeof entry === "string") return text(entry, `${label}[${index}]`, { max: 600 });
    if (entry !== null && typeof entry === "object") return Object.fromEntries(Object.entries(entry).map(([key, v]) => [key, text(v, `${label}[${index}].${key}`, { max: 600 })]));
    throw new TypeError(`${label}[${index}] must be a string or an object of strings`);
  });
}

/** Names the first credential-shaped thing in a value, or null. */
export function credentialIn(value) {
  const body = typeof value === "string" ? value : JSON.stringify(value);
  for (const [pattern, name] of SECRET_PATTERNS) if (pattern.test(body)) return name;
  return null;
}

/**
 * Validate and form a handoff record.
 * @param {object} input `{ work: {id, title?}, goal, state?: {done, decisions, openQuestions, nextSteps, blockers, doNotRedo},
 *   evidence?: {commits, prs, files, commands, messages, receipts}, from?: {sessionId, agentId, model, contextTokens} }`
 * @param {{now?: Date, maxBytes?: number}} [options]
 */
export function formHandoffRecord(input, { now = new Date(), maxBytes = DEFAULT_MAX_BYTES } = {}) {
  if (input === null || typeof input !== "object") throw new TypeError("a handoff input is an object");
  const state = input.state ?? {};
  const evidence = input.evidence ?? {};
  const from = input.from ?? {};
  const body = {
    kind: HANDOFF_KIND,
    version: HANDOFF_VERSION,
    createdAt: now.toISOString(),
    from: {
      sessionId: text(from.sessionId, "from.sessionId", { optional: true, max: 80 }) ?? null,
      agentId: text(from.agentId, "from.agentId", { optional: true, max: 80 }) ?? null,
      model: text(from.model, "from.model", { optional: true, max: 80 }) ?? null,
      contextTokens: Number.isSafeInteger(from.contextTokens) && from.contextTokens >= 0 ? from.contextTokens : null,
    },
    work: { id: text(input.work?.id, "work.id", { max: 200 }), title: text(input.work?.title, "work.title", { optional: true, max: 200 }) ?? null },
    goal: text(input.goal, "goal"),
    state: Object.fromEntries(LIST_FIELDS.map((field) => [field, list(state[field], `state.${field}`)])),
    evidence: Object.fromEntries(["commits", "prs", "files", "commands", "messages", "receipts"].map((field) => [field, list(evidence[field], `evidence.${field}`)])),
  };
  if (body.state.nextSteps.length === 0) throw new TypeError("state.nextSteps is required: a handoff with no next step is a report, not a handoff");
  const credential = credentialIn(body);
  if (credential !== null) throw new TypeError(`the handoff contains ${credential}; a handoff carries references to secrets, never secrets`);
  const bytes = Buffer.byteLength(canonical(body));
  if (bytes > maxBytes) throw new TypeError(`the handoff is ${bytes} bytes; the limit is ${maxBytes}. A handoff the successor must skim is not saving context.`);
  return { id: `sha256:${createHash("sha256").update(canonical(body)).digest("hex")}`, ...body };
}

const bullet = (entry) => `- ${typeof entry === "string" ? entry : Object.entries(entry).map(([key, value]) => `${key}: ${value}`).join("; ")}`;
const section = (title, entries) => (entries.length === 0 ? [] : [`## ${title}`, ...entries.map(bullet), ""]);

/** The successor's opening prompt, rendered from the record and nothing else. */
export function renderHandoffPrompt(record) {
  return [
    `You continue Work ${record.work.id}${record.work.title ? ` (${record.work.title})` : ""} from a handoff, not from a transcript. The previous agent ended at ${record.from.contextTokens ?? "an unrecorded number of"} tokens of context so you start small; do not re-derive what it records as done.`,
    "",
    "## Goal", record.goal, "",
    ...section("Done", record.state.done),
    ...section("Decisions", record.state.decisions),
    ...section("Do not redo", record.state.doNotRedo),
    ...section("Open questions", record.state.openQuestions),
    ...section("Blockers", record.state.blockers),
    ...section("Next steps", record.state.nextSteps),
    ...section("Commits", record.evidence.commits),
    ...section("Pull requests", record.evidence.prs),
    ...section("Files", record.evidence.files),
    ...section("Commands that ran", record.evidence.commands),
    ...section("Source messages", record.evidence.messages ?? []),
    ...section("Receiving and effect receipts", record.evidence.receipts ?? []),
    "The predecessor\x27s reported Done is not independently accepted Work. Preserve original Actor message provenance, inspect current receiving conditions, and distinguish source change, submission, integration, installation and independently received effects before declaring closure.",
    `Handoff record ${record.id}. When you end, record the outcome against Work ${record.work.id}.`,
  ].join("\n");
}

/** Context size and model of the last billable request in a Claude Code transcript's text, reading usage fields only. */
export function contextOfClaudeTranscript(content) {
  let last = null;
  for (const line of content.split("\n")) {
    if (!line.includes('"usage"')) continue;
    let row;
    try { row = JSON.parse(line); } catch { continue; }
    const usage = row?.message?.usage;
    if (row?.type !== "assistant" || usage === undefined || usage === null || row.message.model === "<synthetic>") continue;
    const n = (value) => (Number.isSafeInteger(value) && value >= 0 ? value : 0);
    last = { model: row.message.model, contextTokens: n(usage.input_tokens) + n(usage.cache_read_input_tokens) + n(usage.cache_creation_input_tokens) };
  }
  return last;
}
