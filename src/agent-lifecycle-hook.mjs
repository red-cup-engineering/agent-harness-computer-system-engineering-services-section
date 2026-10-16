// decodeAgentLifecycleEvent, folded local to this package.
//
// The historical @red-cup-engineering/agent-lifecycle-hook-service package
// was deleted (4a0c49d40e7) with no replacement, and this package's own
// harness-efficiency assay (src/harness-efficiency.mjs) is its only house
// consumer, so the decoder becomes this package's own module rather than a
// one-file package. Recovered from git history (src/event.mjs + src/types.mjs
// at that package's last commit), adapted only in its own imports: the type
// declarations go through @red-cup-engineering/computer-system-engine/type-system
// now that computer-data-engine has dissolved into computer-system-engine.
import { admit, defineType } from "@red-cup-engineering/signcell/type-system";
import eventSchema from "../data/records/schema/agent-lifecycle-event.schema.json" with { type: "json" };
import responseSchema from "../data/records/schema/agent-lifecycle-response.schema.json" with { type: "json" };

function established(result) {
  if (!result.ok) throw new TypeError(`agent-lifecycle type declaration refused: ${JSON.stringify(result.refusal)}`);
  return result.value;
}

const AGENT_LIFECYCLE_EVENT_TYPE = established(defineType({ id: eventSchema.$id, name: "AgentLifecycleEvent", description: "One lifecycle event an agent runtime delivers to a hook.", parents: [], schema: eventSchema }));
const AGENT_LIFECYCLE_RESPONSE_TYPE = established(defineType({ id: responseSchema.$id, name: "AgentLifecycleResponse", description: "What a hook handler decides about one lifecycle event.", parents: [], schema: responseSchema }));

const LIFECYCLE_EVENTS = Object.freeze(eventSchema.properties.event.enum);
const AGENT_RUNTIMES = Object.freeze(eventSchema.properties.runtime.enum);

function accept(value) {
  return Object.freeze({ ok: true, value });
}

/** A typed refusal with a stable code; never an exception. */
function refuse(code, message, details) {
  return Object.freeze({ ok: false, refusal: Object.freeze(details === undefined ? { kind: "refusal", code, message } : { kind: "refusal", code, message, details }) });
}

function admitAs(type, value, code, label) {
  const admitted = admit(type, value);
  if (admitted.ok) return accept(admitted.value);
  return refuse(code, `${label} was not admitted by ${type.name}`, { issues: admitted.refusal.issues.map((issue) => ({ path: issue.path, message: issue.message })) });
}

const admitAgentLifecycleEvent = (value) => admitAs(AGENT_LIFECYCLE_EVENT_TYPE, value, "event-not-admitted", "agent lifecycle event");
const admitAgentLifecycleResponse = (value) => admitAs(AGENT_LIFECYCLE_RESPONSE_TYPE, value, "response-not-admitted", "agent lifecycle response");

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

const string = (value) => (typeof value === "string" && value.length > 0 ? value : undefined);

/**
 * Decode one runtime's wire hook input into an AgentLifecycleEvent. Codex and
 * Claude Code deliver the same field names (hook_event_name, session_id,
 * turn_id, transcript_path, cwd, tool_name, tool_use_id, tool_input,
 * tool_response, prompt, source, reason, stop_hook_active); the runtime is
 * named by the caller because neither wire input names it.
 */
export function decodeAgentLifecycleEvent({ runtime, wire, expectedEvent }) {
  if (!AGENT_RUNTIMES.includes(runtime)) return refuse("runtime-unsupported", `no lifecycle decoding for runtime '${runtime}'`, { runtime });
  if (wire === null || typeof wire !== "object" || Array.isArray(wire)) return refuse("wire-not-admitted", "hook input must be one JSON object");
  const event = string(wire.hook_event_name);
  if (!LIFECYCLE_EVENTS.includes(event)) return refuse("event-unsupported", `hook input names an unsupported event '${wire.hook_event_name}'`, { event: wire.hook_event_name });
  if (expectedEvent !== undefined && expectedEvent !== event) return refuse("event-mismatch", `hook was wired for ${expectedEvent} but received ${event}`, { expected: expectedEvent, received: event });
  const session = { id: string(wire.session_id) ?? "unknown" };
  for (const [key, field] of [["turnId", "turn_id"], ["transcriptPath", "transcript_path"], ["cwd", "cwd"], ["permissionMode", "permission_mode"]]) {
    const value = string(wire[field]);
    if (value !== undefined) session[key] = value;
  }
  const record = { kind: "agent-lifecycle-event", version: 1, runtime, event, session, native: wire };
  const toolName = string(wire.tool_name);
  if (toolName !== undefined) {
    record.tool = { name: toolName, input: wire.tool_input ?? {} };
    const useId = string(wire.tool_use_id);
    if (useId !== undefined) record.tool.useId = useId;
    if (wire.tool_response !== undefined) record.tool.response = wire.tool_response;
  }
  if (typeof wire.prompt === "string") record.prompt = wire.prompt;
  const source = string(wire.source);
  if (source !== undefined) record.source = source;
  const reason = string(wire.reason);
  if (reason !== undefined) record.reason = reason;
  if (typeof wire.stop_hook_active === "boolean") record.stopHookActive = wire.stop_hook_active;
  return admitAgentLifecycleEvent(record);
}

/** The shell command text of a Bash-class tool event, wherever the runtime's tool input names it; empty when there is none. */
export function commandTextOf(event) {
  const input = event?.tool?.input;
  if (typeof input === "string") return input;
  if (typeof input?.command === "string") return input.command;
  if (typeof input?.cmd === "string") return input.cmd;
  return "";
}

/** The file path a Write or Edit class tool event targets, or undefined. */
export function filePathOf(event) {
  const input = event?.tool?.input;
  return typeof input?.file_path === "string" && input.file_path.length > 0 ? input.file_path : undefined;
}
