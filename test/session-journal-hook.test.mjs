import assert from "node:assert/strict";
import { Readable, Writable } from "node:stream";
import { test } from "node:test";

import { BIAS_CHECK, DEFAULT_LEADERS, JOURNAL_HOOK_FILE, UNSEATED, UNSEATED_TITLE, journalHookEntry, journalOf, journalText, lastMovedAt, main, mergeJournalHooks, parseArguments, readJournal, sessionStartOutput } from "../src/session-journal-hook.mjs";

const AT = "2026-10-21T12:00:00.000Z";
const daysBefore = (n) => new Date(Date.parse(AT) - n * 86_400_000).toISOString();

/** A work arena that reads the threads it is given, so the journal's own choices are what is tested. */
const workArena = Object.freeze({
  CLOSED_STANDINGS: Object.freeze(["accepted", "withdrawn", "superseded", "resolved"]),
  threadSummary: (thread) => ({ gist: thread.gist }),
  owesOf: (thread) => (thread.owes.length === 0 ? undefined : thread.owes),
  awaitsOf: (thread) => thread.awaits,
  workBoard: (moves) => ({ threads: moves }),
});

const thread = (id, { owes = [], standing = "open", opened = 10, moved = opened, awaits } = {}) => ({
  id, standing, gist: `gist of ${id}`, owes, awaits, ageDays: opened,
  opening: { at: daysBefore(opened) }, promisers: moved === opened ? [] : [{ at: daysBefore(moved) }],
});

test("lastMovedAt reads the newest move, not the opening", () => {
  assert.equal(lastMovedAt(thread("a", { opened: 9, moved: 2 })), daysBefore(2));
  assert.equal(lastMovedAt(thread("b", { opened: 4 })), daysBefore(4));
});

test("each open thread lands once, in the first section that holds it", () => {
  const board = { threads: [
    thread("mine", { owes: ["office#me", "engineering"] }),
    thread("house", { owes: ["engineering"] }),
    thread("leader", { owes: [DEFAULT_LEADERS[0]] }),
    thread("unseated", { owes: [UNSEATED] }),
    thread("nobody", { owes: [] }),
    thread("stale", { owes: ["farstone"], opened: 9, moved: 5 }),
    thread("fresh", { owes: ["farstone"], opened: 9, moved: 1 }),
    thread("done", { owes: ["engineering"], standing: "resolved" }),
  ] };
  const journal = journalOf(board, { workArena, at: AT, players: ["office#me"], enterprises: ["engineering"], staleDays: 3 });
  const ids = (list) => list.map((entry) => entry.id);
  assert.deepEqual(ids(journal.mine), ["mine"]);
  assert.deepEqual(ids(journal.houses), ["house"]);
  assert.deepEqual(ids(journal.leader), ["leader"]);
  assert.deepEqual(ids(journal.unseated).sort(), ["nobody", "unseated"]);
  assert.deepEqual(ids(journal.stale), ["stale"]);
  assert.equal(journal.open, 7);
  assert.equal(journal.threads, 8);
});

test("a section reads longest-idle first and says how many it leaves out", () => {
  const board = { threads: [1, 7, 3, 12].map((idle) => thread(`t${idle}`, { owes: ["engineering"], opened: 20, moved: idle })) };
  const journal = journalOf(board, { workArena, at: AT, enterprises: ["engineering"] });
  assert.deepEqual(journal.houses.map((entry) => entry.id), ["t12", "t7", "t3", "t1"]);
  const text = journalText(journal, { host: "node.test", limit: 2 });
  assert.match(text, /Owed by your offices' enterprises \(4\):/u);
  assert.match(text, /idle 12d, open: gist of t12/u);
  assert.match(text, /- and 2 more/u);
  assert.doesNotMatch(text, /gist of t1\b/u);
});

test("an empty board says nothing is owed", () => {
  const text = journalText(journalOf({ threads: [] }, { workArena, at: AT }), { host: "node.test" });
  assert.match(text, /Work board on node\.test: 0 open of 0 threads/u);
  assert.match(text, /Nothing is owed or standing still\./u);
});

test("the hook reply is SessionStart additional context", () => {
  const reply = JSON.parse(sessionStartOutput("journal"));
  assert.deepEqual(reply, { hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: "journal" } });
});

test("arguments collect repeated parties and require the release and settlement", () => {
  const options = parseArguments(["--release", "/r", "--settlement", "/s", "--player", "a", "--player", "b", "--enterprise", "e", "--stale-days", "5"]);
  assert.deepEqual([...options.players], ["a", "b"]);
  assert.deepEqual([...options.enterprises], ["e"]);
  assert.deepEqual([...options.leaders], [...DEFAULT_LEADERS]);
  assert.equal(options.staleDays, 5);
  assert.throws(() => parseArguments(["--player", "a"]), /--release and --settlement are required/u);
});

test("readJournal replays the store's work-arena moves through the supplied release", async () => {
  const store = { each: (root, type) => (type === "work-arena-move" ? [{ address: "x", record: thread("from-store", { owes: ["engineering"] }) }] : []) };
  const text = await readJournal({ settlement: "/s", host: "node.test", enterprises: ["engineering"], at: AT, suppliers: { workArena, store } });
  assert.match(text, /gist of from-store/u);
});

test("an unreadable board is said in the journal and the hook still exits cleanly", async () => {
  let written = "";
  const stdout = new Writable({ write(chunk, _encoding, done) { written += chunk; done(); } });
  await main(["--release", "/nonexistent-release", "--settlement", "/nonexistent-settlement"], { stdin: Readable.from(["{}"]), stdout });
  const context = JSON.parse(written).hookSpecificOutput.additionalContext;
  assert.match(context, /^Work board unreadable \(/u);
});

test("the installed entry runs this source with its arguments, and refuses arguments the hook would refuse", () => {
  const entry = journalHookEntry(["--release", "/r", "--settlement", "/s", "--player", "it's"], { node: "/bin/node", timeout: 30 });
  const [handler] = entry.hooks;
  assert.equal(handler.type, "command");
  assert.equal(handler.timeout, 30);
  assert.ok(handler.command.startsWith("'/bin/node' '"));
  assert.ok(handler.command.includes(JOURNAL_HOOK_FILE));
  assert.ok(handler.command.endsWith("'--player' 'it'\\''s'"));
  assert.throws(() => journalHookEntry(["--player", "a"]), /--release and --settlement are required/u);
});

test("merging keeps every other hook and replaces an earlier journal entry wherever its copy lived", () => {
  const entry = journalHookEntry(["--release", "/r", "--settlement", "/s"], { node: "/bin/node" });
  const existing = {
    PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "guard" }] }],
    SessionStart: [
      { hooks: [{ type: "command", command: `node /old/copy/${JOURNAL_HOOK_FILE} --release /x --settlement /y` }, { type: "command", command: "other-start" }] },
      { hooks: [{ type: "command", command: `node /another/${JOURNAL_HOOK_FILE}` }] },
    ],
  };
  const merged = mergeJournalHooks(existing, entry);
  assert.deepEqual(merged.PreToolUse, existing.PreToolUse);
  assert.deepEqual(merged.SessionStart, [{ hooks: [{ type: "command", command: "other-start" }] }, entry]);
  assert.deepEqual(mergeJournalHooks(merged, entry), merged);
});

test("unseated demand is told as pressure to take or found, never as the Leader's", () => {
  const journal = journalOf({ threads: [thread("orphan", { owes: [UNSEATED], opened: 15 })] }, { workArena, at: AT });
  const text = journalText(journal, { host: "node.test" });
  assert.ok(text.includes(`${UNSEATED_TITLE} (1):`));
  assert.match(UNSEATED_TITLE, /found the office, service or micro-enterprise/u);
  assert.match(UNSEATED_TITLE, /None of these waits on the Leader/u);
  assert.equal(journal.leader.length, 0);
});

test("every journal opens with the Group's bias check and the rules that hold it", () => {
  const text = journalText(journalOf({ threads: [] }, { workArena, at: AT }), { host: "node.test" });
  assert.ok(text.split("\n").slice(0, 3).includes(BIAS_CHECK));
  for (const rule of ["reason-toward-doing-not-toward-refusing", "routine-work-is-landed-not-deferred", "unseated-demand-founds-what-takes-it"]) assert.ok(BIAS_CHECK.includes(rule));
});
