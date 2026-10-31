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
import { nativeTranscriptFingerprint as transcriptFingerprint, sameNativeTranscript as sameTranscript } from "../transcripts/native-tool-observation.mjs";

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
function transcriptCheckpoints(root, transcriptPath) {
  const frontier = readHead(root, TOKEN_USAGE_CHECKPOINT_TYPE, checkpointName(transcriptPath))?.frontier ?? [];
  return frontier.map((address) => get(root, TOKEN_USAGE_CHECKPOINT_TYPE, address));
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

  const checkpoints = transcriptCheckpoints(root, transcriptPath);
  const fingerprint = transcriptFingerprint(stat);
  if (checkpoints.length > 0 && checkpoints.every((entry) => entry?.provider === provider
    && entry.harnessSession === (envelope.sessionId ?? null) && sameTranscript(fingerprint, entry.transcript))) return;

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
  const sessionId = summary.sessionId ?? envelope.sessionId ?? `${provider}-session`;
  // Growth alone does not prove append-only input: a writer can rewrite earlier
  // usage and grow the same inode. Reuse a frontier only when the measured
  // prefix is identical and belongs to this provider and harness session.
  const reusable = checkpoints.length > 0 && checkpoints.every(entry =>
    entry?.provider === provider && entry.harnessSession === (envelope.sessionId ?? null)
    && Number.isFinite(entry.row) && entry.eventPrefix === semanticId(summary.rawEvents.filter(event => event.row <= entry.row)));
  const through = reusable ? Math.max(...checkpoints.map(entry => entry.row)) : -Infinity;
  const fresh = summary.rawEvents.filter((event) => !(event.row <= through));
  // Mark only a stable, complete read as reusable. A concurrent append keeps
  // its existing row frontier but never stamps unread bytes as accounted.
  const after = transcriptFingerprint(options.statPathOrNull(transcriptPath));
  const stable = sameTranscript(fingerprint, after) && Buffer.byteLength(content) === stat.size;
  const row = Math.max(through, ...fresh.map((event) => event.row).filter(Number.isFinite));
  const checkpoint = () => extend(root, TOKEN_USAGE_CHECKPOINT_TYPE, checkpointName(transcriptPath), {
    at, transcriptPath, provider, harnessSession: envelope.sessionId ?? null, session: sessionId, eventPrefix: semanticId(summary.rawEvents), ...(Number.isFinite(row) ? { row } : {}),
    ...(stable ? { transcript: fingerprint } : {}),
  });
  // Each measured event is the same record however often its transcript is admitted; the session's running total is the latest summary.
  const [summaryRow, ...eventRows] = agentSessionTokenUsageStatementRows({ ...summary, rawEventCount: summary.rawEvents.length, rawEvents: fresh }, at);
  for (const [e, a, v, t] of eventRows) put(root, TOKEN_USAGE_EVENT_TYPE, { e, a, v, t });
  const [e, a, v, t] = summaryRow;
  const latestAddress = readHead(root, SESSION_TOKEN_USAGE_TYPE, sessionId)?.frontier[0];
  const latest = latestAddress === undefined ? undefined : get(root, SESSION_TOKEN_USAGE_TYPE, latestAddress);
  if (latest === undefined || semanticId({ e: latest.e, a: latest.a, v: latest.v }) !== semanticId({ e, a, v })) extend(root, SESSION_TOKEN_USAGE_TYPE, sessionId, { e, a, v, t });
  checkpoint();
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
 * Keep partial hook telemetry distinct from participation in the World.
 *
 * appendHookEventAtRoot deliberately returns a nonthrowing admission report for
 * malformed telemetry; its caller must not turn that report into an authenticated
 * SessionStart/SessionEnd, or execute recognition/participation after refusal.
 * The host still owns authentication, office rights and binding the supplied
 * session token to its actual client — this shape check grants none of those.
 */
export function requireParticipationHook(input) {
  const admitted = admitHookEnvelope(input.payload, { harness: input.harness });
  if (!isHookEnvelope(admitted)) {
    throw new TypeError("harness-hook-event-admit: hook envelope refused before participation");
  }
  if (admitted.sessionId === undefined) {
    throw new TypeError("harness-hook-event-admit: original source session id required before participation");
  }
  if (Buffer.byteLength(admitted.sessionId, "utf8") > 512) {
    throw new TypeError("harness-hook-event-admit: source session id exceeds 512 bytes");
  }
  return admitted;
}

/** Refuse to participate when the original arrival writer has not returned a
 * complete admitted receipt. A nonthrowing refusal is not a held session.
 * This checks only the source-owned arrival result, not the issuer's rights. */
export function requireSuccessfulHookArrival(receipt) {
  if (receipt?.kind !== "system.arrival.receipt" || receipt.ok !== true
      || !Array.isArray(receipt.obstructions) || receipt.obstructions.length !== 0
      || typeof receipt.admission?.address !== "string" || !receipt.admission.address.trim()) {
    throw new TypeError("harness-hook-event-admit: original arrival was not admitted before participation");
  }
  return receipt;
}

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
      // Refuse malformed/missing-session input before host recognition or any journal/Body effect.
      const admitted = requireParticipationHook(input);
      const subject = context?.invocation?.subject ?? "anonymous";
      const participant = recognize({ harness: input.harness, payload: input.payload, subject });
      const at = binding.now();
      const session = admitted.sessionId;
      // A session's checkpoints (Stop, SubagentStop, SessionEnd) also admit its token usage from its
      // transcript whenever the node's binding can read one: the harness's own events are the monitor.
      const transcripts = typeof binding.statPathOrNull === "function" && typeof binding.readFileUtf8 === "function";
      const arrival = appendHookEventAtRoot(binding.dataRoot, input.payload, {
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
      requireSuccessfulHookArrival(arrival);
      return participate({ harness: input.harness, payload: input.payload, subject, participant, at }) ?? Object.freeze({});
    },
  });
}
