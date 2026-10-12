/**
 * Service binding for the run-space's sequencing order.
 *
 * Reads a data root's already-admitted `arrival` records for one day
 * and derives that day's turn diamonds and their sequencing causal set. Pure
 * derivation lives in `core/closure/analysis/run-causal-set`, which knows no
 * harness's own event names; this module owns the filesystem read, the
 * EAVT-to-`RunObservation` reduction, and supplying Claude Code's own turn
 * vocabulary (`CLAUDE_CODE_TURN_VOCABULARY`, from `../../hooks`).
 */
import { get, readLog } from "@red-cup-engineering/semiotic-eavt-services-section/store";
import { logFile } from "@red-cup-engineering/semiotic-eavt-services-section/layout";
import { ARRIVAL_FEED } from "@red-cup-engineering/computer-system-engine/rpc/arrival";
import { operation } from "@red-cup-engineering/computer-system-engine/rpc/operation";

import {
  runCausalSet,
  closeRunCausalSet,
  turnDiamondsByObservation,

} from "@red-cup-engineering/metrologic/models/order/run-causal-set";

import { CLAUDE_CODE_TURN_VOCABULARY } from "@red-cup-engineering/agent-harness-computer-system-engineering-services-section/hooks/schema";
export { isArrivalLogPath } from "./arrival-feed.mjs";

function stringAt(value, ...keys) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value;
  for (const key of keys) {
    const candidate = record[key];
    if (typeof candidate === "string" && candidate.length > 0) return candidate;
  }
  return undefined;
}

function recordAt(value, ...keys) {
  let current = value;
  for (const key of keys) {
    if (current === undefined || current === null || typeof current !== "object" || Array.isArray(current)) return undefined;
    current = (current)[key];
  }
  return current;
}

/**
 * The hook arrivals of one day, in the order the day's log names them: each its CloudEvent identity,
 * the instant it arrived and the hook envelope its packet carries. An arrival whose packet is not held
 * in its record (a packet too large for one, in content custody) names no envelope here and is passed over.
 */
export function* hookArrivalsOfDay(root, date) {
  for (const { line } of readLog(root, ARRIVAL_FEED, date)) {
    const arrival = hookArrivalOfLine(root, line);
    if (arrival !== undefined) yield arrival;
  }
}

/** The hook arrival one line of a day's arrival log names, or undefined when it names none. */
export function hookArrivalOfLine(root, line) {
  const record = typeof line.of === "string" ? get(root, ARRIVAL_FEED, line.of) : undefined;
  const envelope = recordAt(record?.packet, "presentation", "data", "material", "envelope");
  if (envelope === undefined) return undefined;
  return Object.freeze({ identity: recordAt(record.packet, "presentation", "id"), at: record.at, envelope });
}

/** The log of one day's arrivals under a data root. */
export function arrivalLogPath(root, date) {
  return logFile(root, ARRIVAL_FEED, date);
}

/** The run observations (session, hook event, instant) of one day's hook arrivals, in time order. */
export function hookRunObservationsOfArrivalLog(root, date) {
  const observations = [];
  let rows = 0;
  for (const { envelope, at } of hookArrivalsOfDay(root, date)) {
    const session = stringAt(envelope, "sessionId", "session_id", "session");
    const hookEventName = stringAt(envelope, "hookEventName", "hook_event_name");
    if (session !== undefined && hookEventName !== undefined && typeof at === "string") {
      rows += 1;
      observations.push(Object.freeze({ session, hookEventName, at }));
    }
  }
  observations.sort((left, right) => left.at.localeCompare(right.at));
  return Object.freeze({ rows, observations: Object.freeze(observations) });
}

/**
 * Read one day's arrivals under a data root and derive that
 * day's turn diamonds and their sequencing causal set. Does not settle: a
 * real day's diamond count already exceeds what `closeRunCausalSet` can
 * afford in one call (see its docstring). Settle one session at a time via
 * `readSessionCausalSetCarrier` instead.
 */
export function readRunCausalSet(root, date) {
  const { rows, observations } = hookRunObservationsOfArrivalLog(root, date);
  const diamonds = turnDiamondsByObservation(observations, CLAUDE_CODE_TURN_VOCABULARY);
  return Object.freeze({
    kind: "metroplat.run.causal-set-read",
    root,
    date,
    rows,
    diamonds,
    causalSet: runCausalSet(diamonds),
  });
}

function operationDate(binding, input) {
  if (input !== null && typeof input === "object" && !Array.isArray(input)) {
    const date = (input)["date"];
    if (typeof date === "string" && date.length > 0) return date;
  }
  return binding.now().slice(0, 10);
}

export function runCausalSetOperations(binding) {
  return Object.freeze([
    operation({
      verb: "run-causal-set",
      inputFormat: "json",
      outputFormat: "json",
      summary: "Read the day's recorded hook/run causal set.",
      description: "Domain: { date? }. Folds the day's hook arrivals into turn diamonds and their sequencing causal set.",
      run: (input) => {
        const read = readRunCausalSet(binding.dataRoot, operationDate(binding, input));
        return read.rows === 0 ? null : read;
      },
    }),
  ]);
}

/** Settle one session's own turn diamonds out of a day's read — the properly bounded region for settlement, per `SETTLE_EVENT_CAP`'s docstring, rather than the day's diamonds across every session. */
export function readSessionCausalSetCarrier(read, session) {
  return closeRunCausalSet(read.diamonds.filter((diamond) => diamond.session === session));
}
