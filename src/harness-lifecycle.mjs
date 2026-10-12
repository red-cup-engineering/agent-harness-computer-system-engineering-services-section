import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { each, put } from "@red-cup-engineering/semiotic-eavt-services-section/store";

/** The store type of a lifecycle event: a record `{category, at, event}`, the event as the schema admits it. */
export const HARNESS_LIFECYCLE_TYPE = "harness-lifecycle";
export const HARNESS_LIFECYCLE_EVENT_SCHEMA = Object.freeze(JSON.parse(readFileSync(new URL("../data/records/schema/harness-lifecycle-event.schema.json", import.meta.url), "utf8")));
/** Application-layer admission gate. Content-addressed constituted-entity addresses (EAVT constitute law); see each harness's actor-genesis.json. */
export const ADMITTED_HARNESS_ACTORS = Object.freeze(["actor:WWOM5azg-fTrn1Id0YVbz5AhppbnFny_W5Xl-rKgSs4", "actor:bZH6KBOlPVWbYpqp04izN_Xtwykn0XgsMBStm_FkPPw"]);
export const SKILL_SELECTED_CATEGORY = "skill-selected";
export const PROVIDER_COMMISSIONED_CATEGORY = "provider-commissioned";
export const COORDINATION_COMMISSIONED_CATEGORY = "coordination-commissioned";
export const COORDINATION_ACKNOWLEDGED_CATEGORY = "coordination-acknowledged";
export const COORDINATION_COMPLETED_CATEGORY = "coordination-completed";
export const COORDINATION_REFUSED_CATEGORY = "coordination-refused";
export const SKILL_SELECTED_EVENT_TYPE = `bare-cedar-fog.harness/${SKILL_SELECTED_CATEGORY}`;
export const PROVIDER_COMMISSIONED_EVENT_TYPE = `bare-cedar-fog.harness/${PROVIDER_COMMISSIONED_CATEGORY}`;
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

/** Put one admitted lifecycle event under its category; returns its address and the event as recorded. */
function putLifecycleEvent({ root, category, event, recordedAt }) {
  assertHarnessLifecycleEvent(event);
  const id = put(resolve(requiredText(root, "root")), HARNESS_LIFECYCLE_TYPE, { category, at: recordedAt, event });
  return Object.freeze({ id, category, event: Object.freeze(event), recordedAt });
}

/**
 * The lifecycle events recorded at a root, of the given categories (all when none are named), in
 * recorded order: `{id, category, recordedAt, record}`, `record` being the event.
 */
export function lifecycleEventsAt(root, categories) {
  const wanted = categories === undefined ? undefined : new Set(categories);
  const events = [];
  for (const { address, record } of each(resolve(requiredText(root, "root")), HARNESS_LIFECYCLE_TYPE)) {
    if (typeof record.category !== "string" || (wanted !== undefined && !wanted.has(record.category))) continue;
    events.push({ id: address, category: record.category, recordedAt: record.at, record: record.event });
  }
  return events.sort((left, right) => String(left.recordedAt).localeCompare(String(right.recordedAt)) || left.id.localeCompare(right.id));
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
  return putLifecycleEvent({ root, category, event, recordedAt });
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
  return putLifecycleEvent({ root, category: COORDINATION_COMMISSIONED_CATEGORY, event, recordedAt });
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
  return putLifecycleEvent({ root, category, event, recordedAt });
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

function ranked(records) {
  const counts = new Map();
  for (const { record } of records) counts.set(record.name, (counts.get(record.name) ?? 0) + 1);
  return [...counts].map(([name, count]) => Object.freeze({ name, count, attention: "candidate-for-independent-review" }))
    .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name));
}

export function summarizeHarnessLifecycle({ root }) {
  const skills = lifecycleEventsAt(root, [SKILL_SELECTED_CATEGORY]);
  const providers = lifecycleEventsAt(root, [PROVIDER_COMMISSIONED_CATEGORY]);
  return Object.freeze({
    type: "bare-cedar-fog.harness-attention-summary.v1",
    interpretation: "Usage is attention evidence for independent review, not proof of quality.",
    selectedSkills: Object.freeze(ranked(skills)),
    commissionedProviders: Object.freeze(ranked(providers)),
    eventCount: skills.length + providers.length,
  });
}
