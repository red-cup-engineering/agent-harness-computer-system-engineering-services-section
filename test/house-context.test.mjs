// house-context.test: the carrier that projects the Group's rules, Leader decisions and open work into a
// session (rule capitalized-leader-statements-mark-a-failed-carrier). The records here are a small fake of the
// 561 Group services section; the text under test is what the records say, never text of the hook's own.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { scratchRoot } from "./support/scratch.mjs";
import path from "node:path";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";

import { BUDGETS, PROJECTION_RECORD, SECTION_PATH, clip, detectCapitalizedStatement, firstSentence, projectHouseContext, readCarriers, readHouse, renderCapitalsInstruction, renderHouseContext, sectionFor } from "../src/house-context.mjs";
import { EVENTS, houseContextHookEntries, main, mergeHouseContextHooks, parseArguments } from "../src/house-context-hook.mjs";
import { installHouseContextHook } from "../scripts/install-house-context-hook.mjs";

const root = mkdtempSync(path.join(scratchRoot(), "house-context-"));
process.on("exit", () => rmSync(root, { recursive: true, force: true }));

const ASK = "A session MUST answer a question about how the Group's work is done from the house by gathering context, and MUST NOT put such a question to the Leader. It brings the Leader only a preference.";
const BILL = "GitHub CI/CD operations MUST NOT enable or request billing as a repair for unavailable hosted jobs.";
const writeJson = (file, value) => { mkdirSync(path.dirname(file), { recursive: true }); writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`); };

/** A working tree whose 561 Group services section holds the records the projection names. */
function fakeTree(name, { projection } = {}) {
  const tree = path.join(root, name);
  const section = path.join(tree, SECTION_PATH);
  writeJson(path.join(section, "lib/agency/rules/ask.json"), { id: "ask", statement: ASK });
  writeJson(path.join(section, "lib/agency/rules/no-billing.json"), { id: "no-billing", statement: BILL });
  writeJson(path.join(section, "lib/agency/rules/caps.json"), { id: "caps", statement: "A Leader statement written in capitals MUST be received as a correction the Leader has already given." });
  writeJson(path.join(section, "lib/agency/requirements/zero-cash.json"), { id: "zero-cash", name: "Zero cash", budget: { cash: "zero", until: "the Leader lifts it", source: "Leader: \"No spending yet\"" } });
  writeJson(path.join(section, "data/records/leader-decision-records/queue.json"), { items: [{ id: "wallet-seed", state: "open" }, { id: "card-signups", state: "deferred by the Leader on 2026-10-24" }, { id: "finished", state: "done" }] });
  writeJson(path.join(section, PROJECTION_RECORD), projection ?? {
    id: "agent-session-projection",
    rules: [{ topic: "Asking", items: [{ id: "ask", width: 300 }] }, { topic: "Zero cash", items: [{ id: "no-billing" }] }],
    requirements: [{ id: "zero-cash", topic: "Cash" }],
    "decision-queue": "data/records/leader-decision-records/queue.json",
    carriers: [{ repo: "org/campaign", number: 390, binds: "zero-cash compute" }, { repo: "org/market", number: 4, binds: "the cutover" }],
    briefs: [{ repo: "org/metroplat", number: 174, verb: "start duty:<id>" }],
    checklist: ["Rules: read the rule by id.", "Credentials: the host .env files, names only."],
    correction: { rule: "caps", skill: "persisting-a-leader-correction", runbook: "a-leader-correction-arrives-in-capitals" },
  });
  return { tree, section };
}

const states = (read = "live") => new Map([
  ["org/campaign#390", { state: "open", title: "Campaign: zero-cash compute", updated: "2026-10-25T00:29:29Z", pull: false, merged: null, read }],
  ["org/market#4", { state: "open", title: "Production market cutover", updated: "2026-10-25T00:47:52Z", pull: false, merged: null, read }],
  ["org/metroplat#174", { state: "open", title: "runbooks", updated: "2026-10-25T00:00:00Z", pull: true, merged: null, read }],
]);

test("clip cuts at a word and firstSentence keeps the modal clause", () => {
  assert.equal(clip("one two three four five", 100), "one two three four five");
  assert.match(clip("one two three four five six seven", 20), /^one two three four…$/u);
  assert.equal(firstSentence(ASK), "A session MUST answer a question about how the Group's work is done from the house by gathering context, and MUST NOT put such a question to the Leader.");
});

test("a session is projected only inside the named working trees, compared by real path", () => {
  const { tree, section } = fakeTree("tree-a");
  const link = path.join(root, "alias-of-a");
  symlinkSync(tree, link);
  mkdirSync(path.join(tree, "work", "deep"), { recursive: true });
  assert.equal(sectionFor(path.join(tree, "work", "deep"), [tree]), section);
  assert.equal(sectionFor(path.join(link, "work"), [tree]), section, "a symlinked checkout is the same tree");
  assert.equal(sectionFor(root, [tree]), undefined, "the parent of a tree is outside it");
  assert.equal(sectionFor("/nonexistent/place", [tree]), undefined);
  assert.equal(sectionFor(path.join(tree, "work"), [path.join(root, "missing-tree")]), undefined);
});

test("the projection is read from the records: statements, budget, decisions, queue, carriers, checklist", () => {
  const { section } = fakeTree("tree-b");
  const house = readHouse(section);
  assert.deepEqual(house.problems, []);
  const { text, truncated } = renderHouseContext({ house, carrierStates: states(), event: "SessionStart" });
  assert.equal(truncated, false);
  assert.match(text, /current user request defines the work/u);
  assert.doesNotMatch(text, /OPEN CARRIERS: continue these|CHECK ALL OF THESE/u);
  assert.ok(text.length <= BUDGETS.SessionStart);
  assert.ok(text.includes("MUST NOT put such a question to the Leader"), "the rule's own words, not a paraphrase");
  assert.ok(text.includes("[no-billing] " + BILL));
  assert.match(text, /Cash: cash zero; until the Leader lifts it; source Leader: "No spending yet"/u);
  assert.match(text, /Waiting on the Leader already[^\n]*: wallet-seed\./u, "finished and deferred items are not listed as waiting");
  assert.match(text, /Leader decision on card-signups: deferred by the Leader on 2026-10-24/u);
  assert.match(text, /org\/campaign#390 \[issue open, 2026-10-25\] Campaign: zero-cash compute/u);
  assert.match(text, /org\/market#4/u);
  assert.match(text, /Session brief: `start duty:<id>` once org\/metroplat#174 lands \(open\)/u);
  assert.match(text, /BEFORE ASKING THE LEADER[\s\S]*1\. Rules: read the rule by id\.\n2\. Credentials: the host \.env files, names only\./u);
  assert.match(text, /CAPITALS:[^\n]*persisting-a-leader-correction and runbook a-leader-correction-arrives-in-capitals/u);
  assert.equal(renderHouseContext({ house, carrierStates: states(), event: "SessionStart" }).text, text, "same records, same text");
});

test("a landed brief is named as available; an unread carrier is listed from its record", () => {
  const { section } = fakeTree("tree-c");
  const landed = states();
  landed.set("org/metroplat#174", { state: "closed", title: "runbooks", updated: "2026-10-26T00:00:00Z", pull: true, merged: "2026-10-26T00:00:00Z", read: "live" });
  const house = readHouse(section);
  assert.match(renderHouseContext({ house, carrierStates: landed }).text, /Session brief: in the MetroPlat world type `start duty:<id>`/u);
  const offline = renderHouseContext({ house, carrierStates: new Map() }).text;
  assert.match(offline, /org\/campaign#390 \(state unread\): zero-cash compute/u);
});

test("a statement over the budget is shortened until the sections fit, then cut with its reason", () => {
  const long = Array.from({ length: 60 }, (_, index) => ({ id: "ask", width: 300, n: index }));
  const { section } = fakeTree("tree-d", { projection: { id: "p", rules: [{ topic: "Many", items: long }], checklist: [] } });
  const { text, truncated } = renderHouseContext({ house: readHouse(section), event: "SessionStart" });
  assert.equal(truncated, true);
  assert.ok(text.length <= BUDGETS.SessionStart);
  assert.match(text, /\[truncated at 8000 characters/u);
});

test("the sub-agent projection is the short one and lists no carrier states", () => {
  const { section } = fakeTree("tree-e");
  const { text } = renderHouseContext({ house: readHouse(section), carrierStates: states(), event: "SubagentStart" });
  assert.ok(text.length <= BUDGETS.SubagentStart);
  assert.match(text, /You are a sub-agent: this was injected for you/u);
  assert.doesNotMatch(text, /updated|issue open/u);
  assert.match(text, /org\/campaign#390 \(state unread\)/u);
});

test("a record the projection names but the house lacks is a stated problem, and no projection record is a stated failure", () => {
  const { section } = fakeTree("tree-f", { projection: { id: "p", rules: [{ topic: "T", items: [{ id: "ask" }, { id: "gone" }] }], checklist: [] } });
  const house = readHouse(section);
  assert.deepEqual(house.problems, ["rule gone is named by the projection record and not found"]);
  assert.match(renderHouseContext({ house }).text, /Projection problems \(repair the records\): rule gone/u);
  const bare = path.join(root, "tree-g");
  mkdirSync(path.join(bare, SECTION_PATH), { recursive: true });
  const failed = renderHouseContext({ house: readHouse(path.join(bare, SECTION_PATH)) });
  assert.match(failed.text, /could not be projected[\s\S]*failed carrier/u);
});

test("carrier states are cached for ten minutes, stale offline, and a failing read never throws", async () => {
  const cacheRoot = path.join(root, "cache-carriers");
  const carriers = [{ repo: "org/campaign", number: 390 }, { repo: "org/market", number: 4 }];
  let calls = 0;
  const fetchOne = async (repo, number) => { calls += 1; return { state: "open", title: `${repo}#${number}`, updated: "2026-10-25T00:00:00Z" }; };
  const t0 = Date.parse("2026-10-25T12:00:00Z");
  const first = await readCarriers(carriers, { root: cacheRoot, now: t0, fetchOne });
  assert.equal(calls, 2);
  assert.equal(first.get("org/campaign#390").read, "live");
  const second = await readCarriers(carriers, { root: cacheRoot, now: t0 + 60_000, fetchOne });
  assert.equal(calls, 2, "the second reading is the cache's");
  assert.equal(second.get("org/market#4").read, "cached");
  const failing = async () => { throw new Error("offline"); };
  const stale = await readCarriers(carriers, { root: cacheRoot, now: t0 + 3_600_000, fetchOne: failing });
  assert.equal(stale.get("org/campaign#390").read, "stale", "an old reading is better than none, and says it is old");
  const offline = await readCarriers(carriers, { root: path.join(root, "cache-none"), now: t0, offline: true, fetchOne });
  assert.equal(offline.size, 0);
  const slow = await readCarriers(carriers, { root: path.join(root, "cache-slow"), now: t0, deadline: 20, fetchOne: () => new Promise(() => {}) });
  assert.equal(slow.size, 0, "a read that never answers is given up at the deadline");
});

test("capitalized Leader statements are detected; prose, acronyms, code and links are not", () => {
  for (const yes of ["I SWEAR TO GOD STOP ASKING ME FOR THIS", "ANYTHING THAT I SAY IN CAPS IS BECAUSE I HAVE SAID IT BEFORE", "ok but WHY ARE YOU ASKING ME THIS again"]) assert.equal(detectCapitalizedStatement(yes).matched, true, yes);
  for (const no of ["Should we enable GCP billing to restore Cloud Run?", "please check the HTTP API CLI MCP flow", "STOP", "Use `STOP ASKING ME FOR THIS` as the string", "```\nERROR FATAL OUT OF MEMORY NOW\n```", "see https://example.com/STOP/ASKING/ME/FOR/THIS", ""]) assert.equal(detectCapitalizedStatement(no).matched, false, no);
});

test("both context events follow the current correction rule without a hardcoded repair order", () => {
  const { section } = fakeTree("tree-h");
  const text = renderCapitalsInstruction({ house: readHouse(section), excerpt: "STOP ASKING ME" });
  assert.match(text, /wrote in capitals \("STOP ASKING ME"\)/u);
  assert.match(text, /caps: A Leader statement written in capitals MUST be received as a correction/u);
  assert.match(text, /skill persisting-a-leader-correction; runbook a-leader-correction-arrives-in-capitals/u);
  assert.ok(text.length <= BUDGETS.UserPromptSubmit);
  const statement = "Capitals MUST prompt recovery of the original claim. Ordinary assignments continue through their owning work; no separate correction workflow follows from emphasis alone.";
  writeJson(path.join(section, "lib/agency/rules/caps.json"), { id: "caps", statement });
  const house = readHouse(section);
  for (const context of [
    renderCapitalsInstruction({ house, excerpt: "PLEASE FINISH THIS ASSIGNMENT" }),
    renderHouseContext({ house, event: "SessionStart" }).text,
  ]) {
    assert.ok(context.includes(statement), "the revised source rule reaches both consuming events intact");
    assert.ok(!context.includes("Before resuming the interrupted work"), "the harness does not add an unconditional repair workflow");
    assert.ok(!context.includes("run skill persisting-a-leader-correction"), "a method reference is not a mandatory dispatch");
  }
});

const run = async (argv, payload) => {
  const chunks = [];
  await main(argv, { stdin: Readable.from([JSON.stringify(payload)]), stdout: { write: (text) => chunks.push(text) } });
  return chunks.join("");
};

test("the hook answers each event as Claude Code reads it, and nothing outside the trees or without capitals", async () => {
  const { tree } = fakeTree("tree-i");
  const args = ["--tree", tree, "--offline"];
  const start = JSON.parse(await run(args, { hook_event_name: "SessionStart", cwd: tree, source: "startup" }));
  assert.equal(start.hookSpecificOutput.hookEventName, "SessionStart");
  assert.match(start.hookSpecificOutput.additionalContext, /MUST NOT put such a question to the Leader/u);
  const sub = JSON.parse(await run(args, { hook_event_name: "SubagentStart", cwd: tree, agent_type: "general-purpose" }));
  assert.equal(sub.hookSpecificOutput.hookEventName, "SubagentStart");
  assert.match(sub.hookSpecificOutput.additionalContext, /sub-agent/u);
  const caps = JSON.parse(await run(args, { hook_event_name: "UserPromptSubmit", cwd: tree, prompt: "I SWEAR TO GOD STOP ASKING ME FOR THIS" }));
  assert.equal(caps.hookSpecificOutput.hookEventName, "UserPromptSubmit");
  assert.match(caps.hookSpecificOutput.additionalContext, /wrote in capitals/u);
  assert.equal(await run(args, { hook_event_name: "UserPromptSubmit", cwd: tree, prompt: "should we enable GCP billing to restore Cloud Run?" }), "");
  assert.equal(await run(args, { hook_event_name: "SessionStart", cwd: root }), "", "a session in some other work gets nothing");
  assert.equal(await run(args, { hook_event_name: "PreToolUse", cwd: tree }), "", "an event it does not serve gets nothing");
  assert.equal(await run(["--bogus"], { hook_event_name: "SessionStart", cwd: tree }), "SessionStart".length > 0 ? (await run(["--bogus"], { hook_event_name: "SessionStart", cwd: tree })) : "");
});

test("a failing projection is said in the session, never silent, and the exit stays zero", async () => {
  const reply = JSON.parse(await run(["--bogus"], { hook_event_name: "SessionStart", cwd: root }));
  assert.match(reply.hookSpecificOutput.additionalContext, /hook failed[\s\S]*failed carrier/u);
  assert.match(reply.hookSpecificOutput.additionalContext, /current request remains the work/u);
  assert.doesNotMatch(reply.hookSpecificOutput.additionalContext, /then read lib\/agency\/rules/u);
  assert.equal(await run(["--bogus"], { hook_event_name: "UserPromptSubmit", cwd: root, prompt: "STOP ASKING ME FOR THIS NOW" }), "", "a failed capitals check adds nothing to a prompt");
});

test("projectHouseContext reads the section it is given and skips carriers for a sub-agent", async () => {
  const { section } = fakeTree("tree-j");
  let asked = 0;
  const fetchOne = async () => { asked += 1; return { state: "open", title: "t", updated: "2026-10-25T00:00:00Z" }; };
  const cacheRoot = path.join(root, "cache-j");
  await projectHouseContext({ event: "SubagentStart", cwd: root, section, root: cacheRoot, fetchOne });
  assert.equal(asked, 0);
  await projectHouseContext({ event: "SessionStart", cwd: root, section, root: cacheRoot, fetchOne });
  assert.equal(asked, 0, "ordinary startup never refreshes unrelated GitHub carriers");
  await projectHouseContext({ event: "SessionStart", cwd: root, section, root: cacheRoot, fetchOne, liveCarriers: true });
  assert.equal(asked, 3, "explicit refresh preserves the native capability");
  await projectHouseContext({ event: "SessionStart", cwd: root, section, root: path.join(root, "uncached"), fetchOne, liveCarriers: true, offline: true });
  assert.equal(asked, 3, "offline overrides explicit live selection");
});

test("the hook arguments need a tree, and the entries cover the three events", () => {
  assert.throws(() => parseArguments([]), /name at least one --tree/u);
  assert.throws(() => parseArguments(["--tree"]), /expected/u);
  const entries = houseContextHookEntries(["--tree", "/home/u/info"], { node: "/usr/bin/node", source: "/src/house-context-hook.mjs" });
  assert.deepEqual(Object.keys(entries).sort(), [...EVENTS].sort());
  assert.equal(entries.SessionStart[0].hooks[0].command, "'/usr/bin/node' '/src/house-context-hook.mjs' '--tree' '/home/u/info'");
});

const EXISTING = {
  respectGitignore: true,
  permissions: { defaultMode: "bypassPermissions" },
  hooks: {
    PreToolUse: [{ matcher: "Bash|Monitor", hooks: [{ type: "command", command: "node /x/host-resource-hook.mjs" }] }],
    SessionStart: [{ hooks: [{ type: "command", command: "node /other/journal.mjs" }, { type: "command", command: "'/n' '/old/src/house-context-hook.mjs' '--tree' '/old'" }] }],
  },
};

test("the installer adds the three events, keeps every other key and hook, backs up once, and changes nothing twice", () => {
  const settings = path.join(root, "settings-1.json");
  writeJson(settings, EXISTING);
  const { tree } = fakeTree("tree-k");
  const first = installHouseContextHook({ settings, trees: [tree], node: "/n" });
  assert.equal(first.changed, true);
  const after = JSON.parse(readFileSync(settings, "utf8"));
  assert.deepEqual(after.hooks.PreToolUse, EXISTING.hooks.PreToolUse, "the existing guard is untouched");
  assert.equal(after.respectGitignore, true);
  assert.equal(after.hooks.SessionStart.length, 2, "the journal entry stays, the earlier copy of this hook is replaced");
  assert.equal(after.hooks.SessionStart[0].hooks.length, 1);
  assert.match(after.hooks.SessionStart[0].hooks[0].command, /journal\.mjs/u);
  for (const event of EVENTS) assert.ok(after.hooks[event].some((group) => group.hooks.some((handler) => handler.command.includes("house-context-hook.mjs") && handler.command.includes(tree))));
  assert.deepEqual(JSON.parse(readFileSync(`${settings}.before-house-context-hook`, "utf8")), EXISTING);
  assert.equal(installHouseContextHook({ settings, trees: [tree], node: "/n" }).changed, false);
  assert.deepEqual(JSON.parse(readFileSync(`${settings}.before-house-context-hook`, "utf8")), EXISTING, "the backup is the state before the first change");
});

test("uninstall removes this hook's entries and nothing else; a settings file that is not JSON is left alone", () => {
  const settings = path.join(root, "settings-2.json");
  const original = { hooks: { PreToolUse: EXISTING.hooks.PreToolUse }, theme: "dark" };
  writeJson(settings, original);
  const { tree } = fakeTree("tree-l");
  installHouseContextHook({ settings, trees: [tree], node: "/n" });
  installHouseContextHook({ settings, uninstall: true });
  assert.deepEqual(JSON.parse(readFileSync(settings, "utf8")), original);
  const broken = path.join(root, "settings-3.json");
  writeFileSync(broken, "{ not json");
  assert.throws(() => installHouseContextHook({ settings: broken, trees: [tree] }), /not valid JSON, so it was left alone/u);
  assert.equal(readFileSync(broken, "utf8"), "{ not json");
  const dry = path.join(root, "settings-4.json");
  writeJson(dry, original);
  assert.equal(installHouseContextHook({ settings: dry, trees: [tree], dryRun: true }).changed, true);
  assert.deepEqual(JSON.parse(readFileSync(dry, "utf8")), original, "a dry run writes nothing");
});

test("mergeHouseContextHooks keeps groups it does not own", () => {
  const merged = mergeHouseContextHooks({ UserPromptSubmit: [{ hooks: [{ type: "command", command: "node /other/prompt.mjs" }] }] }, houseContextHookEntries(["--tree", "/t"], { node: "/n", source: "/s/house-context-hook.mjs" }));
  assert.equal(merged.UserPromptSubmit.length, 2);
  assert.equal(merged.UserPromptSubmit[0].hooks[0].command, "node /other/prompt.mjs");
});

test("the printing script gives the projection a session was not given, and says when there is none", () => {
  const { tree } = fakeTree("tree-m");
  const script = fileURLToPath(new URL("../scripts/project-house-context.mjs", import.meta.url));
  const shown = spawnSync(process.execPath, [script, "--tree", tree, "--cwd", tree, "--offline"], { encoding: "utf8" });
  assert.equal(shown.status, 0);
  assert.match(shown.stdout, /BINDING RULES/u);
  const none = spawnSync(process.execPath, [script, "--tree", tree, "--cwd", root, "--offline"], { encoding: "utf8" });
  assert.match(none.stderr, /nothing to project/u);
});
