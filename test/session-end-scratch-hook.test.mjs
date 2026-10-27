// session-end-scratch-hook.test: the SessionEnd event hands an ended session to the codex-home service's
// `retire` entrance; the hook itself removes nothing, waits for nothing and never fails a session.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { once } from "node:events";
import { scratchRoot } from "./support/scratch.mjs";
import path from "node:path";
import { Readable } from "node:stream";

import { handleSessionEnd, main, mergeSessionEndHooks, parseArguments, sessionEndHookEntries, sessionProcess } from "../src/session-end-scratch-hook.mjs";
import { installSessionEndScratchHook } from "../scripts/install-session-end-scratch-hook.mjs";

const root = mkdtempSync(path.join(scratchRoot(), "session-end-scratch-"));
process.on("exit", () => rmSync(root, { recursive: true, force: true }));
const SID = "aaaaaaaa-1111-4111-8111-111111111111";
const options = parseArguments(["--codex-home", "/svc/codex-home.mjs", "--parameters", "/svc/record.json", "--node", "/bin/node"]);
const payload = (extra = {}) => ({ hook_event_name: "SessionEnd", session_id: SID, reason: "prompt_input_exit", ...extra });

test("a SessionEnd hands the session id and its process id to retire, nothing else", () => {
  const started = [];
  const result = handleSessionEnd(payload(), options, { start: (command, args) => started.push([command, args]), find: () => 4242 });
  assert.equal(result.started, true);
  assert.deepEqual(started, [["/bin/node", ["/svc/codex-home.mjs", "retire", "--parameters=/svc/record.json", `--session=${SID}`, "--after-pid=4242"]]]);
  const none = [];
  handleSessionEnd(payload(), options, { start: (c, a) => none.push(a), find: () => null });
  assert.ok(!none[0].some((a) => a.startsWith("--after-pid")));
});

test("other events, a /clear or resume, and ids that are not plain names start nothing", () => {
  const start = () => assert.fail("must not start");
  for (const bad of [{ hook_event_name: "Stop" }, { reason: "clear" }, { reason: "resume" }, { session_id: "../x" }, { session_id: undefined }, { session_id: "a b" }])
    assert.equal(handleSessionEnd(payload(bad), options, { start, find: () => 1 }).started, false);
});

test("the process carrying the session id is found from the command lines", async () => {
  const child = spawn(process.execPath, ["-e", "setTimeout(() => {}, 60000)", "--", `--session-id=${SID}`], { stdio: "ignore" });
  const resumed = spawn(process.execPath, ["-e", "setTimeout(() => {}, 60000)", "--", "--resume", "bbbbbbbb-2222-4222-8222-222222222222"], { stdio: "ignore" });
  try {
    await Promise.all([once(child, "spawn"), once(resumed, "spawn")]);
    assert.equal(sessionProcess(SID), child.pid);
    assert.equal(sessionProcess("bbbbbbbb-2222-4222-8222-222222222222"), resumed.pid);
    assert.equal(sessionProcess("cccccccc-3333-4333-8333-333333333333"), null);
  } finally { child.kill("SIGKILL"); resumed.kill("SIGKILL"); await Promise.all([once(child, "exit"), once(resumed, "exit")]); }
});

test("the hook as a command exits quietly on any input, and starts the entrance for a SessionEnd", async () => {
  await main(["--codex-home", "/svc/x.mjs", "--parameters", "/svc/r.json"], { stdin: Readable.from(["not json"]) });
  await main([], { stdin: Readable.from([JSON.stringify(payload())]) });
  const marker = path.join(root, "ran.json");
  const fake = path.join(root, "codex-home.mjs");
  writeFileSync(fake, `import {writeFileSync} from 'node:fs';writeFileSync(${JSON.stringify(marker)}, JSON.stringify(process.argv.slice(2)));`);
  await main(["--codex-home", fake, "--parameters", "/svc/r.json"], { stdin: Readable.from([JSON.stringify(payload())]) });
  for (let i = 0; i < 100; i += 1) { try { readFileSync(marker); break; } catch { await new Promise((r) => setTimeout(r, 50)); } }
  assert.deepEqual(JSON.parse(readFileSync(marker, "utf8")), ["retire", "--parameters=/svc/r.json", `--session=${SID}`]);
});

test("installing keeps unrelated hooks, replaces its own entry, and uninstalls cleanly", () => {
  const settings = path.join(root, "settings.json");
  const other = { hooks: [{ type: "command", command: "echo keep" }] };
  writeFileSync(settings, JSON.stringify({ model: "x", hooks: { SessionEnd: [other], SessionStart: [other] } }));
  const installDir = path.join(root, "installed-hook");
  const args = { settings, codexHome: "/svc/codex-home.mjs", parameters: "/svc/r.json", node: "/bin/node", installDir };
  assert.equal(installSessionEndScratchHook({ ...args, dryRun: true }).changed, true);
  assert.equal(JSON.parse(readFileSync(settings, "utf8")).hooks.SessionEnd.length, 1);
  assert.equal(installSessionEndScratchHook(args).changed, true);
  assert.equal(installSessionEndScratchHook(args).changed, false);
  const written = JSON.parse(readFileSync(settings, "utf8"));
  assert.equal(written.model, "x");
  assert.deepEqual(written.hooks.SessionStart, [other]);
  assert.equal(written.hooks.SessionEnd.length, 2);
  assert.match(written.hooks.SessionEnd[1].hooks[0].command, new RegExp(`${installDir}/session-end-scratch-hook\\.mjs`));
  assert.match(readFileSync(path.join(installDir, "session-end-scratch-hook.mjs"), "utf8"), /handleSessionEnd/);
  assert.equal(installSessionEndScratchHook({ ...args, uninstall: true }).changed, true);
  assert.deepEqual(JSON.parse(readFileSync(settings, "utf8")).hooks.SessionEnd, [other]);
  writeFileSync(settings, "{ not json");
  assert.throws(() => installSessionEndScratchHook(args), /left alone/);
  assert.equal(readFileSync(settings, "utf8"), "{ not json");
});

test("merge and entries are pure", () => {
  const entries = sessionEndHookEntries(["--codex-home", "/a/b.mjs", "--parameters", "/a/r.json"], { node: "/bin/node", source: "/h/src/session-end-scratch-hook.mjs" });
  assert.equal(mergeSessionEndHooks(undefined, entries).SessionEnd.length, 1);
  assert.throws(() => parseArguments(["--codex-home", "rel.mjs", "--parameters", "/a"]), /absolute/);
});
