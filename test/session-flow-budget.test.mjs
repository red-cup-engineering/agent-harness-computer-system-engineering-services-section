import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import { recoverHarnessSession, runHarnessSession } from "../src/carrier/session.mjs";
import { scratchRoot } from "./support/scratch.mjs";

/** A dialect whose turns draw `usage` tokens, fail transiently or leave a result owed as the test says. */
function fixtureDialect({ budget, usage = { output_tokens: 10 }, transient = () => false, unfinished, readQuota } = {}) {
  return Object.freeze({
    name: "fixture", label: "fixture", unit: "fixture-task", pool: "fixture-flow", reservationKind: "fixture-provider-turn", environment: [],
    ...(budget === undefined ? {} : { budget }),
    startArguments: () => ["start"], resumeArguments: () => ["resume"],
    transient, startupFailure: () => false,
    ...(unfinished === undefined ? {} : { unfinished }),
    ...(readQuota === undefined ? {} : { readQuota }),
    readSession(directory) {
      const read = (name) => existsSync(path.join(directory, name)) ? readFileSync(path.join(directory, name), "utf8") : undefined;
      const events = (read("events.jsonl") ?? "").trim().split("\n").filter(Boolean).map(JSON.parse);
      const quota = read("quota.txt");
      return { thread: events[0]?.thread_id, usage, message: read("last-message.txt")?.trim(), errors: [], ...(quota === undefined ? {} : { allowance: { quota: quota.trim() } }) };
    },
  });
}

/** A systemd-run stand-in: every launch completes at once with `exit`, and is counted. */
function launcher(exit = () => 0) {
  const launches = [];
  const systemRunner = async (command, args) => {
    assert.equal(command, "systemd-run");
    const [, , , , input, eventsFile, stderrFile, lastFile, exitFile] = args.slice(args.indexOf("--") + 1);
    launches.push(input);
    mkdirSync(path.dirname(eventsFile), { recursive: true });
    writeFileSync(eventsFile, '{"thread_id":"thread-1"}\n');
    writeFileSync(stderrFile, "");
    writeFileSync(lastFile, "message\n");
    writeFileSync(exitFile, `${exit(launches.length)}\n`);
    return { exitCode: 0, stdout: "", stderr: "" };
  };
  return { systemRunner, launches };
}

const scratch = (t) => {
  const root = mkdtempSync(path.join(scratchRoot(), "session-flow-budget-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
};
const run = (dialect, root, extra) => runHarnessSession(dialect, { prompt: "do it", cwd: root, artifactDir: root, taskId: "task", timeoutMs: 100, retryDelaysMs: [0, 0, 0, 0, 0, 0], ...extra });

test("a session that keeps making progress stops when its turn budget is spent", async (t) => {
  const root = scratch(t);
  const { systemRunner, launches } = launcher();
  const dialect = fixtureDialect({ unfinished: () => ({ progress: 5 }) });
  const result = await run(dialect, root, { systemRunner, budget: { turns: 3, tokens: 1_000_000 } });
  assert.equal(launches.length, 3);
  assert.equal(result.budgetSpent, true);
  assert.equal(result.ok, false);
  assert.match(result.errors.at(-1), /3 of 3 turns/u);
});

test("a session stops when its token budget is spent", async (t) => {
  const root = scratch(t);
  const { systemRunner, launches } = launcher();
  const dialect = fixtureDialect({ usage: { input_tokens: 300, output_tokens: 100 }, unfinished: () => ({ progress: 1 }) });
  const result = await run(dialect, root, { systemRunner, budget: { turns: 50, tokens: 1000 } });
  assert.equal(launches.length, 3);
  assert.match(result.errors.at(-1), /1200 of 1000 tokens/u);
});

test("the zero-progress rule still ends a stalled session before its budget", async (t) => {
  const root = scratch(t);
  const { systemRunner, launches } = launcher();
  const dialect = fixtureDialect({ unfinished: () => ({ progress: 0 }) });
  const result = await run(dialect, root, { systemRunner, budget: { turns: 50, tokens: 1_000_000 } });
  assert.equal(launches.length, 2);
  assert.match(result.errors.at(-1), /stalled/u);
  assert.equal(result.budgetSpent, undefined);
});

test("the transient-fault resume loop stops at the budget too", async (t) => {
  const root = scratch(t);
  const { systemRunner, launches } = launcher(() => 1);
  const dialect = fixtureDialect({ transient: (result) => result.exitCode !== 0 });
  const result = await run(dialect, root, { systemRunner, budget: { turns: 2, tokens: 1_000_000 } });
  assert.equal(launches.length, 2);
  assert.equal(result.budgetSpent, true);
});

test("a recovery of the same task does not open a new budget", async (t) => {
  const root = scratch(t);
  const { systemRunner, launches } = launcher();
  const dialect = fixtureDialect({ unfinished: () => ({ progress: 1 }) });
  await run(dialect, root, { systemRunner, budget: { turns: 2, tokens: 1_000_000 } });
  assert.equal(launches.length, 2);
  const again = await run(dialect, root, { systemRunner, budget: { turns: 2, tokens: 1_000_000 } });
  assert.equal(launches.length, 2, "no turn is launched for a spent task");
  assert.equal(again.budgetSpent, true);
  // The turn directories hold the first run's evidence only.
  assert.equal(readdirSync(path.join(root, "turns")).length, 1);
  assert.equal(JSON.parse(readFileSync(path.join(root, "session-budget.json"), "utf8")).turns, 2);
});

test("a session without a budget takes its dialect's, and one with neither is refused before it starts", async (t) => {
  const root = scratch(t);
  const { systemRunner, launches } = launcher();
  const configured = fixtureDialect({ budget: { turns: 2, tokens: 1_000_000 }, unfinished: () => ({ progress: 1 }) });
  await run(configured, root, { systemRunner });
  assert.equal(launches.length, 2);
  const bare = fixtureDialect({});
  await assert.rejects(run(bare, scratch(t), { systemRunner }), /finite turns budget/u);
  assert.equal(launches.length, 2);
});

test("recovering an interrupted task with a spent budget launches nothing", async (t) => {
  const root = scratch(t);
  const { systemRunner, launches } = launcher();
  const dialect = fixtureDialect({ budget: { turns: 1, tokens: 10 } });
  await run(dialect, root, { systemRunner });
  assert.equal(launches.length, 1);
  const turn = path.join(root, "turns", "turn-000001");
  rmSync(path.join(turn, "exit-code"));
  const recovered = await recoverHarnessSession(dialect, { artifactDir: root, taskId: "task", cwd: root, timeoutMs: 100,
    systemRunner: async (command, args) => command === "systemctl" ? { exitCode: 0, stdout: "LoadState=not-found\nActiveState=inactive\n", stderr: "" } : launcher().systemRunner(command, args) });
  assert.equal(launches.length, 1);
  assert.equal(recovered?.budgetSpent, true);
});

test("the stated windows a dialect reads after a session come back on the session for the ledger", async (t) => {
  const root = scratch(t);
  const { systemRunner } = launcher();
  const seen = [];
  const dialect = fixtureDialect({ budget: { turns: 2, tokens: 1000 }, readQuota: async (options) => { seen.push(options.cwd); return "week\t91%\n"; } });
  const result = await run(dialect, root, { systemRunner });
  assert.deepEqual(result.allowance, { quota: "week\t91%" });
  assert.deepEqual(seen, [root]);
  assert.equal(readFileSync(path.join(result.artifactDir, "quota.txt"), "utf8"), "week\t91%\n");
  // A quota that cannot be read leaves the session as it ended.
  const failing = fixtureDialect({ budget: { turns: 2, tokens: 1000 }, readQuota: async () => { throw new Error("agy absent"); } });
  const errors = console.error;
  console.error = () => {};
  try { assert.equal((await run(failing, scratch(t), { systemRunner })).ok, true); } finally { console.error = errors; }
});
