#!/usr/bin/env node
/**
 * @module session-journal-hook
 * The work board, read into every agent session as it starts.
 *
 * Work that is recorded only on the board is seen only by whoever goes to look, and a session starts
 * from its prompt, not from the board: so a thread a micro-enterprise owes, an ask the Leader owes and
 * work no micro-enterprise is seated for ("market") wait until someone happens to name them. This
 * SessionStart hook replays the node's board, read-only, with the work arena and store of the release
 * the node runs (its Guix profile, so a promoted release is read under its own law), and gives the
 * session one journal: what its offices owe, what their enterprises owe, what waits on the Leader,
 * what no one is seated for, and what has stood still. It never blocks a session; a board it cannot
 * read is said in the journal, because an unread board is itself the finding.
 *
 *   session-journal-hook --release <profile> --settlement <root> [--host <name>]
 *                        [--player <office or character>]... [--enterprise <id>]...
 *                        [--leader <id>]... [--stale-days <n>] [--limit <n>]
 *
 * The journal is a reading, not an authority: acting on a thread is a move on the board.
 */
import { realpathSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { shellQuote } from "./host-resource-hook.mjs";

/** The owing party the board names when no micro-enterprise is seated for a thread. */
export const UNSEATED = "market";
/**
 * Unseated demand is pressure to found what takes it, never a question for the Leader (Leader,
 * 2026-10-21: "there should be autonomus pressure to create offices and services and enterprises").
 * A micro-enterprise is founded as an enterprise record and an empty root, its lead taken by the
 * founder's bid against a target (2026-09-30 note on micro-enterprises holding their own work).
 */
export const UNSEATED_TITLE = "No micro-enterprise is seated for these: take one with an office you hold, or found the office, service or micro-enterprise that would take it (an enterprise record and an empty root, its lead taken by your bid against a target). None of these waits on the Leader";
export const DEFAULT_LEADERS = Object.freeze(["emsenn", "urn:leader:emsenn", "leader"]);
/**
 * The Group's standing correction of its own bias, read before any work (Leader, 2026-10-21: "Our
 * ecosystem has a bias toward 'x not proven, not finishing it'"; the rules it names hold the rest).
 */
export const BIAS_CHECK = "Before deciding anything: do not refuse, defer or shrink work because a market is small today, a buyer is unproven, or the earnings look small; size a market by its dated growth, not one snapshot (reason-toward-doing-not-toward-refusing). A check that could not run is unknown: retry it or ask, never decline on it. Carry work to its receiving condition; a stop is a board thread owed by something that runs, never a name in a note (routine-work-is-landed-not-deferred). Work no one holds founds what takes it, without the Leader (unseated-demand-founds-what-takes-it).";
export const DEFAULT_STALE_DAYS = 3;
export const DEFAULT_LIMIT = 8;
const DAY_MS = 86_400_000;

/** The work arena and store of the release at `release`, so the board is replayed under the law that wrote it. */
export async function releaseSuppliers(release) {
  const require = createRequire(path.join(path.resolve(release), "node_modules", ".session-journal"));
  const load = async (specifier) => import(pathToFileURL(require.resolve(specifier)).href);
  const [workArena, store] = await Promise.all([
    load("@red-cup-engineering/organizing/enterprise/work-arena"),
    load("@red-cup-engineering/semiotic-eavt-services-section/store"),
  ]);
  return Object.freeze({ workArena, store });
}

/** The newest `at` of any move a thread holds: when it last moved, which its opening alone does not say. */
export function lastMovedAt(thread) {
  let latest = thread.opening?.at;
  const visit = (value) => {
    if (Array.isArray(value)) { value.forEach(visit); return; }
    if (value !== null && typeof value === "object" && typeof value.at === "string" && (latest === undefined || value.at > latest)) latest = value.at;
  };
  for (const [key, value] of Object.entries(thread)) if (key !== "children" && key !== "blockedBy") visit(value);
  return latest;
}

/**
 * The journal of one board for one session: every open thread once, in the first section that
 * holds it (the session's offices, their enterprises, the Leader, no one seated, standing still),
 * oldest movement first. `workArena` is the release's work arena module.
 */
export function journalOf(board, { workArena, at, players = [], enterprises = [], leaders = DEFAULT_LEADERS, staleDays = DEFAULT_STALE_DAYS }) {
  const now = Date.parse(at);
  const closed = new Set(workArena.CLOSED_STANDINGS);
  const sections = { mine: [], houses: [], leader: [], unseated: [], stale: [] };
  const open = board.threads.filter((thread) => !closed.has(thread.standing));
  for (const thread of open) {
    const summary = workArena.threadSummary(thread);
    const owes = [...(workArena.owesOf(thread) ?? [])];
    const moved = lastMovedAt(thread);
    const entry = Object.freeze({
      id: thread.id, standing: thread.standing, gist: summary.gist ?? "", owes: Object.freeze(owes),
      awaits: Object.freeze([...(workArena.awaitsOf(thread) ?? [])]),
      idleDays: moved === undefined ? undefined : Math.max(0, (now - Date.parse(moved)) / DAY_MS),
      ageDays: thread.ageDays,
    });
    const owedBy = (ids) => owes.some((id) => ids.includes(id));
    if (owedBy(players)) sections.mine.push(entry);
    else if (owedBy(enterprises)) sections.houses.push(entry);
    else if (owedBy(leaders)) sections.leader.push(entry);
    else if (owes.includes(UNSEATED) || owes.length === 0) sections.unseated.push(entry);
    else if ((entry.idleDays ?? 0) >= staleDays) sections.stale.push(entry);
  }
  const byIdle = (a, b) => (b.idleDays ?? 0) - (a.idleDays ?? 0);
  for (const list of Object.values(sections)) list.sort(byIdle);
  return Object.freeze({ at, threads: board.threads.length, open: open.length, staleDays, ...sections });
}

const days = (value) => (value === undefined ? "?" : `${Math.floor(value)}d`);
const short = (id) => String(id).replace(/^ni:\/\/\/sha-256;/u, "").slice(0, 8);
const clip = (text, size) => { const flat = String(text).replace(/\s+/gu, " ").trim(); return flat.length > size ? `${flat.slice(0, size - 1)}…` : flat; };

/** The journal as the few lines a session reads before its prompt. */
export function journalText(journal, { host = "this node", limit = DEFAULT_LIMIT } = {}) {
  const lines = [`Work board on ${host}: ${journal.open} open of ${journal.threads} threads (read ${journal.at}). Act on a thread by a move on the board (ops_open_work, world-command); this journal is a reading, not an authority.`, "", BIAS_CHECK];
  const section = (title, entries, describe) => {
    if (entries.length === 0) return;
    lines.push("", `${title} (${entries.length}):`);
    for (const entry of entries.slice(0, limit)) lines.push(`- [${short(entry.id)}] idle ${days(entry.idleDays)}, ${entry.standing}: ${clip(entry.gist, 140)}${describe(entry)}`);
    if (entries.length > limit) lines.push(`- and ${entries.length - limit} more`);
  };
  const owing = (entry) => (entry.owes.length === 0 ? "" : ` (owes: ${entry.owes.join(", ")}${entry.awaits.length ? `; awaits ${entry.awaits.join("/")}` : ""})`);
  section("Owed by your offices: carry these to their receiving condition before new work", journal.mine, owing);
  section("Owed by your offices' enterprises", journal.houses, owing);
  section("Waiting on the Leader: say each one to them plainly, once", journal.leader, owing);
  section(UNSEATED_TITLE, journal.unseated, () => "");
  section(`Standing still ${journal.staleDays} days or more`, journal.stale, owing);
  if (journal.mine.length + journal.houses.length + journal.leader.length + journal.unseated.length + journal.stale.length === 0) lines.push("", "Nothing is owed or standing still.");
  return lines.join("\n");
}

/** The SessionStart hook's reply: the journal as additional context. */
export const sessionStartOutput = (text) => `${JSON.stringify({ hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: text } })}\n`;

/** This module's file name: how an installed entry is recognised wherever its copy lives. */
export const JOURNAL_HOOK_FILE = "session-journal-hook.mjs";
const SOURCE = fileURLToPath(import.meta.url);

/** One SessionStart hook group running this source with `hookArguments` (validated by parseArguments). */
export function journalHookEntry(hookArguments, { node = process.execPath, source = SOURCE, timeout = 30 } = {}) {
  parseArguments(hookArguments);
  return Object.freeze({ hooks: Object.freeze([Object.freeze({ type: "command", command: [node, source, ...hookArguments].map(shellQuote).join(" "), timeout })]) });
}

/** Settings hooks with the journal entry in place: unrelated hooks are kept, any earlier journal entry is replaced. */
export function mergeJournalHooks(existing = {}, entry) {
  const hooks = { ...existing };
  hooks.SessionStart = (hooks.SessionStart ?? []).flatMap((group) => {
    const held = (group.hooks ?? []).filter((handler) => !String(handler.command ?? "").includes(JOURNAL_HOOK_FILE));
    return held.length === 0 ? [] : [{ ...group, hooks: held }];
  });
  hooks.SessionStart.push(entry);
  return hooks;
}

/** Read the board at `settlement` through the release's store and give its journal text. */
export async function readJournal({ release, settlement, host, players, enterprises, leaders, staleDays, limit, at = new Date().toISOString(), suppliers }) {
  const { workArena, store } = suppliers ?? await releaseSuppliers(release);
  const moves = [...store.each(path.resolve(settlement), "work-arena-move")].map((row) => row.record);
  const board = workArena.workBoard(moves, at);
  return journalText(journalOf(board, { workArena, at, players, enterprises, leaders, staleDays }), { host, limit });
}

/** `--name value` options; repeated names collect. */
export function parseArguments(argv) {
  const repeated = new Set(["player", "enterprise", "leader"]);
  const options = { player: [], enterprise: [], leader: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const name = argv[index].replace(/^--/u, "");
    const value = argv[index + 1];
    if (!argv[index].startsWith("--") || value === undefined) throw new TypeError(`session-journal-hook: expected --name value at ${argv[index]}`);
    if (repeated.has(name)) options[name].push(value); else options[name] = value;
    index += 1;
  }
  if (!options.release || !options.settlement) throw new TypeError("session-journal-hook: --release and --settlement are required");
  return Object.freeze({
    release: options.release, settlement: options.settlement, host: options.host,
    players: options.player, enterprises: options.enterprise, leaders: options.leader.length ? options.leader : DEFAULT_LEADERS,
    staleDays: options["stale-days"] === undefined ? DEFAULT_STALE_DAYS : Number(options["stale-days"]),
    limit: options.limit === undefined ? DEFAULT_LIMIT : Number(options.limit),
  });
}

/** The hook: always exits 0; a board it cannot read is said, not hidden. */
export async function main(argv = process.argv.slice(2), { stdin = process.stdin, stdout = process.stdout } = {}) {
  for await (const _chunk of stdin) { /* the SessionStart payload carries nothing the journal needs */ }
  let text;
  try { text = await readJournal(parseArguments(argv)); }
  catch (error) { text = `Work board unreadable (${clip(error?.message ?? error, 300)}). The session starts without the board's journal; that the board could not be read is itself work to report.`; }
  stdout.write(sessionStartOutput(text));
}

let invoked = false;
try { invoked = process.argv[1] !== undefined && realpathSync(process.argv[1]) === realpathSync(SOURCE); } catch { invoked = false; }
if (invoked) await main();
