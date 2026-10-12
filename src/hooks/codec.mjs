import { requireJsonValue } from "@red-cup-engineering/json-services-section";
import {
  hookAdmissionReportContract,
  hookEnvelopeContract,

} from "./schema.mjs";

function asRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value
    : undefined;
}

function stringField(record, ...keys) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim() !== "") return value.trim();
  }
  return undefined;
}

function valueType(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

function inferHarness(record) {
  const declared = stringField(record, "harness", "agent", "client", "surface");
  if (declared !== undefined) return declared;
  // No declaration: project the harness from transcript-path evidence already
  // retained in the payload. Claude Code writes transcripts under ~/.claude
  // and Codex under ~/.codex; the payload stays admitted verbatim, so this
  // inference is re-derivable and "unknown-harness" remains the honest
  // no-evidence value rather than a manufactured certainty.
  const transcriptPath = stringField(record, "transcript_path", "transcriptPath");
  if (transcriptPath !== undefined) {
    if (transcriptPath.includes("/.claude/")) return "claude-code";
    if (transcriptPath.includes("/.codex/")) return "codex";
  }
  return "unknown-harness";
}

/** Admit one Codex/Claude hook payload without interpreting the event semantics. */
export function admitHookEnvelope(input, { harness } = {}) {
  const value = requireJsonValue(input, "hook envelope payload");
  const record = asRecord(value);
  if (record === undefined) {
    return hookAdmissionReportContract.assert(Object.freeze({
      kind: "metroplat.hook.admission-report",
      ok: false,
      errors: Object.freeze(["hook envelope payload: expected a JSON object"]),
      payloadType: valueType(value),
    }), "hook admission report");
  }

  const hookEventName = stringField(record, "hook_event_name", "hookEventName");
  if (hookEventName === undefined) {
    return hookAdmissionReportContract.assert(Object.freeze({
      kind: "metroplat.hook.admission-report",
      ok: false,
      errors: Object.freeze(["hook envelope payload: expected hook_event_name or hookEventName"]),
      payloadType: "object",
    }), "hook admission report");
  }

  const sessionId = stringField(record, "session_id", "sessionId", "session");
  const turnId = stringField(record, "turn_id", "turnId");
  const transcriptPath = stringField(record, "transcript_path", "transcriptPath");
  const cwd = stringField(record, "cwd");
  const model = stringField(record, "model");
  const reasoningEffort = stringField(record, "reasoning_effort", "reasoningEffort", "effort");
  const permissionMode = stringField(record, "permission_mode", "permissionMode");
  const toolName = stringField(record, "tool_name", "toolName", "tool");
  const toolUseId = stringField(record, "tool_use_id", "toolUseId");
  const envelope = Object.freeze({
    kind: "metroplat.hook.envelope",
    hookEventName,
    harness: harness ?? inferHarness(record),
    ...(sessionId === undefined ? {} : { sessionId }),
    ...(turnId === undefined ? {} : { turnId }),
    ...(transcriptPath === undefined ? {} : { transcriptPath }),
    ...(cwd === undefined ? {} : { cwd }),
    ...(model === undefined ? {} : { model }),
    ...(reasoningEffort === undefined ? {} : { reasoningEffort }),
    ...(permissionMode === undefined ? {} : { permissionMode }),
    ...(toolName === undefined ? {} : { toolName }),
    ...(toolUseId === undefined ? {} : { toolUseId }),
    payloadKeys: Object.freeze(Object.keys(record)),
    payload: value,
  });
  return hookEnvelopeContract.assert(envelope, "hook envelope");
}

export function isHookEnvelope(value) {
  return value.kind === "metroplat.hook.envelope";
}
