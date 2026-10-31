import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getChecksReadout, readChecksCache, spawnChecksRefresh } from "../scripts/emit-claude-per-turn-duty.mjs";

function fakeSpawn(calls) {
  return (command, args, options) => {
    calls.push({ command, args, options });
    return { unref() { calls.at(-1).unrefCalled = true; } };
  };
}

function writeCache(cachePath, readout, cachedAt) {
  writeFileSync(cachePath, JSON.stringify({ cachedAt: cachedAt.toISOString(), readout }, null, 2));
}

test("readChecksCache returns null when no cache file exists", () => {
  const scratch = mkdtempSync(join(tmpdir(), "checkout-health-cache-"));
  try {
    assert.equal(readChecksCache({ cachePath: join(scratch, "missing.json") }), null);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
});

test("readChecksCache returns null on unparseable content instead of throwing", () => {
  const scratch = mkdtempSync(join(tmpdir(), "checkout-health-cache-"));
  try {
    const cachePath = join(scratch, "cache.json");
    writeFileSync(cachePath, "not json");
    assert.equal(readChecksCache({ cachePath }), null);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
});

test("getChecksReadout serves a fresh (<10min) cache directly and never spawns a refresh", () => {
  const scratch = mkdtempSync(join(tmpdir(), "checkout-health-cache-"));
  try {
    const cachePath = join(scratch, "cache.json");
    const cachedAt = new Date("2026-09-02T12:00:00.000Z");
    writeCache(cachePath, { truncated: false, checked: 2, findings: [] }, cachedAt);
    const calls = [];
    const result = getChecksReadout({ cachePath, now: () => cachedAt.getTime() + 60_000, spawnFn: fakeSpawn(calls) });
    assert.deepEqual(result, { truncated: false, checked: 2, findings: [] });
    assert.equal(calls.length, 0, "a fresh cache must never trigger a background spawn");
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
});

test("getChecksReadout returns the stale reading and spawns exactly one detached refresh once past 10 minutes", () => {
  const scratch = mkdtempSync(join(tmpdir(), "checkout-health-cache-"));
  try {
    const cachePath = join(scratch, "cache.json");
    const cachedAt = new Date("2026-09-02T12:00:00.000Z");
    writeCache(cachePath, { truncated: false, checked: 1, findings: [] }, cachedAt);
    const calls = [];
    const result = getChecksReadout({ cachePath, now: () => cachedAt.getTime() + 11 * 60_000, spawnFn: fakeSpawn(calls) });
    assert.deepEqual(result, { truncated: false, checked: 1, findings: [] });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].options.detached, true);
    assert.equal(calls[0].unrefCalled, true);
    assert.ok(calls[0].args.includes("--refresh-checks-cache"));
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
});

test("getChecksReadout with no cache at all returns null, still spawns a refresh, never blocks", () => {
  const scratch = mkdtempSync(join(tmpdir(), "checkout-health-cache-"));
  try {
    const cachePath = join(scratch, "missing.json");
    const calls = [];
    const result = getChecksReadout({ cachePath, spawnFn: fakeSpawn(calls) });
    assert.equal(result, null);
    assert.equal(calls.length, 1);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
});

test("getChecksReadout with spawnRefresh:false never calls spawn even when stale or absent", () => {
  const scratch = mkdtempSync(join(tmpdir(), "checkout-health-cache-"));
  try {
    const cachePath = join(scratch, "missing.json");
    const calls = [];
    getChecksReadout({ cachePath, spawnRefresh: false, spawnFn: fakeSpawn(calls) });
    assert.equal(calls.length, 0);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
});

test("spawnChecksRefresh invokes node on this file with --refresh-checks-cache, the root, detached and unreffed", () => {
  const calls = [];
  spawnChecksRefresh({ root: "/repo", cachePath: "/tmp/x.json", timeoutMs: 5000, spawnFn: fakeSpawn(calls) });
  assert.equal(calls.length, 1);
  const [call] = calls;
  assert.equal(call.command, process.execPath);
  assert.ok(call.args[0].endsWith("emit-claude-per-turn-duty.mjs"));
  assert.deepEqual(call.args.slice(1), ["--refresh-checks-cache", "--root", "/repo", "--cache-path", "/tmp/x.json", "--timeout-ms", "5000"]);
  assert.equal(call.options.detached, true);
  assert.equal(call.options.stdio, "ignore");
  assert.equal(call.unrefCalled, true);
});
