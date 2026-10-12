import { admit, defineType } from "@red-cup-engineering/computer-data-engine";
import eventSchema from "../data/records/schema/agent-lifecycle-event.schema.json" with { type: "json" };
import responseSchema from "../data/records/schema/agent-lifecycle-response.schema.json" with { type: "json" };

function established(result) {
  if (!result.ok) throw new TypeError(`agent-lifecycle type declaration refused: ${JSON.stringify(result.refusal)}`);
  return result.value;
}

/** One lifecycle event an agent runtime delivers to a hook, runtime-neutral. */
export const AGENT_LIFECYCLE_EVENT_TYPE = established(defineType({ id: eventSchema.$id, name: "AgentLifecycleEvent", description: "One lifecycle event an agent runtime delivers to a hook.", parents: [], schema: eventSchema }));
/** What a handler decides about one lifecycle event, runtime-neutral. */
export const AGENT_LIFECYCLE_RESPONSE_TYPE = established(defineType({ id: responseSchema.$id, name: "AgentLifecycleResponse", description: "What a hook handler decides about one lifecycle event.", parents: [], schema: responseSchema }));

export const LIFECYCLE_EVENTS = Object.freeze(eventSchema.properties.event.enum);
export const AGENT_RUNTIMES = Object.freeze(eventSchema.properties.runtime.enum);

export function accept(value) {
  return Object.freeze({ ok: true, value });
}

/** A typed refusal with a stable code; never an exception. */
export function refuse(code, message, details) {
  return Object.freeze({ ok: false, refusal: Object.freeze(details === undefined ? { kind: "refusal", code, message } : { kind: "refusal", code, message, details }) });
}

export function admitAs(type, value, code, label) {
  const admitted = admit(type, value);
  if (admitted.ok) return accept(admitted.value);
  return refuse(code, `${label} was not admitted by ${type.name}`, { issues: admitted.refusal.issues.map((issue) => ({ path: issue.path, message: issue.message })) });
}

/** Admit one AgentLifecycleEvent. */
export const admitAgentLifecycleEvent = (value) => admitAs(AGENT_LIFECYCLE_EVENT_TYPE, value, "event-not-admitted", "agent lifecycle event");
/** Admit one AgentLifecycleResponse. */
export const admitAgentLifecycleResponse = (value) => admitAs(AGENT_LIFECYCLE_RESPONSE_TYPE, value, "response-not-admitted", "agent lifecycle response");

/** The response that lets the runtime continue with nothing added. */
export const CONTINUE = Object.freeze({ kind: "agent-lifecycle-response", version: 1, disposition: "continue" });

/** Form a continue response carrying context, a system message, a permission ruling, or a replaced tool input. */
export function respond(fields = {}) {
  return admitAgentLifecycleResponse({ kind: "agent-lifecycle-response", version: 1, disposition: "continue", ...fields });
}

/** Form a block response with its reason. */
export function block(reason, fields = {}) {
  return admitAgentLifecycleResponse({ kind: "agent-lifecycle-response", version: 1, disposition: "block", reason, ...fields });
}
