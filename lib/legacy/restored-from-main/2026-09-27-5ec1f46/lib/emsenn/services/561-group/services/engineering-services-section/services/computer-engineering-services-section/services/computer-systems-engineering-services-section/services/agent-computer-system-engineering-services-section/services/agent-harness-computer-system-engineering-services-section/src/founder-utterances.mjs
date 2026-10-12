/**
 * The founder's utterances, read from the prompts a harness admitted as arrivals, and whether each
 * has been carried into the work rail.
 *
 * Every UserPromptSubmit a harness delivers is admitted into its MetroPlat settlement as an arrival
 * (the catchment). An utterance is one such prompt as the founder wrote it: the laws are those of
 * the derive-set-of-founder-utterances work order (Bare Cedar Fog Claude harness, 2026-09-04) —
 * system-reminder and IDE-selection spans stripped, house noise blocks dropped, a closed [since,
 * until] window never widened, duplicates dropped on their first 200 characters keeping the first,
 * ascending by time. Its address is the admitting arrival's CloudEvent identity, a content address.
 *
 * Placing an utterance in the org's endeavors is the CEO office's translation (lead-the-company:
 * a direct instruction becomes a structured work intent whose leaf declares its work, skill and
 * receiver), not a script's guess. An utterance is carried once an admitted intent cites it as a
 * source (`source:<address>` in an obligation's evidence); what is not carried is the work.
 */
import path from "node:path";
import { operation } from "@red-cup-engineering/computer-system-engine/rpc/operation";
import { journal } from "@red-cup-engineering/computer-system-engine/journal/journal";
import { arrivalLogPath, hookArrivalOfArrivalRow, isArrivalLogPath } from "./run-causal-set.mjs";

const SPANS = [/<system-reminder>[\s\S]*?<\/system-reminder>/gu, /<ide_selection>[\s\S]*?<\/ide_selection>/gu];
const NOISE = [
  /^\s*<(task-notification|local-command)/u,
  /\[SYSTEM NOTIFICATION/u,
  /<command-name>/u,
  /^Base directory for this skill/u,
  /^\[Request interrupted/u,
  /^This session is being continued/u,
  /^Caveat: The messages below/u,
];
const DAY_MS = 86_400_000;

/** Pure: the founder utterances among prompt records `{ address, session, at, text }` within the
 *  closed window `[since, until]`. */
export function deriveFounderUtterances(prompts, { since, until }) {
  if (!Array.isArray(prompts)) throw new TypeError("founder utterances: prompts must be an array");
  if (typeof since !== "string" || typeof until !== "string") throw new TypeError("founder utterances: since and until must be ISO timestamp strings");
  const from = Date.parse(since);
  const to = Date.parse(until);
  const seen = new Set();
  const utterances = [];
  for (const prompt of [...prompts].sort((a, b) => String(a.at).localeCompare(String(b.at)))) {
    const at = Date.parse(prompt.at);
    if (!(at >= from && at <= to) || typeof prompt.text !== "string") continue;
    const text = SPANS.reduce((rest, span) => rest.replace(span, ""), prompt.text).trim();
    if (text === "" || NOISE.some((pattern) => pattern.test(text))) continue;
    const key = text.slice(0, 200);
    if (seen.has(key)) continue;
    seen.add(key);
    utterances.push(Object.freeze({ address: prompt.address, session: prompt.session, at: prompt.at, text }));
  }
  return Object.freeze(utterances);
}

function datesOf(since, until) {
  const dates = [];
  for (let t = Date.parse(since.slice(0, 10)); t <= Date.parse(until); t += DAY_MS) dates.push(new Date(t).toISOString().slice(0, 10));
  return dates;
}

/** The prompts admitted as UserPromptSubmit arrivals under a settlement on the given dates. */
export function readPromptArrivals(root, dates, options = {}) {
  const prompts = [];
  for (const date of dates) {
    const log = arrivalLogPath(root, date);
    journal.scan(log, undefined, (_accum, row) => {
      const arrival = hookArrivalOfArrivalRow(row, path.dirname(log), options);
      const envelope = arrival?.envelope;
      const payload = envelope?.payload;
      if (envelope?.hookEventName !== "UserPromptSubmit" || typeof payload?.prompt !== "string") return undefined;
      prompts.push({ address: arrival.identity, session: envelope.sessionId ?? payload.session_id, at: typeof row[3] === "string" ? row[3] : undefined, text: payload.prompt });
      return undefined;
    });
  }
  return prompts;
}

/** The addresses the admitted work rail cites as sources on the given dates. The hook catchment is
 *  left out: it cites nothing, and a prompt that quotes an address would read as a citation. */
export function citedSources(root, dates) {
  const cited = new Set();
  for (const date of dates) {
    journal.scanAll(root, date, undefined, (_accum, row) => {
      for (const match of JSON.stringify(row).matchAll(/"source:([^"]+)"/gu)) cited.add(match[1]);
      return undefined;
    }, { admit: (logPath) => !isArrivalLogPath(logPath) });
  }
  return cited;
}

/** The founder's utterances in a window, each marked carried or not. */
export function readFounderUtterances(root, { since, until }, options = {}) {
  const dates = datesOf(since, until);
  const utterances = deriveFounderUtterances(readPromptArrivals(root, dates, options), { since, until });
  const cited = citedSources(root, dates);
  const read = utterances.map((utterance) => Object.freeze({ ...utterance, carried: cited.has(utterance.address) }));
  return Object.freeze({
    kind: "agent-harness.founder-utterances",
    since,
    until,
    utterances: Object.freeze(read),
    carried: read.filter((u) => u.carried).length,
    uncarried: read.filter((u) => !u.carried).length,
  });
}

export function founderUtteranceOperations(binding) {
  return Object.freeze([
    operation({
      verb: "founder-utterances",
      inputFormat: "json",
      outputFormat: "json",
      summary: "The founder's utterances admitted through harness prompts, and whether each has been carried into a structured work intent.",
      description: "Domain: { since?, until?, uncarried? }. The window defaults to the last three days; uncarried: true returns only the utterances no admitted intent cites. Carry one with structured-work-intent-admit, naming its address as a source (kind founder-utterance) and citing spans of its text.",
      run: (input = {}) => {
        const until = input?.until ?? binding.now();
        const since = input?.since ?? new Date(Date.parse(until) - 3 * DAY_MS).toISOString();
        const read = readFounderUtterances(binding.dataRoot, { since, until }, binding);
        return input?.uncarried === true ? Object.freeze({ ...read, utterances: read.utterances.filter((u) => !u.carried) }) : read;
      },
    }),
  ]);
}
