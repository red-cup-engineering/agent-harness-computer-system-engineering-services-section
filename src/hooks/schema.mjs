
import { schemaFrom } from "@red-cup-engineering/json-schema-services-section/contracts";

const jsonValueSchema = {};
const nonemptyStringSchema = { type: "string", minLength: 1 };
const stringSequenceSchema = { type: "array", items: nonemptyStringSchema };

export const hookEnvelopeSchema = {
  $id: "metroplat/codecs/text/json/hook/envelope",
  title: "HookEnvelope",
  description: "A normalized Codex, Claude, or adjacent harness hook payload, preserving the original JSON payload.",
  type: "object",
  required: ["kind", "hookEventName", "harness", "payloadKeys", "payload"],
  properties: {
    kind: { const: "metroplat.hook.envelope" },
    hookEventName: nonemptyStringSchema,
    harness: nonemptyStringSchema,
    sessionId: nonemptyStringSchema,
    turnId: nonemptyStringSchema,
    transcriptPath: nonemptyStringSchema,
    cwd: nonemptyStringSchema,
    model: nonemptyStringSchema,
    reasoningEffort: nonemptyStringSchema,
    permissionMode: nonemptyStringSchema,
    toolName: nonemptyStringSchema,
    toolUseId: nonemptyStringSchema,
    payloadKeys: stringSequenceSchema,
    payload: jsonValueSchema,
  },
  additionalProperties: false,
};

export const hookAdmissionReportSchema = {
  $id: "metroplat/codecs/text/json/hook/admission-report",
  title: "HookAdmissionReport",
  description: "A non-throwing report for hook payloads that do not inhabit the hook-envelope schema.",
  type: "object",
  required: ["kind", "ok", "errors"],
  properties: {
    kind: { const: "metroplat.hook.admission-report" },
    ok: { const: false },
    errors: stringSequenceSchema,
    payloadType: { type: "string" },
  },
  additionalProperties: false,
};

export const hookAdmissionResultSchema = {
  $id: "metroplat/codecs/text/json/hook/admission-result",
  title: "HookAdmissionResult",
  description: "The result of admitting a hook payload: either a hook envelope or a non-throwing report.",
  anyOf: [hookEnvelopeSchema, hookAdmissionReportSchema],
};

export const hookEnvelopeContract = schemaFrom(hookEnvelopeSchema);
export const hookAdmissionReportContract = schemaFrom(hookAdmissionReportSchema);
export const hookAdmissionResultContract = schemaFrom(hookAdmissionResultSchema);

/**
 * Claude Code's own hook-event vocabulary — the two `hookEventName` values
 * that mark one turn's start and end, and the two that mark a session's own
 * start and end. Codex and other harnesses use different event names; a
 * caller reading another harness's hooks supplies its own vocabulary rather
 * than reusing these. Consumed by `core/closure/analysis/run-causal-set` and
 * `core/closure/analysis/session-presence`, which know no harness's event
 * names themselves.
 */
export const CLAUDE_CODE_TURN_VOCABULARY = Object.freeze({ opensTurn: "UserPromptSubmit", closesTurn: "Stop" });
export const CLAUDE_CODE_PRESENCE_VOCABULARY = Object.freeze({ opensPresence: "SessionStart", closesPresence: "SessionEnd" });
