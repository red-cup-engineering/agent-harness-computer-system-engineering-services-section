import { observeSessionWindow, sha256Digest } from "@red-cup-engineering/session-transcript-dialects/shared";

function observation(dialect, providerCell, row, call, sessionDigest) {
  return Object.freeze({
    type: dialect.recordTypes.toolObservation,
    version: 1,
    occurredAt: dialect.rowTimestamp(row),
    sessionDigest,
    inferenceProcess: {
      kind: dialect.inferenceProcessKind,
      address: `urn:sha256:${sessionDigest.slice("sha256:".length)}`,
      authority: "inference-only",
    },
    providerCell,
    requestedTool: { transport: call.transport, name: call.name },
    invocation: {
      callDigest: call.callId === null ? null : sha256Digest(call.callId),
      // A dialect whose toolCallsOf reports a native run status (Codex)
      // carries it through as-is; one that doesn't (Claude — a tool_use
      // block has no status field of its own) falls back to "requested",
      // since a transcript row only ever records that the tool was asked
      // for, never confirmed run.
      runtimeStatus: call.status ?? "requested",
    },
    actuator: {
      status: "not-bound-by-transcript-observation",
      reason: "A transcript records an inference request to a tool. It proves neither execution nor an admitted capability, authority grant, external effect, restricted move, or successful outcome.",
    },
    disclosure: {
      transcriptText: false,
      reasoning: false,
      toolArguments: false,
      toolOutput: false,
      fileContents: false,
    },
  });
}

/**
 * Observe one dialect's tool requests as metadata-only carriers. The
 * dialect is an explicit function argument, never detected from the
 * ambient harness. A transcript row may carry zero, one, or several tool
 * calls — the dialect's own `toolCallsOf` decides how many — and each
 * becomes one observation. This operation reads no arguments or results
 * and executes nothing.
 *
 * @param {object} dialect
 * @param {{window: {fromExclusive: string, toInclusive: string}, recordedAt?: string, sessionRoot?: string}} options
 * @returns {Promise<object>}
 */
export async function observeToolInvocations(dialect, { window, recordedAt, sessionRoot } = {}) {
  const providerCell = dialect.providerCells.toolObservation;
  const observations = [], evidence = [], malformed = new Set(), selected = new Map();
  const scanned = observeSessionWindow(dialect, { window, sessionRoot, label: `${dialect.properNoun} tool observation`, visit(row, path) {
      const sessionDigest = sha256Digest(path);
      for (const call of dialect.toolCallsOf(row)) {
        observations.push(observation(dialect, providerCell, row, call, sessionDigest));
        selected.set(sessionDigest, (selected.get(sessionDigest) ?? 0) + 1);
      }
  } });
  if (scanned.malformedRows) for (const path of scanned.files) malformed.add(sha256Digest(path));
  for (const [sessionDigest, count] of selected) evidence.push({ sessionDigest, observations: count });
  observations.sort((left, right) => left.occurredAt.localeCompare(right.occurredAt) || JSON.stringify(left.requestedTool).localeCompare(JSON.stringify(right.requestedTool)) || String(left.invocation.callDigest).localeCompare(String(right.invocation.callDigest)));
  return Object.freeze({
    type: dialect.recordTypes.toolObservationReceipt,
    version: 1,
    disposition: "observed",
    providerCell,
    operation: "observe-tool-invocations",
    recordedAt: typeof recordedAt === "string" ? recordedAt : window.toInclusive,
    window: { fromExclusive: window.fromExclusive, toInclusive: window.toInclusive },
    observations,
    evidence: evidence.sort((left, right) => left.sessionDigest.localeCompare(right.sessionDigest)),
    refusals: malformed.size === 0 ? [] : [{ code: "malformed-transcript-row-excluded", sessionDigests: [...malformed].sort() }],
    authority: {
      observation: true,
      execution: false,
      restrictedMove: false,
      actuatorBinding: false,
      outcomeAssertion: false,
    },
  });
}
