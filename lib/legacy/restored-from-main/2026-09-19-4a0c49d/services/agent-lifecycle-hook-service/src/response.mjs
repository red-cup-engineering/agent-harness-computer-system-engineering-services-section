import { canonical } from "@red-cup-engineering/computer-data-engine/json";
import { AGENT_RUNTIMES, accept, admitAgentLifecycleEvent, admitAgentLifecycleResponse, refuse } from "./types.mjs";

/**
 * Encode one AgentLifecycleResponse for the runtime that delivered the event:
 * the JSON the runtime reads on stdout, the text it reads on stderr, and the
 * process exit code. Codex and Claude Code share one wire shape: exit 2 with
 * stderr blocks; hookSpecificOutput carries context and permission rulings.
 */
export function encodeAgentLifecycleResponse({ event, response }) {
  const admittedEvent = admitAgentLifecycleEvent(event);
  if (!admittedEvent.ok) return admittedEvent;
  const admittedResponse = admitAgentLifecycleResponse(response);
  if (!admittedResponse.ok) return admittedResponse;
  if (!AGENT_RUNTIMES.includes(event.runtime)) return refuse("runtime-unsupported", `no lifecycle encoding for runtime '${event.runtime}'`, { runtime: event.runtime });
  if (response.disposition === "block") {
    return accept(Object.freeze({ stdout: "", stderr: `${response.reason ?? "blocked by hook"}\n`, exitCode: 2 }));
  }
  const wire = {};
  const specific = { hookEventName: event.event };
  if (response.systemMessage !== undefined) wire.systemMessage = response.systemMessage;
  if (response.additionalContext !== undefined) specific.additionalContext = response.additionalContext;
  if (response.permission !== undefined) {
    specific.permissionDecision = response.permission.decision;
    if (response.permission.reason !== undefined) specific.permissionDecisionReason = response.permission.reason;
  }
  if (response.updatedInput !== undefined) specific.updatedInput = response.updatedInput;
  if (Object.keys(specific).length > 1) wire.hookSpecificOutput = specific;
  return accept(Object.freeze({ stdout: `${canonical(wire)}\n`, stderr: "", exitCode: 0 }));
}
