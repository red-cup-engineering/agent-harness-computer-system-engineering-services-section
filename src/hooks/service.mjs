/**
 * Service binding for harness hook-event admission.
 *
 * The codec normalizes Codex/Claude-style hook JSON without interpreting the
 * event. This service owns the filesystem append into data/logs.
 */
import path from "node:path";
import { sha256Hex } from "@red-cup-engineering/cryptographic-computer-data-engineering-services-section/integrity";
import { operation } from "@red-cup-engineering/computer-system-engine/rpc/operation";
import { schemaFrom } from "@red-cup-engineering/json-schema-services-section/contracts";

import { admitHookEnvelope, isHookEnvelope } from "@red-cup-engineering/agent-harness-computer-system-engineering-services-section/hooks/codec";

import { transportCloudEvent } from "@red-cup-engineering/computer-system-engine/rpc/arrival";
import { } from "@red-cup-engineering/json-services-section";
import { extend, get, put, readHead } from "@red-cup-engineering/semiotic-eavt-services-section/store";
import { semanticId } from "@red-cup-engineering/computer-content-address-engineering-services-section/semiotic-content-address";
import { appendServiceLog } from "@red-cup-engineering/computer-systems-logging-engine/append-service-log";
import { appendArrivalAtRoot } from "@red-cup-engineering/computer-system-engine/rpc/arrival-store";

import { agentSessionTokenUsageStatementRows } from "@red-cup-engineering/computer-inference-engine/cost/token-usage/persistence";
import { claudeSessionTokenUsageOfContent } from "@red-cup-engineering/computer-inference-engine/anthropic/token-usage";
import { codexSessionTokenUsageOfContent } from "@red-cup-engineering/feltos/agents/sessions/codex/token-usage";

const TOKEN_USAGE_CHECKPOINT_HOOKS = new Set(["Stop", "SessionEnd", "SubagentStop"]);
// A long main session's transcript runs to tens of megabytes, and those are the sessions that cost
// the most: a bound that skipped them would leave the monitor blind to most of the spend.
const DEFAULT_TOKEN_USAGE_TRANSCRIPT_MAX_BYTES = 128 * 1024 * 1024;

function asJsonRecord(value) {
  return value !== undefined && value !== null && typeof value === "object" && !Array.isArray(value)
    ? value
    : undefined;
}

function hookTranscriptProvider(envelope) {
  const transcriptPath = envelope.transcriptPath;
  if (envelope.harness === "claude-code" || transcriptPath?.includes("/.claude/") === true) return "anthropic";
  if (envelope.harness === "codex" || transcriptPath?.includes("/.codex/") === true) return "openai";
  return undefined;
}

function shouldAdmitTokenUsage(envelope) {
  return envelope.transcriptPath !== undefined
    && TOKEN_USAGE_CHECKPOINT_HOOKS.has(envelope.hookEventName)
    && hookTranscriptProvider(envelope) !== undefined;
}

/** The store types FeltOS reads token usage from (feltos agents/sessions/token-usage/service): a measured event is a record, a session's running total the head of its thread. */
const TOKEN_USAGE_EVENT_TYPE = "token-usage-event";
const SESSION_TOKEN_USAGE_TYPE = "session-token-usage";

/** A transcript's checkpoints are a thread named by the digest of its path, each record the last row admitted. */
const TOKEN_USAGE_CHECKPOINT_TYPE = "token-usage-checkpoint";
const checkpointName = (transcriptPath) => sha256Hex(transcriptPath);

/** The last row of a transcript its checkpoints admitted. */
function admittedTranscriptRow(root, transcriptPath) {
  const frontier = readHead(root, TOKEN_USAGE_CHECKPOINT_TYPE, checkpointName(transcriptPath))?.frontier ?? [];
  const rows = frontier.map((address) => get(root, TOKEN_USAGE_CHECKPOINT_TYPE, address)?.row).filter(Number.isFinite);
  return rows.length === 0 ? -Infinity : Math.max(...rows);
}

function tokenUsageTranscriptMaxBytes(options) {
  const value = options.tokenUsageTranscriptMaxBytes;
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.trunc(value)
    : DEFAULT_TOKEN_USAGE_TRANSCRIPT_MAX_BYTES;
}

function appendHookTranscriptTokenUsageAtRoot(
  root,
  envelope,
  at,
  options,
) {
  const provider = hookTranscriptProvider(envelope);
  if (provider === undefined || envelope.transcriptPath === undefined) return;
  // A subagent's requests are in its own transcript, which only its SubagentStop names.
  const agentTranscript = envelope.hookEventName === "SubagentStop" ? asJsonRecord(envelope.payload)?.agent_transcript_path : undefined;
  const transcriptPath = path.resolve(typeof agentTranscript === "string" && agentTranscript !== "" ? agentTranscript : envelope.transcriptPath);
  const stat = options.statPathOrNull(transcriptPath);
  if (stat === null || !stat.isFile()) return;
  if (stat.size > tokenUsageTranscriptMaxBytes(options)) return;

  const content = options.readFileUtf8(transcriptPath);
  const summary = provider === "anthropic"
    ? claudeSessionTokenUsageOfContent(content, {
      source: transcriptPath,
      ...(envelope.sessionId === undefined ? {} : { sessionId: envelope.sessionId }),
    })
    : codexSessionTokenUsageOfContent(content, {
      source: transcriptPath,
      ...(envelope.sessionId === undefined ? {} : { sessionId: envelope.sessionId }),
    });
  if (summary.rawEvents.length === 0) return;
  const sessionId = summary.sessionId ?? envelope.sessionId ?? `${provider}-session`;
  // Every checkpoint of a session reads its whole transcript, but admits only the requests made
  // since the last one: re-admitting the transcript each turn would grow the feed with the square
  // of a session's length. The summary row stays whole, so the latest one is the session's total.
  const through = admittedTranscriptRow(root, transcriptPath);
  const fresh = summary.rawEvents.filter((event) => !(event.row <= through));
  if (fresh.length === 0) return;
  // Each measured event is the same record however often its transcript is admitted; the session's running total is the latest summary.
  const [summaryRow, ...eventRows] = agentSessionTokenUsageStatementRows({ ...summary, rawEventCount: summary.rawEvents.length, rawEvents: fresh }, at);
  for (const [e, a, v, t] of eventRows) put(root, TOKEN_USAGE_EVENT_TYPE, { e, a, v, t });
  const [e, a, v, t] = summaryRow;
  const latestAddress = readHead(root, SESSION_TOKEN_USAGE_TYPE, sessionId)?.frontier[0];
  const latest = latestAddress === undefined ? undefined : get(root, SESSION_TOKEN_USAGE_TYPE, latestAddress);
  if (latest === undefined || semanticId({ e: latest.e, a: latest.a, v: latest.v }) !== semanticId({ e, a, v })) extend(root, SESSION_TOKEN_USAGE_TYPE, sessionId, { e, a, v, t });
  extend(root, TOKEN_USAGE_CHECKPOINT_TYPE, checkpointName(transcriptPath), { at, transcriptPath, session: sessionId, row: Math.max(through, ...fresh.map((event) => event.row).filter(Number.isFinite)) });
}

/** Append one normalized hook envelope under `$root/data/logs/**` (the hook-event service log and the arrival store). `options.at` (ISO
 *  date-time) is the instant the caller has already read at the kernel edge; when
 *  `options.admitTokenUsage` is true, `options.statPathOrNull`/`options.readFileUtf8` (the same
 *  filesystem effects `defaultFilesystemBinding` bundles onto a binding) are also required, to
 *  read the hook's own transcript file. */
export function appendHookEventAtRoot(
  root,
  input,
  options = {},
) {
  const admission = admitHookEnvelope(input, { harness: options.harness });
  if (!isHookEnvelope(admission)) return admission;
  const at = options.at;
  const event = transportCloudEvent("agent-hook", Object.freeze({
    kind: "metroplat.hook.arrival-material",
    envelope: admission,
  }), at, Object.freeze({
    kind: "metroplat.generated-endpoint-readout-reference",
    transport: "agent-hook",
    path: options.harness !== undefined ? "rpc:harness-hook-event-admit" : admission.harness === "claude-code" ? ".claude/settings.local.json#hooks" : ".codex/hooks",
    verb: admission.hookEventName,
  }));
  // One service-log line per hook event: the session it came in (entity), the event (attribute), who sent it and what it touched (value).
  appendServiceLog({
    root,
    service: "hook-event",
    at,
    entry: {
      subject: "hook-event",
      entity: admission.sessionId ?? "no-session",
      attribute: admission.hookEventName,
      value: { harness: admission.harness, ...(admission.turnId === undefined ? {} : { turn: admission.turnId }), ...(admission.toolName === undefined ? {} : { tool: admission.toolName }) },
      time: at,
    },
  });
  const receipt = appendArrivalAtRoot(root, event, {
    ...options,
    at,
    rootName: options.rootName ?? "@red-cup-engineering/metroplat",
    subject: options.subject ?? "arrival",
  });
  if (options.admitTokenUsage === true && shouldAdmitTokenUsage(admission)) {
    try {
      appendHookTranscriptTokenUsageAtRoot(root, admission, at, options);
    } catch {
      // Hook admission is the primary live path and must not fail just because
      // a concurrently-written transcript cannot be read at this checkpoint.
    }
  }
  return receipt;
}

const hookEventAdmissionInput = schemaFrom({
  $id: "agent-harness/harness-hook-event-admit/input",
  title: "HarnessHookEventAdmission",
  type: "object",
  required: ["harness", "payload"],
  properties: {
    harness: { type: "string", minLength: 1 },
    payload: { type: "object" },
  },
  additionalProperties: false,
});

/**
 * One node operation for one harness utterance. The host owns recognition of its
 * harness character and participation effects; this service owns the sole hook
 * envelope/arrival admission path. Recognition happens before any journal write.
 */
export function harnessHookEventAdmissionOperation({ binding, recognize, participate }) {
  if (typeof recognize !== "function" || typeof participate !== "function") {
    throw new TypeError("harness hook admission requires host recognition and participation");
  }
  return operation({
    verb: "harness-hook-event-admit",
    inputFormat: "json",
    outputFormat: "json",
    summary: "Admit one event from the authenticated caller's harness session into this node.",
    description: "A named harness acts as its durable character. An authenticated account with a recognized office can participate with harness=mcp and its actual client session id; this does not attest an inference model. SessionStart admits participation and returns office and skill context; SessionEnd withdraws participation.",
    domain: hookEventAdmissionInput,
    effects: { class: "journal-write", replay: "idempotency-key", coordination: "coordination-free", deterministic: true, totality: "schema-bounded" },
    run: (input, _args, context) => {
      const subject = context?.invocation?.subject ?? "anonymous";
      const participant = recognize({ harness: input.harness, payload: input.payload, subject });
      const at = binding.now();
      const session = typeof input.payload.session_id === "string" ? input.payload.session_id : undefined;
      // A session's checkpoints (Stop, SubagentStop, SessionEnd) also admit its token usage from its
      // transcript whenever the node's binding can read one: the harness's own events are the monitor.
      const transcripts = typeof binding.statPathOrNull === "function" && typeof binding.readFileUtf8 === "function";
      appendHookEventAtRoot(binding.dataRoot, input.payload, {
        at,
        harness: input.harness,
        rootName: "@red-cup-engineering/metroplat",
        ...(transcripts && input.harness !== "mcp" ? { admitTokenUsage: true, statPathOrNull: binding.statPathOrNull, readFileUtf8: binding.readFileUtf8 } : {}),
        caller: Object.freeze({
          transport: "agent-hook-operation",
          actor: subject,
          ...(session === undefined ? {} : { session }),
        }),
      });
      return participate({ harness: input.harness, payload: input.payload, subject, participant, at }) ?? Object.freeze({});
    },
  });
}
