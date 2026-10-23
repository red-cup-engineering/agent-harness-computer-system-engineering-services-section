/**
 * The founder's utterances, decoded from the carriers that heard them.
 *
 * A harness is a carrier that decodes its IO into utterances (SWARM, engineering notes 2026-06-03).
 * Three carriers hold what the founder said to agents here: the UserPromptSubmit arrivals a harness
 * admitted into its MetroPlat settlement, the session transcripts Claude Code keeps
 * (`~/.claude/projects/<project>/*.jsonl`), and Codex's prompt history (`~/.codex/history.jsonl`,
 * the prompts typed into its TUI). All decode to the same utterance: one
 * prompt as the founder wrote it, under the derive-set-of-founder-utterances laws (Bare Cedar Fog
 * Claude harness work order, 2026-09-04) — system-reminder and IDE-selection spans stripped, house
 * noise dropped, a closed [since, until] window never widened, ascending by time.
 *
 * An utterance's token records its session and observed source-occurrence time, while its
 * claim preserves the prompt text. Repeating the same text at a different time must NOT become
 * the same utterance: Mark presentation equality is not occurrence identity. Different carriers
 * can agree on the same source coordinates, but no content digest proves their sources equal.
 * These occurrence-aware addresses are what articulations cite and what `knowing` consumes.
 */
import fs from "node:fs";
import { attachUtteranceSpeechActs } from "./utterance-speech-acts.mjs";
import path from "node:path";
import readline from "node:readline";
import { semanticId } from "@red-cup-engineering/computer-content-address-engineering-services-section/semiotic-content-address";
import { arrivalLogPath, hookArrivalsOfDay } from "./run-causal-set.mjs";

const SPANS = [/<system-reminder>[\s\S]*?<\/system-reminder>/gu, /<ide_selection>[\s\S]*?<\/ide_selection>/gu];
const NOISE = [
  /^\s*<(task-notification|local-command|command-name|command-message|cross-session-message)/u,
  /\[SYSTEM NOTIFICATION/u,
  /^Base directory for this skill/u,
  /^\[Request interrupted/u,
  /^This session is being continued/u,
  /^Caveat: The messages below/u,
];
const DAY_MS = 86_400_000;
/** The decoding law's version: a cache written under another law is read again. */
const DECODING = "2026-09-27.2";

/** The utterance a prompt's raw text carries, or null when it carries none. */
export function utteranceText(raw) {
  if (typeof raw !== "string") return null;
  const text = SPANS.reduce((rest, span) => rest.replace(span, ""), raw).trim();
  return text === "" || NOISE.some((pattern) => pattern.test(text)) ? null : text;
}

/** One source-positioned utterance: the token names the recorded occurrence, the claim the text.
 * This source coordinate is a technological readout, NOT a `Quot.sound` proof across carriers. */
export function utterance({ session, at, text, carrier, arrivalIdentity }) {
  if (typeof session !== "string" || session.trim() === "") throw new TypeError("utterance requires a source session");
  if (typeof at !== "string" || !Number.isFinite(Date.parse(at))) throw new TypeError("utterance requires a source occurrence timestamp");
  if (typeof text !== "string" || text.trim() === "") throw new TypeError("utterance requires a nonempty claim text");
  if (arrivalIdentity !== undefined && (typeof arrivalIdentity !== "string" || !arrivalIdentity.trim() || arrivalIdentity.length > 512))
    throw new TypeError("utterance requires a bounded source-reported event identity");
  return Object.freeze({
    address: semanticId({ kind: "utterance", version: 2, token: { session, at }, claim: text }),
    session, at, text, carrier,
    ...(arrivalIdentity === undefined ? {} : { arrivalIdentity }),
  });
}

/** Pure: the utterances among prompt records `{ session, at, text, carrier }` in the closed window
 *  `[since, until]` (either bound may be omitted), one per address, ascending by time. */
export function deriveUtterances(prompts, { since, until } = {}) {
  if (!Array.isArray(prompts)) throw new TypeError("utterances: prompts must be an array");
  const from = since === undefined ? -Infinity : Date.parse(since);
  const to = until === undefined ? Infinity : Date.parse(until);
  const byAddress = new Map();
  const arrivalsByAddress = new Map();
  for (const prompt of [...prompts].sort((a, b) => Date.parse(a.at) - Date.parse(b.at))) {
    const at = Date.parse(prompt.at);
    if (!(at >= from && at <= to)) continue;
    const text = utteranceText(prompt.text);
    if (text === null || typeof prompt.session !== "string" || prompt.session.trim() === "") continue;
    const said = utterance({ session: prompt.session, at: prompt.at, text, carrier: prompt.carrier });
    if (!byAddress.has(said.address)) byAddress.set(said.address, said);
    if (said.arrivalIdentity !== undefined) {
      const identities = arrivalsByAddress.get(said.address) ?? new Set();
      identities.add(said.arrivalIdentity);
      arrivalsByAddress.set(said.address, identities);
    }
  }
  return Object.freeze([...byAddress.values()].map(said => {
    const identities = arrivalsByAddress.get(said.address);
    if (!identities || identities.size < 2) return said;
    return Object.freeze({ ...said,
      sourceOccurrence: Object.freeze({
        status: 'ambiguous-distinct-arrival-ids-share-legacy-address',
        witnessedEventCount: identities.size,
        sourceEventIds: Object.freeze([...identities].slice(0, 8)),
        omittedEventIds: Math.max(0, identities.size - 8),
        evidence: 'original-arrival-CloudEvent-IDs-not-independent-Work-or-authority',
      }),
    });
  }));
}

/** Read files through a cache (a machine-state file path, or none): a file whose size and mtime are
 *  unchanged since it was cached is answered from the cache. Carrier logs only grow, so that is exact. */
async function readThroughCache(cache, entries) {
  let cached = {};
  if (cache !== undefined) try { const read = JSON.parse(fs.readFileSync(cache, "utf8")); cached = read.decoding === DECODING ? read.files ?? {} : {}; } catch { cached = {}; }
  const files = { ...cached };
  const prompts = [];
  for (const { key, file, read } of entries) {
    let stat;
    try { stat = fs.statSync(file); } catch { continue; }
    const hit = cached[key];
    const got = hit && hit.size === stat.size && hit.mtimeMs === stat.mtimeMs ? hit.prompts : await read(file);
    files[key] = { size: stat.size, mtimeMs: stat.mtimeMs, prompts: got };
    prompts.push(...got);
  }
  if (cache !== undefined) {
    fs.mkdirSync(path.dirname(cache), { recursive: true });
    fs.writeFileSync(cache, JSON.stringify({ kind: "agent-harness.carrier-prompts", decoding: DECODING, files }));
  }
  return prompts;
}

/** The prompts one day's arrivals admitted as UserPromptSubmit arrivals. */
function readArrivalDay(root, date) {
  const prompts = [];
  for (const { identity, envelope, at } of hookArrivalsOfDay(root, date)) {
    const payload = envelope.payload;
    if (envelope.hookEventName !== "UserPromptSubmit" || typeof payload?.prompt !== "string") continue;
    const text = utteranceText(payload.prompt);
    if (text !== null) prompts.push({ session: envelope.sessionId ?? payload.session_id, at: typeof at === "string" ? at : undefined, text, carrier: "metroplat-arrival", ...(typeof identity === "string" && identity.trim() ? { arrivalIdentity: identity } : {}) });
  }
  return prompts;
}

/** The prompts a settlement admitted as UserPromptSubmit arrivals on the given dates, through `cache`. */
export const readPromptArrivals = (root, dates, { cache } = {}) =>
  readThroughCache(cache, dates.map((date) => ({ key: date, file: arrivalLogPath(root, date), read: () => readArrivalDay(root, date) })));

const promptTextOf = (content) => typeof content === "string"
  ? content
  : Array.isArray(content) ? content.filter((part) => part?.type === "text").map((part) => part.text).join("\n") : "";

/** Whether a transcript turn was typed by a person: rows that name their origin say so; older rows
 *  are a person's unless the session was a headless SDK run (a script's templated prompt). */
const typedByPerson = (row) => row.origin?.kind !== undefined ? row.origin.kind === "human" : row.entrypoint !== "sdk-cli";

/** The prompts in one transcript file, streamed a line at a time: never tool results, meta or
 *  sidechains; a turn no person typed is kept marked `typed: false`, so the same prompt admitted
 *  through another carrier can be recognized and left out too. */
async function readTranscriptFile(file, fallbackSession) {
  const prompts = [];
  const lines = readline.createInterface({ input: fs.createReadStream(file, { highWaterMark: 1 << 20 }), crlfDelay: Infinity });
  for await (const line of lines) {
    if (!line.includes('"type":"user"')) continue;
    let row;
    try { row = JSON.parse(line); } catch { continue; }
    if (row.type !== "user" || row.isMeta || row.isSidechain || row.message?.role !== "user" || typeof row.timestamp !== "string") continue;
    const text = utteranceText(promptTextOf(row.message.content));
    if (text !== null) prompts.push({ session: row.sessionId ?? fallbackSession, at: row.timestamp, text, carrier: "claude-code-transcript", ...(typedByPerson(row) ? {} : { typed: false }) });
  }
  return prompts;
}

/** The prompts in Claude Code session transcripts under `directory` (one `<session>.jsonl` each),
 *  through `cache`; with `since`, only transcripts written since then. */
export async function readTranscriptPrompts(directory, { since, cache } = {}) {
  const floor = since === undefined ? -Infinity : Date.parse(since);
  let names;
  try { names = fs.readdirSync(directory).filter((name) => name.endsWith(".jsonl")).sort(); } catch { return []; }
  const recent = names.filter((name) => { try { return fs.statSync(path.join(directory, name)).mtimeMs >= floor; } catch { return false; } });
  return readThroughCache(cache, recent.map((name) => ({ key: name, file: path.join(directory, name), read: (file) => readTranscriptFile(file, name.slice(0, -".jsonl".length)) })));
}

/** The prompts typed into Codex, from its prompt history file (one `{ session_id, ts, text }` per line). */
function readCodexHistoryFile(file) {
  const prompts = [];
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    if (line.trim() === "") continue;
    let row;
    try { row = JSON.parse(line); } catch { continue; }
    const text = utteranceText(row.text);
    if (text !== null && typeof row.session_id === "string" && Number.isFinite(row.ts)) prompts.push({ session: row.session_id, at: new Date(row.ts * 1000).toISOString(), text, carrier: "codex-history" });
  }
  return prompts;
}

/** The prompts in Codex prompt-history files, through `cache`. */
export const readCodexPrompts = (files, { cache } = {}) =>
  readThroughCache(cache, files.map((file) => ({ key: file, file, read: readCodexHistoryFile })));

const datesOf = (since, until) => {
  const dates = [];
  for (let t = Date.parse(since.slice(0, 10)); t <= Date.parse(until); t += DAY_MS) dates.push(new Date(t).toISOString().slice(0, 10));
  return dates;
};

/** The Claude Code transcript directory for a working directory (the vendor's project-key rule). */
export const claudeTranscriptDirectory = (cwd, home = process.env.HOME ?? "") => path.join(home, ".claude", "projects", path.resolve(cwd).replace(/[^A-Za-z0-9]/gu, "-"));

/** Every utterance both carriers hold in a window. Arrivals are read for the window's dates (all of
 *  them from `arrivalsSince` when no `since` is given); transcripts from `transcripts` directories.
 *  and Codex prompt-history files from `codex`. With `cache` (carrier directory → machine-state
 *  path), each carrier is read through its cache. */
export async function readUtterances({ root, transcripts = [], codex = [], since, until, arrivalsSince = "2026-09-01", cache, speechActProposals, speechActInterpreter }, options = {}) {
  const end = until ?? new Date().toISOString();
  const prompts = [];
  if (root !== undefined) prompts.push(...await readPromptArrivals(root, datesOf(since ?? arrivalsSince, end), { ...options, cache: cache?.(root) }));
  for (const directory of transcripts) prompts.push(...await readTranscriptPrompts(directory, { since, cache: cache?.(directory) }));
  if (codex.length > 0) prompts.push(...await readCodexPrompts(codex, { cache: cache?.(path.dirname(codex[0])) }));
  const untyped = new Set(prompts.filter((p) => p.typed === false && typeof p.session === "string"
    && p.session.trim() !== "" && typeof p.at === "string" && Number.isFinite(Date.parse(p.at))
    && utteranceText(p.text) !== null).map((p) => utterance({ ...p, text: utteranceText(p.text) }).address));
  const selected = deriveUtterances(prompts, { since, until: end }).filter((u) => !untyped.has(u.address));
  // Optional source-bound analyst readout. Never reclassify, drop or promote the
  // original message automatically; missing proposals mean unassessed evidence.
  return speechActProposals === undefined ? selected
    : attachUtteranceSpeechActs(selected, speechActProposals, { interpretedBy: speechActInterpreter });
}
