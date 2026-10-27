// HK1 (content/text/documents/specifications/2026-10-19-observability.md): a scope that will not start leaves a record of why and of the user manager's state.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { scratchRoot } from "./support/scratch.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { dataKindDirectory } from "@red-cup-engineering/eavt-services-section/data-artifact-address";
import { containedCommand } from "../src/host-resource-hook.mjs";
import { recordScopeFailure, userManagerState } from "../src/scope-failure-record.mjs";
import { getBlob, readTrace, traces } from "@red-cup-engineering/semiotic-eavt-services-section/telemetry-store";

const root = realpathSync(mkdtempSync(path.join(scratchRoot(), "scope-failure-")));
after(() => rmSync(root, { recursive: true, force: true }));
const RECORDER = { node: process.execPath, script: fileURLToPath(new URL("../src/scope-failure-record.mjs", import.meta.url)) };
const REFUSAL = "Failed to start transient scope unit: Transport endpoint is not connected";

const fakeBin = path.join(root, "bin");
mkdirSync(fakeBin);
writeFileSync(path.join(fakeBin, "systemd-run"), ["#!/bin/sh", `[ -z "$FAKE_SYSTEMD_RUN_FAIL" ] || { echo "${REFUSAL}" >&2; exit 1; }`, 'while [ $# -gt 0 ] && [ "$1" != "--" ]; do shift; done', "shift", 'exec "$@"', ""].join("\n"), { mode: 0o755 });

/** A user manager as the kernel showed it under the throttle: systemd in uninterruptible sleep, memory.high reached. */
function fixture() {
  const proc = path.join(root, `proc-${Math.random().toString(36).slice(2)}`), cgroup = path.join(root, `cg-${Math.random().toString(36).slice(2)}`);
  const service = path.join(cgroup, "user.slice", "user-1000.slice", "user@1000.service");
  mkdirSync(path.join(service, "init.scope"), { recursive: true });
  mkdirSync(path.join(proc, "4242"), { recursive: true });
  mkdirSync(path.join(proc, "pressure"));
  writeFileSync(path.join(service, "init.scope", "cgroup.procs"), "4242\n");
  writeFileSync(path.join(proc, "4242", "stat"), "4242 (systemd) D 1 4242 4242 0 -1 4194560 100 0 0 0 1 1 0 0 20 0 1 0 100 1000 100 18446744073709551615\n");
  for (const [file, value] of Object.entries({ "memory.high": "1073741824", "memory.current": "1073741824", "memory.max": "max", "pids.current": "212", "memory.events": "low 0\nhigh 351786\nmax 0\noom 0\noom_kill 0\n" })) writeFileSync(path.join(service, file), `${value}\n`);
  writeFileSync(path.join(proc, "pressure", "memory"), "some avg10=61.20 avg60=40.00 avg300=20.00 total=99\nfull avg10=40.00 avg60=20.00 avg300=10.00 total=50\n");
  writeFileSync(path.join(proc, "meminfo"), "MemTotal:       12054528 kB\nMemAvailable:     210944 kB\n");
  return { proc, cgroup, env: { XDG_RUNTIME_DIR: root } };
}
const keys = (message) => Object.fromEntries(message.body.attributes.map((a) => [a.key, a.value]));
const kv = (value, ...names) => names.reduce((at, key) => at.kvlistValue.values.find((item) => item.key === key).value, value);

test("hk1-positive: a scope that fails with a dead user manager leaves systemd-run's words, its status and the manager's state, and the command still runs", () => {
  const runtime = mkdtempSync(path.join(root, "run-"));
  const section = path.join(root, "section-positive"), store = dataKindDirectory(section, "state", "containment-telemetry");
  const result = spawnSync("bash", ["-c", `${containedCommand(`printf '%s\\n' "it ran"; exit 3`, { recorder: RECORDER })}; echo "rc=$?"`], { encoding: "utf8", env: { ...process.env, PATH: `${fakeBin}:${process.env.PATH}`, XDG_RUNTIME_DIR: runtime, FAKE_SYSTEMD_RUN_FAIL: "1", AGENT_HARNESS_SECTION_ROOT: section } });
  assert.equal(result.stdout, "it ran\nrc=3\n", result.stderr);
  assert.match(result.stderr, new RegExp(REFUSAL, "u"), "the refusal is still shown");
  assert.deepEqual(readdirSync(runtime), [], "no marker or error file is left behind");
  const [{ traceId }] = [...traces(store)];
  const [message] = readTrace(store, traceId).messages;
  const a = keys(message);
  assert.equal(a["process.exit.code"].intValue, "1");
  assert.equal(a["error.type"].stringValue, "exit:1");
  assert.equal(a["process.command"].stringValue, "systemd-run");
  assert.ok(a["semioverse.user_manager"].kvlistValue.values.some((item) => item.key === "manager"), "the record names the manager's state");
  assert.ok(a["semioverse.user_manager"].kvlistValue.values.some((item) => item.key === "cgroup"), "and its cgroup");
  const stderr = a["semioverse.process.stderr.id"].stringValue;
  assert.equal(Buffer.from(getBlob(store, stderr)).toString().trim(), REFUSAL);
});

test("hk1-positive (fixture): the record holds the manager in D state under its memory.high throttle", async () => {
  const f = fixture();
  const state = userManagerState({ env: f.env, proc: f.proc, cgroup: f.cgroup, uid: 1000 });
  assert.deepEqual(state.manager, { pid: 4242, state: "D" });
  assert.equal(state.cgroup["memory.high"], 1073741824);
  assert.equal(state.cgroup["memory.events"].high, 351786);
  assert.equal(state.memory.availableKiB, 210944);
  assert.match(state.pressure.memory, /^some avg10=61\.20/u);
  const errorFile = path.join(root, "err-fixture.txt");
  writeFileSync(errorFile, `${REFUSAL}\n`);
  const section = path.join(root, "section-fixture"), store = dataKindDirectory(section, "state", "containment-telemetry");
  const kept = await recordScopeFailure({ errorFile, status: "1", env: f.env, root: section, state });
  assert.equal(kept.stored, "telemetry");
  const [{ traceId }] = [...traces(store)];
  const a = keys(readTrace(store, traceId).messages[0]);
  assert.equal(kv(a["semioverse.user_manager"], "manager", "state").stringValue, "D");
  assert.equal(kv(a["semioverse.user_manager"], "cgroup", "memory.high").intValue, "1073741824");
  assert.equal(kv(a["semioverse.user_manager"], "cgroup", "memory.events", "high").intValue, "351786");
});

test("hk1-alternate: a scope that starts leaves no record and no file behind", () => {
  const runtime = mkdtempSync(path.join(root, "run-"));
  const section = path.join(root, "section-alternate"), store = dataKindDirectory(section, "state", "containment-telemetry");
  const result = spawnSync("bash", ["-c", `${containedCommand(`printf '%s\\n' "inside"; echo oops >&2; exit 2`, { recorder: RECORDER })}; echo "rc=$?"`], { encoding: "utf8", env: { ...process.env, PATH: `${fakeBin}:${process.env.PATH}`, XDG_RUNTIME_DIR: runtime, AGENT_HARNESS_SECTION_ROOT: section } });
  assert.equal(result.stdout, "inside\nrc=2\n", result.stderr);
  assert.equal(result.stderr, "oops\n", "the command's own standard error is untouched");
  assert.equal(existsSync(store), false);
  assert.deepEqual(readdirSync(runtime), []);
});

test("hk1-refusal: an unreadable manager state is recorded as unreadable with its reason, never as healthy, and a missing telemetry module falls back to a JSON line", async () => {
  const state = userManagerState({ env: {}, proc: path.join(root, "no-proc"), cgroup: path.join(root, "no-cgroup"), uid: 1000 });
  assert.deepEqual(state.manager, { unreadable: "ENOENT" });
  assert.deepEqual(state.cgroup["memory.high"], { unreadable: "ENOENT" });
  assert.deepEqual(state.bus, { unreadable: "XDG_RUNTIME_DIR unset" });
  const errorFile = path.join(root, "err-refusal.txt");
  writeFileSync(errorFile, `${REFUSAL}\n`);
  const section = path.join(root, "section-refusal"), store = dataKindDirectory(section, "state", "containment-telemetry");
  const kept = await recordScopeFailure({ errorFile, status: "1", env: {}, root: section, state, load: async () => { throw new Error("telemetry module not installed"); } });
  assert.equal(kept.stored, "jsonl");
  const line = JSON.parse(readFileSync(kept.file, "utf8").trim());
  assert.equal(line.attribute, "AgentHarnessScopeFailure");
  assert.equal(line.value.stderr.trim(), REFUSAL);
  assert.equal(line.value.exitStatus, 1);
  assert.equal(line.value.userManager.manager.unreadable, "ENOENT");
  assert.match(line.value.fallbackReason, /not installed/u);
  assert.ok(kept.file.startsWith(dataKindDirectory(section, "log", "scope-failure")), "the log is at the law's address under the section root");
  const unreadableError = await recordScopeFailure({ errorFile: path.join(root, "absent.txt"), status: "x", env: {}, root: section, state, load: async () => { throw new Error("no"); } });
  assert.equal(JSON.parse(readFileSync(unreadableError.file, "utf8").trim().split("\n").at(-1)).value.exitStatus, null);
});
