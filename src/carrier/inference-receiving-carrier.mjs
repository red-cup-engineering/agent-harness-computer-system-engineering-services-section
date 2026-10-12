/**
 * A receiving carrier that is not an agent CLI: the carrier contract of `agency-carrier.mjs`
 * (its `receive`, `receivingFinished`, `receivingJudged` and accounting parts) realized by one
 * schema-bound, zero-cash inference call to an admitted provider endpoint (CIE's direct endpoint
 * lane), for a model of a provider family the producers and the other receivers are not.
 *
 * Receiving an engineering delivery is a judgement, not a coding session: the receiver reads the
 * immutable proposal (its work, receiver condition, result and evidence) and the read-only evidence
 * the host can inspect for it (the commits it names), and returns the contract's typed judgement
 * (`RECEIVING_JUDGEMENT_SCHEMA`: accepted, rejected or unverified). Execution is not served: this
 * carrier produces no work, it only receives, so a host never allocates a duty to it.
 *
 * The host admits the judgement exactly as it admits a harness receiver's (`receiveAgencyWork`):
 * the same authority check, the same discharge, the same outcome on the one outcome path. What
 * differs is only the transport, and the carrier's `family`, the independence class the host's
 * receiver ranking reads (feltos-enterprise-host `receiver-independence.mjs`).
 *
 * Attempts are durable like a harness receiver's: each is a semantic record of kind
 * `inference-receiving-attempt` in `dataRoot`'s journal, kept under its receipt's key, so a host restart
 * neither repeats a judged receipt nor forgets a failed one. An attempt that could not judge
 * (provider refusal, unparseable output, or evidence that could not be inspected) is retried after
 * RECEIVING_RETRY_MS, up to RECEIVING_ATTEMPTS; past the last the carrier is exhausted for that
 * proposal and the host may fall back to the next most independent receiver.
 */
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { extend, readHead, walk } from "@red-cup-engineering/semiotic-eavt-services-section/store";

import { RECEIVING_DECISIONS, RECEIVING_JUDGEMENT_SCHEMA, receivingJudgementMeaning } from "./receiving-judgement.mjs";

/** The store type of one receiving attempt, a thread per receipt: `{ at, task, attempt, model, family, evidence, ok, errors, usage?, judgement? }`. */
export const ATTEMPT_TYPE = "inference-receiving-attempt";

export const RECEIVING_ATTEMPTS = 4;
export const RECEIVING_RETRY_MS = 10 * 60_000;
/** What a provider with a small token window is sent: the proposal and the inspected evidence, bounded. */
const PROPOSAL_CHARACTERS = 7_000;
const EVIDENCE_CHARACTERS = 6_000;
const COMMITS_INSPECTED = 4;

const clip = (text, limit) => text.length <= limit ? text : `${text.slice(0, limit)}\n[truncated ${text.length - limit} characters]`;
const git = (root, args, exec = execFile) => new Promise((resolve) => {
  exec("git", ["-C", root, ...args], { timeout: 10_000, maxBuffer: 4 * 1024 * 1024, env: { ...process.env, GIT_TERMINAL_PROMPT: "0" } },
    (error, stdout) => resolve(error ? undefined : String(stdout)));
});

/**
 * The read-only evidence the host inspects for a proposal: each commit its result and provider
 * evidence name (an abbreviated or full object id), as `git show --stat` and a bounded patch. A name
 * no commit in the repository answers to is reported as not found, never as inspected.
 */
export async function readCommitEvidence(proposal, { repositoryRoot, exec } = {}) {
  if (repositoryRoot === undefined) return Object.freeze([]);
  const named = [...new Set(JSON.stringify([proposal.result, proposal.providerEvidence]).match(/\b[0-9a-f]{7,40}\b/gu) ?? [])].slice(0, COMMITS_INSPECTED);
  const inspected = [];
  let budget = EVIDENCE_CHARACTERS;
  for (const id of named) {
    const kind = (await git(repositoryRoot, ["cat-file", "-t", id], exec))?.trim();
    if (kind !== "commit") { inspected.push(Object.freeze({ label: `commit:${id}`, found: false, text: "no such commit in the repository this host can read" })); continue; }
    const stat = await git(repositoryRoot, ["show", "--no-color", "--stat", "--format=%H%n%an%n%s", id], exec) ?? "";
    const patch = await git(repositoryRoot, ["show", "--no-color", "--format=", "-U2", id], exec) ?? "";
    const text = clip(`${stat}\n${patch}`, Math.max(600, Math.floor(budget / Math.max(1, named.length - inspected.length))));
    budget -= text.length;
    inspected.push(Object.freeze({ label: `commit:${id}`, found: true, text }));
  }
  return Object.freeze(inspected);
}

/** The proposal as the receiver reads it: what it must judge, not the host's bookkeeping. */
function proposalForReceiver(proposal) {
  return {
    scope: proposal.scope, work: proposal.work, skill: proposal.skill, method: proposal.method,
    receiverCondition: proposal.receiverCondition, origin: proposal.origin === undefined ? undefined : { office: proposal.origin.office, model: proposal.origin.model },
    result: proposal.result, providerEvidence: proposal.providerEvidence,
  };
}

export function receivingMessages({ office, proposal, evidence }) {
  const inspected = evidence.map((entry) => `--- ${entry.label} (${entry.found ? "inspected" : "NOT FOUND"})\n${entry.text}`).join("\n\n");
  return Object.freeze([
    { role: "system", content: [
      `You are an independent receiver exercising the ${office} office. You judge one immutable engineering work report under the rule below. You did not produce it and you do not perform its work.`,
      "Answer with one JSON object and nothing else: {\"decision\":\"accepted|rejected|unverified\",\"text\":\"concise judgement\",\"evidence\":[\"labels you actually used\"]}. Do not reason at length: decide from the material given.",
      receivingJudgementMeaning(proposal.result),
      "unverified: you could not inspect what the condition needs (a commit was NOT FOUND, a diff was truncated before the part that matters, a subject was outside this material). Unverified is unknown, never a rejection.",
      "In `evidence` list only labels from the INSPECTED EVIDENCE block (like commit:abc1234) or evidence strings the proposal itself names. Never invent evidence and never accept what you could not inspect.",
    ].join("\n") },
    { role: "user", content: `PROPOSAL (immutable):\n${clip(JSON.stringify(proposalForReceiver(proposal), null, 1), PROPOSAL_CHARACTERS)}\n\nINSPECTED EVIDENCE:\n${inspected === "" ? "(none inspected by the host)" : inspected}` },
  ]);
}

/** A judgement is only as good as what it cites: acceptance that cites nothing inspectable is unknown. */
function checkedJudgement(judgement, { evidence, proposal }) {
  const known = new Set([...evidence.filter((entry) => entry.found).map((entry) => entry.label), ...(proposal.providerEvidence ?? [])]);
  const cited = judgement.evidence.filter((entry) => known.has(entry));
  if (judgement.decision === "accepted" && cited.length === 0) {
    return Object.freeze({ decision: "unverified", text: `The receiver accepted without citing any evidence it was given (${judgement.text.slice(0, 300)}); that is unknown, not an acceptance.`, evidence: Object.freeze([]) });
  }
  return Object.freeze({ ...judgement, evidence: Object.freeze(cited) });
}

/** The model's own declaration, when the host carries one, of what the received work cost. */
const usageOf = (exchanges) => {
  const read = (field) => exchanges.reduce((total, entry) => total + (Number.isSafeInteger(entry?.usage?.[field]) ? entry.usage[field] : 0), 0);
  const input_tokens = read("promptTokens"), output_tokens = read("outputTokens");
  return input_tokens === 0 && output_tokens === 0 ? undefined : Object.freeze({ input_tokens, output_tokens });
};

/**
 * `{ workerId, dialect, family, model, receive, receivingFinished, receivingJudged, receivingExhausted }`
 * for the character `workerId`, which serves receiving only. `family` is the independence class of
 * `model`; `descriptor()` resolves the admitted endpoint at each attempt (admission is time-bound);
 * `dispatch({ descriptor, messages, responseFormat })` is the transport and `readEvidence(proposal)` the
 * evidence reader, each injectable.
 */
export function inferenceReceivingCarrier({
  workerId, dataRoot, nodeName, model, family, label = "inference receiver", evidenceScheme = "inference-receiving", repositoryRoot,
  descriptor, dispatch, readEvidence = (proposal) => readCommitEvidence(proposal, { repositoryRoot }), onReceivingSession, now = Date.now,
}) {
  if (typeof workerId !== "string" || workerId.length === 0) throw new TypeError(`${label} carrier: the character it serves is required`);
  if (typeof model !== "string" || model.length === 0) throw new TypeError(`${label} carrier: the model it carries is required`);
  if (typeof family !== "string" || family.length === 0) throw new TypeError(`${label} carrier: its independence class (model family) is required`);
  if (typeof descriptor !== "function" || typeof dispatch !== "function") throw new TypeError(`${label} carrier: an endpoint descriptor and a transport are required`);
  const dialect = Object.freeze({ name: evidenceScheme, label, evidence: evidenceScheme, allowance: undefined, family });
  const keyOf = (review) => createHash("sha256").update(JSON.stringify([review.proposal.receipt, workerId, review.office])).digest("hex").slice(0, 32);
  const task = (review, attempt) => `receive-${keyOf(review)}${attempt === 0 ? "" : `-${attempt}`}`;
  const attemptsOf = (review) => [...walk(dataRoot, ATTEMPT_TYPE, readHead(dataRoot, ATTEMPT_TYPE, keyOf(review))?.frontier ?? [], { limit: 64 })]
    .filter((item) => item.record !== undefined).map(({ record }) => record).sort((a, b) => a.attempt - b.attempt);
  const decided = (attempt) => attempt?.judgement !== undefined && ["accepted", "rejected"].includes(attempt.judgement.decision);
  /** The attempt due now: its number and whether the carrier should be offered the receipt at all. */
  const state = (review) => {
    const attempts = attemptsOf(review);
    const last = attempts.at(-1);
    if (last === undefined) return { attempt: 0, finished: false, attempts };
    if (decided(last)) return { attempt: attempts.length - 1, finished: true, attempts };
    if (attempts.length >= RECEIVING_ATTEMPTS) return { attempt: attempts.length - 1, finished: true, exhausted: true, attempts };
    if (now() - last.at < RECEIVING_RETRY_MS) return { attempt: attempts.length - 1, finished: true, attempts };
    return { attempt: attempts.length, finished: false, attempts };
  };
  const provider = () => { throw new TypeError(`${label} carrier serves receiving only; it carries no execution`); };
  provider.dialect = dialect;
  provider.workerId = workerId;
  provider.family = family;
  provider.model = model;
  provider.receivingFinished = (review) => state(review).finished;
  provider.receivingJudged = (review) => decided(state(review).attempts.at(-1));
  provider.receivingExhausted = (review) => state(review).exhausted === true;
  provider.receive = async (review) => {
    const { proposal, office, staffing } = review;
    if (!staffing?.carrier || proposal.origin === undefined || office === proposal.origin.office) throw new TypeError("receiving needs distinct producing and receiving offices and a stated carrier");
    if (staffing.carrier !== model) throw new TypeError(`${label} carries ${model}, not ${staffing.carrier}`);
    const { attempt, attempts } = state(review);
    const id = task(review, attempt);
    const sessionOf = (taskId) => Object.freeze({ id: `${evidenceScheme}@${nodeName ?? "node"}#${model}:${taskId}`, model });
    const last = attempts.at(-1);
    if (decided(last)) {
      // Judged and awaiting admission: offered again for the host to admit, never judged twice.
      const session = sessionOf(task(review, attempts.length - 1));
      await onReceivingSession?.(review, session);
      return { task: task(review, attempts.length - 1), session, ok: true, exitCode: 0, usage: last.usage, errors: [], judgement: last.judgement };
    }
    const session = sessionOf(id);
    await onReceivingSession?.(review, session);
    const evidence = await readEvidence(proposal);
    const record = { at: now(), task: id, attempt, model, family, evidence: evidence.map((entry) => ({ label: entry.label, found: entry.found })) };
    let outcome;
    try {
      const { text, exchanges = [], reason } = await dispatch({ descriptor: await descriptor(), messages: receivingMessages({ office, proposal, evidence }), responseFormat: RECEIVING_JUDGEMENT_SCHEMA });
      if (typeof text !== "string") outcome = { ok: false, errors: [reason ?? "the provider delivered no text"], usage: usageOf(exchanges) };
      else {
        const parsed = parseJudgement(text);
        outcome = parsed === undefined ? { ok: false, errors: ["the provider's output was not the typed judgement"], usage: usageOf(exchanges) }
          : { ok: true, errors: [], usage: usageOf(exchanges), judgement: checkedJudgement(parsed, { evidence, proposal }) };
      }
    } catch (error) {
      outcome = { ok: false, errors: [error instanceof Error ? error.message : String(error)] };
    }
    Object.assign(record, { ok: outcome.ok, errors: outcome.errors, ...(outcome.usage === undefined ? {} : { usage: outcome.usage }), ...(outcome.judgement === undefined ? {} : { judgement: outcome.judgement }) });
    extend(dataRoot, ATTEMPT_TYPE, keyOf(review), record);
    return { task: id, session, ok: outcome.ok, exitCode: outcome.ok ? 0 : 1, usage: outcome.usage, errors: outcome.errors, ...(outcome.judgement === undefined ? {} : { judgement: outcome.judgement }) };
  };
  return provider;
}

/** The typed judgement in a completion's text, tolerating the fences and reasoning a model wraps it in. */
export function parseJudgement(text) {
  const stripped = String(text).replace(/<think>[\s\S]*?<\/think>/gu, "");
  const candidates = [stripped.trim(), ...[...stripped.matchAll(/```(?:json)?\s*([\s\S]*?)```/gu)].map((match) => match[1]), ...(stripped.match(/\{[\s\S]*\}/u) ?? [])];
  for (const candidate of candidates) {
    let value;
    try { value = JSON.parse(candidate); } catch { continue; }
    if (!RECEIVING_DECISIONS.includes(value?.decision) || typeof value.text !== "string" || value.text.trim() === "") continue;
    const evidence = Array.isArray(value.evidence) ? value.evidence.filter((entry) => typeof entry === "string" && entry.length > 0) : [];
    return Object.freeze({ decision: value.decision, text: value.text, evidence: Object.freeze(evidence) });
  }
  return undefined;
}

/**
 * The transport: CIE's direct endpoint lane, zero-cash only, the response held to the judgement
 * schema by the provider.
 */
export async function directEndpointReceivingTransport({ descriptor, messages, responseFormat }, { environment = process.env, maximumOutputTokens = 700 } = {}) {
  const [{ dispatchDirectEndpointOffer, openAiJsonSchemaResponseFormat }, { executeOpenAiCompatibleToolAgent }] = await Promise.all([
    import("@red-cup-engineering/computer-inference-engine/dispatch/direct-endpoint-provider"),
    import("@red-cup-engineering/computer-inference-engine/openai/tool-agent"),
  ]);
  const execution = { zeroCashOnly: true, maximumOutputTokens, ...(environment.EXPECTED_RESOLUTION_PRICING_ROOT ? { pricingRoot: environment.EXPECTED_RESOLUTION_PRICING_ROOT } : {}) };
  const delivery = await dispatchDirectEndpointOffer(descriptor, { messages, responseFormat: openAiJsonSchemaResponseFormat(responseFormat, "receiving_judgement"), execution }, { invoke: executeOpenAiCompatibleToolAgent });
  return delivery.disposition === "delivered" ? { text: delivery.text, exchanges: delivery.exchanges } : { reason: `${delivery.provider} refused: ${delivery.reason}`, exchanges: delivery.exchanges };
}
