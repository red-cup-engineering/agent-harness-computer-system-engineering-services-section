import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { heavyLockStatus, serializedCommand, shellQuote } from "../src/host-resource-hook.mjs";

const hook = fileURLToPath(new URL("../src/host-resource-hook.mjs", import.meta.url));
const tick = () => new Promise(resolve => setTimeout(resolve, 20));
async function until(read, accept) {
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) { const value = read(); if (accept(value)) return value; await tick(); }
  assert.fail("native lock evidence did not arrive");
}
async function fixture(t) {
  const root = mkdtempSync(path.join(tmpdir(), "host-resource-status-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const lock = path.join(root, "agent-heavy.lock");
  writeFileSync(lock, "");
  const child = spawn("flock", ["-x", lock, process.execPath, "-e",
    'process.stdout.write("ready"); process.stdin.resume()', "not-a-real-secret"], { stdio: ["pipe", "pipe", "pipe"] });
  t.after(async () => { child.stdin.end(); if (child.exitCode === null) await once(child, "close"); });
  await once(child.stdout, "data");
  return { root, lock, child };
}

test("native kernel testimony identifies only the exact held slot and queued waiter, without argv", { timeout: 10000 }, async t => {
  const { root, lock, child } = await fixture(t);
  const waiter = spawn("flock", ["-x", "-w", "5", lock, "true"], { stdio: "ignore" });
  t.after(async () => { child.stdin.end(); if (waiter.exitCode === null) await once(waiter, "close"); });
  const other = path.join(root, "other.lock"); writeFileSync(other, "");
  const before = statSync(lock);
  const received = await until(() => heavyLockStatus([lock, other]), reading =>
    reading.locks[0].processes?.some(p => p.role === "waiter" && p.pid === waiter.pid));
  const held = received.locks[0];
  assert.equal(held.inode, String(before.ino));
  assert.equal(held.device, String(before.dev));
  const owner = held.processes.find(p => p.role === "holder" && p.pid === child.pid);
  assert.equal(owner.state, "observed");
  assert.match(owner.startTicks, /^\d+$/u);
  assert.equal(owner.command.executable, "flock");
  assert.ok(owner.cgroup.length > 0);
  assert.equal(owner.children[0].command.executable, "node");
  assert.doesNotMatch(JSON.stringify(received), /not-a-real-secret|process\.stdout/u);
  assert.equal(received.locks[1].state, "free-at-snapshot");
  assert.equal(statSync(lock).ino, before.ino, "diagnostics keep the original lock inode");
  child.stdin.end();
});

test("the original busy rewrite emits kernel context, preserves refusal and never runs the command", { timeout: 10000 }, async t => {
  const { lock } = await fixture(t);
  const wrapped = serializedCommand("printf should-not-run", { lock, wait: 0.1, nice: false, ionice: false });
  const child = spawn("bash", ["-c", wrapped], { stdio: ["ignore", "pipe", "pipe"] });
  let stdout = "", stderr = "";
  child.stdout.on("data", b => { stdout += b; }); child.stderr.on("data", b => { stderr += b; });
  const [code] = await once(child, "close");
  assert.equal(code, 75);
  assert.equal(stdout, "");
  assert.match(stderr, /this command did not run/u);
  const receipt = JSON.parse(stderr.trim().split("\n").at(-1));
  assert.equal(receipt.kind, "agent-heavy.lock-status.v1");
  assert.equal(receipt.locks[0].state, "contended-or-held");
  assert.doesNotMatch(stderr, /not-a-real-secret|process\.stdout/u);
});

test("the native read-only CLI preserves missing and substituted slot uncertainty", { timeout: 10000 }, async t => {
  const { root, lock } = await fixture(t);
  const linked = path.join(root, "linked.lock"); symlinkSync(lock, linked);
  const child = spawn(process.execPath, [hook, "--lock-status", path.join(root, "absent"), linked], { stdio: ["ignore", "pipe", "pipe"] });
  let stdout = "", stderr = "";
  child.stdout.on("data", b => { stdout += b; }); child.stderr.on("data", b => { stderr += b; });
  const [code] = await once(child, "close");
  assert.equal(code, 0); assert.equal(stderr, "");
  assert.deepEqual(JSON.parse(stdout).locks.map(x => x.state), ["slot-unavailable", "slot-unavailable"]);
  assert.throws(() => heavyLockStatus(Array(17).fill(lock)), /sixteen/u);
  assert.equal(heavyLockStatus([lock], { procRoot: path.join(root, "unknown-proc") }).state, "kernel-locks-unavailable");
});

test("the shared process budget includes holder children and marks omitted testimony incomplete", t => {
  const root = mkdtempSync(path.join(tmpdir(), "host-resource-budget-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const lock = path.join(root, "agent-heavy.lock"); writeFileSync(lock, "");
  const procRoot = path.join(root, "proc"); mkdirSync(procRoot);
  const s = statSync(lock, { bigint: true });
  const major = ((s.dev >> 8n) & 0xfffn) | ((s.dev >> 32n) & 0xfffff000n);
  const minor = (s.dev & 0xffn) | ((s.dev >> 12n) & 0xffffff00n);
  const coordinate = `${major.toString(16)}:${minor.toString(16)}:${s.ino}`;
  writeFileSync(path.join(procRoot, "locks"), `1: FLOCK ADVISORY WRITE 100 ${coordinate} 0 EOF\n2: FLOCK ADVISORY WRITE 200 ${coordinate} 0 EOF\n2: -> FLOCK ADVISORY WRITE 300 ${coordinate} 0 EOF\n`);
  for (const pid of [100, 101, 102, 103, 104, 200, 201, 202]) {
    const directory = path.join(procRoot, String(pid)); mkdirSync(path.join(directory, "task", String(pid)), { recursive: true });
    const fields = Array(22).fill("0"); fields[19] = String(pid * 10);
    writeFileSync(path.join(directory, "stat"), `${pid} (node) ${fields.join(" ")}`);
    writeFileSync(path.join(directory, "cmdline"), "node\0--test\0secret-omitted\0");
    writeFileSync(path.join(directory, "cgroup"), "0::/receiving");
    writeFileSync(path.join(directory, "task", String(pid), "children"), pid === 100 ? "101 102 103 104" : pid === 200 ? "201 202 203 204" : "");
  }
  const received = heavyLockStatus([lock], { procRoot });
  const rows = received.locks[0].processes;
  assert.equal(rows.flatMap(row => [row, ...(row.children ?? [])]).filter(row => row.state === "observed").length, 8);
  assert.equal(rows[1].childrenComplete, false);
  assert.equal(rows[2].state, "process-budget-exhausted");
  assert.equal(received.locks[0].complete, false);
  assert.doesNotMatch(JSON.stringify(received), /secret-omitted/u);
});
