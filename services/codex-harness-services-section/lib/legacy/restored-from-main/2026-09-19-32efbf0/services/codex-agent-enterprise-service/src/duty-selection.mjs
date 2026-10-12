import { ACTOR, CUSTOMER, identity } from "./enterprise.mjs";
import { loadCodexMapeOffice } from "./mape-office.mjs";

export const DUTY_SELECTOR = "urn:ame:codex-contextual-duty-selection-actuator";
export const DUTY_SELECTION_OFFER = "urn:offer:codex-contextual-duty-selection";

const SIGNAL_DUTY = new Map([
  ["leader-move", "maintaining-codex-situational-knowledge"],
  ["repository-state", "maintaining-codex-situational-knowledge"],
  ["provider-market-state", "maintaining-codex-situational-knowledge"],
  ["system-diagnosis-needed", "diagnosing-the-union-system"],
  ["architecture-needed", "designing-union-change"],
  ["work-decomposition-needed", "decomposing-union-change"],
  ["authorized-actuation-needed", "actuating-union-change"],
  ["verification-needed", "observing-response-and-learning"],
  ["trade-accounting-needed", "accounting-for-capability-trade"],
]);

function nonempty(value, label) {
  if (typeof value !== "string" || value.trim() === "") throw new TypeError(`${label} is required`);
  return value.trim();
}

function exactBundle(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("contextBundle must be an exact object");
  const { id, ...body } = value;
  if (id !== identity(body)) throw new TypeError("contextBundle must be content addressed exactly");
  if (body.type !== "OfficerContextBundle" || body.version !== 1) throw new TypeError("contextBundle must be OfficerContextBundle version 1");
  if (!Array.isArray(body.evidence) || body.evidence.length === 0) throw new TypeError("contextBundle evidence must be nonempty");
  const evidence = body.evidence.map((item, index) => {
    const evidenceId = nonempty(item?.id, `contextBundle.evidence[${index}].id`);
    const signal = nonempty(item?.signal, `contextBundle.evidence[${index}].signal`);
    if (!SIGNAL_DUTY.has(signal)) throw new TypeError(`unknown context duty signal ${signal}`);
    return Object.freeze({ id: evidenceId, signal });
  });
  return Object.freeze({ id, ...body, evidence: Object.freeze(evidence) });
}

export function officerContextBundle(body) {
  const exact = { type: "OfficerContextBundle", version: 1, compiler: nonempty(body?.compiler, "context compiler"), evidence: body?.evidence };
  return Object.freeze({ id: identity(exact), ...exact });
}

export function selectContextWarrantedDuties(input, { registry = loadCodexMapeOffice() } = {}) {
  if (input?.actor !== ACTOR) throw new TypeError(`duty selection actor must be ${ACTOR}`);
  if (input?.office !== registry.office.id) throw new TypeError(`duty selection office must be ${registry.office.id}`);
  const demand = nonempty(input.demand, "demand");
  const move = nonempty(input.move, "move");
  const session = nonempty(input.session, "session");
  const compilationReceipt = nonempty(input.contextCompilationReceipt, "contextCompilationReceipt");
  const context = exactBundle(input.contextBundle);
  const officeDuties = new Set(registry.duties.map(({ id }) => id));
  const warrants = new Map();
  for (const evidence of context.evidence) {
    const duty = SIGNAL_DUTY.get(evidence.signal);
    if (!officeDuties.has(duty)) throw new TypeError(`context selected duty absent from office: ${duty}`);
    const receipts = warrants.get(duty) ?? [];
    receipts.push(evidence.id);
    warrants.set(duty, receipts);
  }
  if (warrants.size === 0) throw new TypeError("context selected no office duty");
  const selections = registry.duties.filter(({ id }) => warrants.has(id)).map(({ id }) => Object.freeze({ duty: id, evidence: Object.freeze(warrants.get(id)) }));
  const body = {
    type: "ContextWarrantedDutySelectionReceipt",
    version: 1,
    provider: DUTY_SELECTOR,
    customer: CUSTOMER,
    actor: ACTOR,
    office: registry.office.id,
    demand,
    move,
    session,
    contextBundle: context.id,
    contextCompiler: context.compiler,
    contextCompilationReceipt: compilationReceipt,
    selections,
    offer: DUTY_SELECTION_OFFER,
    considerationDisposition: "unknown-until-provider-authored-offer-and-independent-incurrence-observation",
    conveys: [],
  };
  return Object.freeze({ id: identity(body), ...body });
}

