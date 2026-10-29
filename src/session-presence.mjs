/**
 * Service binding for the session-presence read.
 *
 * Reads a data root's already-admitted `admit-arrival` feed for one day
 * and folds it, per session, into presence measurements — the SAME log and the
 * SAME arrival-to-`RunObservation` reduction `integrations/filesystem/services/run-causal-set` already
 * owns, reused here rather than duplicated. Pure derivation lives in
 * `core/closure/analysis/session-presence`, which knows no harness's own event
 * names; this module owns the filesystem read and supplying Claude Code's own
 * presence vocabulary (`CLAUDE_CODE_PRESENCE_VOCABULARY`, from `../../hooks`).
 */
import { hookRunObservationsOfArrivalLog } from "./run-causal-set.mjs";
import { operation } from "@red-cup-engineering/computer-system-engine/rpc/operation";

import {
  sessionPresenceMeasurements,
  orderPresenceMeasurements,
  DEFAULT_STALE_AFTER_SECONDS,

} from "@red-cup-engineering/organizing/agency/session-presence";
import { CLAUDE_CODE_PRESENCE_VOCABULARY } from "@red-cup-engineering/agent-harness-computer-system-engineering-services-section/hooks/schema";

/** The date the `SessionEnd` hook was wired into `.claude/settings.json`.
 *  Every session admitted before this date can never reach `settled` in the
 *  session-presence read — deshrouded there is expected, not evidence of a
 *  crash, and every settlement that surfaces presence says so honestly. */
const SESSION_END_WIRED_SINCE = "2026-07-04";

  

/**
 * Read one day's `admit-arrival` feed under a data root and fold it into
 * per-session presence measurements. `asOf` is required (not defaulted to the
 * process clock here) so a caller — the `session-presence` cut deriver, or a
 * test fixture — controls its own reproducibility.
 */
export function readSessionPresence(
  root,
  date,
  asOf,
  options = {},
) {
  const { rows, observations } = hookRunObservationsOfArrivalLog(root, date, options);
  const staleAfterSeconds = options.staleAfterSeconds ?? DEFAULT_STALE_AFTER_SECONDS;
  const measurements = orderPresenceMeasurements(sessionPresenceMeasurements(observations, asOf, CLAUDE_CODE_PRESENCE_VOCABULARY), staleAfterSeconds);
  return Object.freeze({
    kind: "metroplat.run.session-presence-read",
    root,
    date,
    asOf,
    staleAfterSeconds,
    rows,
    measurements,
  });
}

function operationDate(binding, input) {
  if (input !== null && typeof input === "object" && !Array.isArray(input)) {
    const date = (input)["date"];
    if (typeof date === "string" && date.length > 0) return date;
  }
  return binding.now().slice(0, 10);
}

export function sessionPresenceReadout(
  binding,
  date,
) {
  const asOf = binding.now();
  const read = readSessionPresence(binding.dataRoot, date, asOf, binding);
  if (read.rows === 0) return undefined;
  const sessions = read.measurements.map((reading) => Object.freeze({
    session: reading.session,
    state: reading.state,
    ...(reading.openedAt === undefined ? {} : { openedAt: reading.openedAt }),
    lastEventAt: reading.lastEventAt,
    idleSeconds: reading.idleSeconds,
    eventCounts: reading.eventCounts,
    transcriptSettlement: `claude-session-${reading.session}`,
  }));
  const settled = read.measurements.filter((reading) => reading.state === "settled").length;
  return Object.freeze({
    kind: "metroplat.holography.session-presence-settlement",
    date,
    asOf: read.asOf,
    staleAfterSeconds: read.staleAfterSeconds,
    sessions: Object.freeze(sessions),
    totals: Object.freeze({ sessions: sessions.length, deshrouded: sessions.length - settled, settled }),
    sessionEndWiredSince: SESSION_END_WIRED_SINCE,
    note: date < SESSION_END_WIRED_SINCE
      ? `SessionEnd was not yet wired on ${date} — every session here is deshrouded forever, never evidence of a crash.`
      : `Sessions admitted before ${SESSION_END_WIRED_SINCE} (when SessionEnd was wired) can never reach "settled"; only sessions started on or after that date settle properly.`,
  });
}

export function sessionPresenceOperations(binding) {
  return Object.freeze([
    operation({
      verb: "session-presence",
      inputFormat: "json",
      outputFormat: "json",
      summary: "Read the day's recorded session presence diamonds.",
      description: "Domain: { date? }. Folds the shared admit-arrival feed into per-session presence measurements.",
      run: (input) => sessionPresenceReadout(binding, operationDate(binding, input)) ?? null,
    }),
  ]);
}
