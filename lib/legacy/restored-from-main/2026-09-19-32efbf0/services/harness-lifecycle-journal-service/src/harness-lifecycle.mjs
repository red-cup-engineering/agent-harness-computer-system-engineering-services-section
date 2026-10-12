import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createSemanticRecordJournal } from "@red-cup-engineering/semantic-record-journal-service";

export const HARNESS_LIFECYCLE_OBJECT_KIND = "bare-cedar-fog.harness-lifecycle-event.v1";
export const HARNESS_LIFECYCLE_EVENT_SCHEMA = Object.freeze(JSON.parse(readFileSync(new URL("../data/records/schema/harness-lifecycle-event.schema.json", import.meta.url), "utf8")));
/** Application-layer admission gate. Content-addressed constituted-entity addresses (EAVT constitute law); see each harness's actor-genesis.json. */
export const ADMITTED_HARNESS_ACTORS = Object.freeze(["actor:WWOM5azg-fTrn1Id0YVbz5AhppbnFny_W5Xl-rKgSs4", "actor:bZH6KBOlPVWbYpqp04izN_Xtwykn0XgsMBStm_FkPPw"]);
export const SKILL_SELECTED_CATEGORY = "skill-selected";
export const PROVIDER_COMMISSIONED_CATEGORY = "provider-commissioned";
export const INFERENCE_PURCHASED_CATEGORY = "inference-purchased";
export const COORDINATION_COMMISSIONED_CATEGORY = "coordination-commissioned";
export const COORDINATION_ACKNOWLEDGED_CATEGORY = "coordination-acknowledged";
export const COORDINATION_COMPLETED_CATEGORY = "coordination-completed";
export const COORDINATION_REFUSED_CATEGORY = "coordination-refused";
export const SKILL_SELECTED_EVENT_TYPE = `bare-cedar-fog.harness/${SKILL_SELECTED_CATEGORY}`;
export const PROVIDER_COMMISSIONED_EVENT_TYPE = `bare-cedar-fog.harness/${PROVIDER_COMMISSIONED_CATEGORY}`;
export const INFERENCE_PURCHASED_EVENT_TYPE = `bare-cedar-fog.harness/${INFERENCE_PURCHASED_CATEGORY}`;
export const COORDINATION_COMMISSIONED_EVENT_TYPE = `bare-cedar-fog.harness/${COORDINATION_COMMISSIONED_CATEGORY}`;
export const COORDINATION_ACKNOWLEDGED_EVENT_TYPE = `bare-cedar-fog.harness/${COORDINATION_ACKNOWLEDGED_CATEGORY}`;
export const COORDINATION_COMPLETED_EVENT_TYPE = `bare-cedar-fog.harness/${COORDINATION_COMPLETED_CATEGORY}`;
export const COORDINATION_REFUSED_EVENT_TYPE = `bare-cedar-fog.harness/${COORDINATION_REFUSED_CATEGORY}`;

function requiredText(value, label) {
  if (typeof value !== "string" || value.trim() === "") throw new TypeError(`${label} is required`);
  return value.trim();
}

function requiredTextArray(value, label) {
  if (!Array.isArray(value) || value.length === 0) throw new TypeError(`${label} must be a nonempty array`);
  return value.map((item) => requiredText(item, `${label} item`));
}

function requiredAllocation(value) {
  if (!Number.isInteger(value) || value < 1 || value > 10_000) throw new TypeError("allocationBasisPoints must be an integer from 1 through 10000");
  return value;
}

function admittedActor(value) {
  const actor = requiredText(value, "actor");
  if (!ADMITTED_HARNESS_ACTORS.includes(actor)) throw new TypeError(`actor is not an admitted harness actor: ${actor}`);
  return actor;
}

export function assertHarnessLifecycleEvent(event, schema = HARNESS_LIFECYCLE_EVENT_SCHEMA) {
  if (!event || Object.getPrototypeOf(event) !== Object.prototype) throw new TypeError("harness lifecycle event must be an object");
  const variant = schema.oneOf?.find((candidate) => candidate.properties?.type?.const === event.type);
  if (!variant) throw new TypeError(`harness lifecycle event type is not admitted by ${schema.$id}`);
  for (const key of variant.required ?? []) if (!Object.hasOwn(event, key)) throw new TypeError(`harness lifecycle event is missing ${key}`);
  if (variant.additionalProperties === false) {
    const admitted = new Set(Object.keys(variant.properties ?? {}));
    for (const key of Object.keys(event)) if (!admitted.has(key)) throw new TypeError(`harness lifecycle event has an unadmitted property: ${key}`);
  }
  for (const [key, rule] of Object.entries(variant.properties ?? {})) {
    const value = event[key];
    if (Object.hasOwn(rule, "const") && value !== rule.const) throw new TypeError(`harness lifecycle event ${key} differs from its schema constant`);
    if (Array.isArray(rule.enum) && !rule.enum.includes(value)) throw new TypeError(`harness lifecycle event ${key} is not one of its admitted values`);
    if (rule.type === "string" && (typeof value !== "string" || value.length < (rule.minLength ?? 0))) throw new TypeError(`harness lifecycle event ${key} is not a conforming string`);
  }
  return event;
}

export function openHarnessLifecycleJournal({ root }) {
  return createSemanticRecordJournal({ root: resolve(requiredText(root, "root")), objectKind: HARNESS_LIFECYCLE_OBJECT_KIND });
}

function recordLifecycleEvent({ root, actor, turnId, category, name, task, recordedAt = new Date().toISOString() }) {
  const who = admittedActor(actor);
  const turn = requiredText(turnId, "turnId"), selected = requiredText(name, category === SKILL_SELECTED_CATEGORY ? "skill" : "agent");
  const event = {
    type: `bare-cedar-fog.harness/${category}`,
    version: 1,
    actor: who,
    turn,
    name: selected,
    ...(task === undefined ? {} : { task: requiredText(task, "task") }),
  };
  assertHarnessLifecycleEvent(event);
  const result = openHarnessLifecycleJournal({ root }).record({
    category,
    record: event,
    recordedAt,
    charge: { support: true, refutation: false },
    relation: { subject: event.actor, predicate: category, object: selected },
  });
  return Object.freeze({ ...result, event: Object.freeze(event), recordedAt });
}

export function recordSkillSelection({ root, actor, turnId, skill, recordedAt }) {
  return recordLifecycleEvent({ root, actor, turnId, category: SKILL_SELECTED_CATEGORY, name: skill, recordedAt });
}

export function recordProviderCommission({ root, actor, turnId, agent, task, recordedAt }) {
  return recordLifecycleEvent({ root, actor, turnId, category: PROVIDER_COMMISSIONED_CATEGORY, name: agent, task, recordedAt });
}

/**
 * Constitute a content-addressed coordination envelope.  Its returned journal
 * id is the stable coordination reference used by subsequent lifecycle events.
 * The function is pure until the final journal record call.
 */
export function recordCoordinationCommission({ root, actor, turnId, receiverActor, capability, channel, workClass, allocationBasisPoints, inputRefs, route, receiverCondition, recordedAt = new Date().toISOString() }) {
  const event = {
    type: COORDINATION_COMMISSIONED_EVENT_TYPE,
    version: 1,
    actor: admittedActor(actor),
    turn: requiredText(turnId, "turnId"),
    receiverActor: requiredText(receiverActor, "receiverActor"),
    capability: requiredText(capability, "capability"),
    channel: requiredText(channel, "channel"),
    workClass: requiredText(workClass, "workClass"),
    allocationBasisPoints: requiredAllocation(allocationBasisPoints),
    inputRefs: requiredTextArray(inputRefs, "inputRefs"),
    route: requiredText(route, "route"),
    receiverCondition: requiredText(receiverCondition, "receiverCondition"),
  };
  assertHarnessLifecycleEvent(event);
  const result = openHarnessLifecycleJournal({ root }).record({
    category: COORDINATION_COMMISSIONED_CATEGORY, record: event, recordedAt,
    charge: { support: true, refutation: false },
    relation: { subject: event.actor, predicate: COORDINATION_COMMISSIONED_CATEGORY, object: event.receiverActor },
  });
  return Object.freeze({ ...result, event: Object.freeze(event), recordedAt });
}

function recordCoordinationState({ root, actor, turnId, coordination, category, resultRefs, refusal, recordedAt = new Date().toISOString() }) {
  const event = {
    type: `bare-cedar-fog.harness/${category}`,
    version: 1,
    actor: admittedActor(actor),
    turn: requiredText(turnId, "turnId"),
    coordination: requiredText(coordination, "coordination"),
    ...(resultRefs === undefined ? {} : { resultRefs: requiredTextArray(resultRefs, "resultRefs") }),
    ...(refusal === undefined ? {} : { refusal: requiredText(refusal, "refusal") }),
  };
  assertHarnessLifecycleEvent(event);
  const result = openHarnessLifecycleJournal({ root }).record({
    category, record: event, recordedAt,
    charge: { support: category !== COORDINATION_REFUSED_CATEGORY, refutation: category === COORDINATION_REFUSED_CATEGORY },
    relation: { subject: event.actor, predicate: category, object: event.coordination },
  });
  return Object.freeze({ ...result, event: Object.freeze(event), recordedAt });
}

export const acknowledgeCoordination = (input) => recordCoordinationState({ ...input, category: COORDINATION_ACKNOWLEDGED_CATEGORY });
export const completeCoordination = (input) => recordCoordinationState({ ...input, category: COORDINATION_COMPLETED_CATEGORY });
export const refuseCoordination = (input) => recordCoordinationState({ ...input, category: COORDINATION_REFUSED_CATEGORY });

/** Reduce already-ordered events. It is deliberately side-effect free. */
export function reduceCoordinationLifecycle(events) {
  let state = "unseen";
  for (const { record } of events) {
    if (record.type === COORDINATION_COMMISSIONED_EVENT_TYPE && state === "unseen") state = "commissioned";
    else if (record.type === COORDINATION_ACKNOWLEDGED_EVENT_TYPE && state === "commissioned") state = "acknowledged";
    else if (record.type === COORDINATION_COMPLETED_EVENT_TYPE && state === "acknowledged") state = "completed";
    else if (record.type === COORDINATION_REFUSED_EVENT_TYPE && ["commissioned", "acknowledged"].includes(state)) state = "refused";
    else throw new TypeError(`invalid coordination lifecycle transition from ${state} with ${record.type}`);
  }
  return state;
}

function requiredNumber(value, label) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) throw new TypeError(`${label} must be a nonnegative finite number`);
  return value;
}

function requiredPrice(value) {
  if (!value || Object.getPrototypeOf(value) !== Object.prototype) throw new TypeError("price is required");
  const denomination = value.denomination;
  if (!denomination || Object.getPrototypeOf(denomination) !== Object.prototype
    || typeof denomination.kind !== "string" || denomination.kind === ""
    || typeof denomination.asset !== "string" || denomination.asset === ""
    || typeof denomination.unit !== "string" || denomination.unit === "") {
    throw new TypeError("price.denomination must carry nonempty kind, asset, and unit");
  }
  const amount = value.amount;
  if (!amount || Object.getPrototypeOf(amount) !== Object.prototype
    || typeof amount.numerator !== "string" || !/^-?[0-9]+$/u.test(amount.numerator)
    || typeof amount.denominator !== "string" || !/^[1-9][0-9]*$/u.test(amount.denominator)) {
    throw new TypeError("price.amount must be an exact fraction with decimal-integer numerator and positive denominator strings");
  }
  return { denomination: { ...denomination }, amount: { ...amount } };
}

function optionalUsage(value) {
  if (value === undefined) return undefined;
  if (!value || Object.getPrototypeOf(value) !== Object.prototype) throw new TypeError("usage must be an object when supplied");
  const side = (label) => {
    const entry = value[label];
    if (entry === undefined) return undefined;
    if (!entry || Object.getPrototypeOf(entry) !== Object.prototype || !Number.isInteger(entry.quantity) || entry.quantity < 0 || typeof entry.denomination !== "string" || entry.denomination === "") {
      throw new TypeError(`usage.${label} must carry a nonnegative integer quantity and a nonempty denomination`);
    }
    return { quantity: entry.quantity, denomination: entry.denomination };
  };
  const input = side("input"), output = side("output");
  const usage = { ...(input === undefined ? {} : { input }), ...(output === undefined ? {} : { output }) };
  return Object.keys(usage).length ? usage : undefined;
}

/**
 * Records one purchase-receipt event for a dispatched inference exchange:
 * a customer actor bought one exchange from one provider at one price. This
 * is the third harness lifecycle event category alongside skill-selected and
 * provider-commissioned; it shares the same admission gate and journal.
 * @param {object} input
 * @param {string} input.root - journal root directory.
 * @param {string} input.actor - admitted harness actor (the purchasing customer).
 * @param {string} input.turnId
 * @param {string} input.provider - catalog providerId that served the exchange.
 * @param {string} input.model - model id actually used.
 * @param {"completion"|"refusal"} input.outcome
 * @param {number} input.latencySeconds - wall-time-seconds from the exchange's cost field.
 * @param {{denomination: {kind: string, asset: string, unit: string}, amount: {numerator: string, denominator: string}}} input.price
 * @param {string} input.exchangeId - the id of the runOpenAiCompatibleChatExchange record this receipt closes.
 * @param {{input?: {quantity: number, denomination: string}, output?: {quantity: number, denomination: string}}} [input.usage] - present only when the provider reported usage; never estimated.
 * @param {string} [input.recordedAt]
 * @returns {object} the frozen record result, `{..., event}`.
 */
export function recordInferencePurchase({ root, actor, turnId, provider, model, outcome, latencySeconds, price, exchangeId, usage, recordedAt = new Date().toISOString() }) {
  const who = admittedActor(actor);
  const turn = requiredText(turnId, "turnId");
  const providerId = requiredText(provider, "provider");
  const modelId = requiredText(model, "model");
  const exchange = requiredText(exchangeId, "exchangeId");
  if (!["completion", "refusal"].includes(outcome)) throw new TypeError("outcome must be completion or refusal");
  const latency = requiredNumber(latencySeconds, "latencySeconds");
  const priceValue = requiredPrice(price);
  const usageValue = optionalUsage(usage);
  const event = {
    type: INFERENCE_PURCHASED_EVENT_TYPE,
    version: 1,
    actor: who,
    turn,
    provider: providerId,
    model: modelId,
    outcome,
    latencySeconds: latency,
    exchangeId: exchange,
    price: priceValue,
    ...(usageValue === undefined ? {} : { usage: usageValue }),
  };
  assertHarnessLifecycleEvent(event);
  const result = openHarnessLifecycleJournal({ root }).record({
    category: INFERENCE_PURCHASED_CATEGORY,
    record: event,
    recordedAt,
    charge: { support: true, refutation: false },
    relation: { subject: event.actor, predicate: INFERENCE_PURCHASED_CATEGORY, object: providerId },
  });
  return Object.freeze({ ...result, event: Object.freeze(event), recordedAt });
}

function ranked(records) {
  const counts = new Map();
  for (const { record } of records) counts.set(record.name, (counts.get(record.name) ?? 0) + 1);
  return [...counts].map(([name, count]) => Object.freeze({ name, count, attention: "candidate-for-independent-review" }))
    .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name));
}

export function summarizeHarnessLifecycle({ root }) {
  const lifecycle = openHarnessLifecycleJournal({ root });
  const skills = lifecycle.query({ category: SKILL_SELECTED_CATEGORY });
  const providers = lifecycle.query({ category: PROVIDER_COMMISSIONED_CATEGORY });
  return Object.freeze({
    type: "bare-cedar-fog.harness-attention-summary.v1",
    interpretation: "Usage is attention evidence for independent review, not proof of quality.",
    selectedSkills: Object.freeze(ranked(skills)),
    commissionedProviders: Object.freeze(ranked(providers)),
    eventCount: skills.length + providers.length,
  });
}
