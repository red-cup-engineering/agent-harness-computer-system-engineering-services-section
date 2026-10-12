import { observeSessionWindow, sha256Hex } from "@red-cup-engineering/session-transcript-dialects/shared";
import { deriveCborNi } from "@red-cup-engineering/computer-data-engine/identity";

const COLONY_ACTOR = "urn:ame:bare-cedar-fog-colony";
const ZERO_TALLY = Object.freeze({ completedTurns: 0, toolInvocations: 0, patchInvocations: 0, webInvocations: 0, userMessages: 0, compactions: 0 });
const BASE_UNSUPPORTED_DOMAINS = Object.freeze(["formations", "contracts", "a2a", "activity-streams", "git-io", "evm", "economy", "deployments"]);

function addTally(total, increment) {
  return {
    completedTurns: total.completedTurns + (increment.completedTurns ?? 0),
    toolInvocations: total.toolInvocations + (increment.toolInvocations ?? 0),
    patchInvocations: total.patchInvocations + (increment.patchInvocations ?? 0),
    webInvocations: total.webInvocations + (increment.webInvocations ?? 0),
    userMessages: total.userMessages + (increment.userMessages ?? 0),
    compactions: total.compactions + (increment.compactions ?? 0),
  };
}

/**
 * Collect a privacy-bounded, exact-interval civic activity pulse for one
 * session-transcript dialect. The dialect is an explicit function argument
 * (claudeSessionTranscriptDialect, codexSessionTranscriptDialect, ... from
 * `@red-cup-engineering/session-transcript-dialects`) — never detected from
 * the ambient harness. This is the shared skeleton (windowed row scan,
 * evidence hashing, sort, envelope assembly) that both Claude's and Codex's
 * formerly-separate collectors carried nearly verbatim; the parts that
 * genuinely differ per provider — which row shapes count as a completed
 * turn, a patch, a web search, or a context compaction, and the
 * human-readable vocabulary for each — stay on the dialect itself
 * (`activityTally`, `properNoun`, `supportsOperationsDomain`,
 * `activityDisplayOrderBase`), because a Claude transcript and a Codex
 * transcript disagree about what those even look like on disk.
 *
 * @param {object} dialect
 * @param {{window: {fromExclusive: string, toInclusive: string}, recordedAt?: string, sessionRoot?: string}} options
 * @returns {Promise<object>} a ColonyActivityPulseEnvelope
 */
export async function collectColonyActivity(dialect, { window, recordedAt, sessionRoot } = {}) {
  const selected = [];
  let tally = ZERO_TALLY;
  const scanned = observeSessionWindow(dialect, { window, sessionRoot, label: `${dialect.properNoun} session pulse`, visit(row) {
      selected.push(dialect.safeMetadata(row));
      tally = addTally(tally, dialect.activityTally(row));
  } });
  selected.sort((left, right) => String(left.timestamp).localeCompare(String(right.timestamp)) || JSON.stringify(left).localeCompare(JSON.stringify(right)));
  const evidence = `${dialect.providerId}:evidence:selected-metadata:sha256:${sha256Hex(JSON.stringify(selected))}`;
  const occurredAt = selected.at(-1)?.timestamp ?? window.toInclusive;
  const base = dialect.activityDisplayOrderBase;
  const events = [];

  const countableWork = tally.completedTurns + tally.toolInvocations + tally.patchInvocations + tally.webInvocations;
  if (countableWork > 0) {
    events.push({
      id: deriveCborNi({ value: { domain: "work", fromExclusive: window.fromExclusive, toInclusive: window.toInclusive, evidence } }).uri,
      occurredAt, domain: "work", kind: `interactive-${dialect.properNoun.toLowerCase()}-work-observed`,
      summary: `${scanned.activeFiles.size} ${dialect.properNoun} sessions recorded ${tally.completedTurns} completed turns, ${tally.toolInvocations} tool invocations, ${tally.patchInvocations} patch-tool invocations, and ${tally.webInvocations} web-search invocations. These are activity observations, not proof that intended outcomes succeeded.`,
      outcome: "observed",
      quantities: [
        { label: `${dialect.properNoun} sessions active`, amount: String(scanned.activeFiles.size), unit: "sessions", displayOrder: base },
        { label: `${dialect.properNoun} turns completed`, amount: String(tally.completedTurns), unit: "turns", displayOrder: base + 1 },
        { label: `${dialect.properNoun} tool invocations`, amount: String(tally.toolInvocations), unit: "invocations", displayOrder: base + 2 },
        { label: `${dialect.properNoun} patch-tool invocations`, amount: String(tally.patchInvocations), unit: "invocations", displayOrder: base + 3 },
        { label: `${dialect.properNoun} web-search invocations`, amount: String(tally.webInvocations), unit: "invocations", displayOrder: base + 4 },
      ],
      evidence: [evidence],
    });
  }
  if (tally.userMessages > 0) {
    events.push({
      id: deriveCborNi({ value: { domain: "politics", fromExclusive: window.fromExclusive, toInclusive: window.toInclusive, evidence } }).uri,
      occurredAt, domain: "politics", kind: "leader-user-participation-observed",
      summary: `${tally.userMessages} Leader/user messages were observed in ${dialect.properNoun} sessions; they are not automatically classified as directions, grants, awards, approvals, or executions.`,
      outcome: "observed",
      quantities: [{ label: "Leader user messages observed", amount: String(tally.userMessages), unit: "messages", displayOrder: base + 10 }],
      evidence: [evidence],
    });
  }
  // Only a dialect whose transcripts carry a genuine context-compaction (or
  // equivalent runtime) signal ever reaches this branch — Claude's does not
  // (see claude-dialect.mjs's activityTally), and inventing one here would
  // be exactly the substitution this office exists to refuse rather than
  // commit, so supportsOperationsDomain gates it explicitly rather than
  // relying on tally.compactions happening to stay zero.
  if (dialect.supportsOperationsDomain && tally.compactions > 0) {
    events.push({
      id: deriveCborNi({ value: { domain: "operations", fromExclusive: window.fromExclusive, toInclusive: window.toInclusive, evidence } }).uri,
      occurredAt, domain: "operations", kind: "interactive-session-runtime-observed",
      summary: `${tally.compactions} ${dialect.properNoun} context compactions occurred while ${scanned.activeFiles.size} sessions were active.`,
      outcome: "observed",
      quantities: [{ label: `${dialect.properNoun} context compactions`, amount: String(tally.compactions), unit: "compactions", displayOrder: base + 20 }],
      evidence: [evidence],
    });
  }

  const refusals = [{
    domain: "work",
    reason: `This privacy-bounded metadata contract cannot classify Leader corrections, intent satisfaction, recurrent work classes,${dialect.supportsOperationsDomain ? "" : " session compaction,"} or promotion into durable services; those require provider-authored outcome records.`,
    evidence: [evidence],
  }];
  if (scanned.malformedRows) refusals.push({ domain: "operations", reason: `${scanned.malformedRows} malformed transcript rows were excluded rather than guessed.`, evidence: [evidence] });

  return {
    type: "ColonyActivityPulseEnvelope",
    providerActor: dialect.providerCells.pulse,
    settlementActor: dialect.actorUrn,
    colonyActor: COLONY_ACTOR,
    window, recordedAt, events, stocks: [],
    unsupportedDomains: dialect.supportsOperationsDomain ? BASE_UNSUPPORTED_DOMAINS : [...BASE_UNSUPPORTED_DOMAINS, "operations"],
    refusals,
  };
}
