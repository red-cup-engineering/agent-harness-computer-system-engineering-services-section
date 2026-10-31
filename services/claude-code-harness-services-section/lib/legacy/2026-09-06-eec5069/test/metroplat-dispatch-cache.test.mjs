import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getDispatchReadout, readDispatchCache, spawnDispatchRefresh } from "../scripts/emit-claude-per-turn-duty.mjs";

function fakeSpawn(calls) {
  return (command, args, options) => {
    calls.push({ command, args, options });
    return { unref() { calls.at(-1).unrefCalled = true; } };
  };
}

function writeCache(cachePath, readout, cachedAt) {
  writeFileSync(cachePath, JSON.stringify({ cachedAt: cachedAt.toISOString(), readout }, null, 2));
}

test("readDispatchCache returns null when no cache file exists", () => {
  const scratch = mkdtempSync(join(tmpdir(), "metroplat-cache-"));
  try {
    assert.equal(readDispatchCache({ cachePath: join(scratch, "missing.json") }), null);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
});

test("readDispatchCache returns null on unparseable content instead of throwing", () => {
  const scratch = mkdtempSync(join(tmpdir(), "metroplat-cache-"));
  try {
    const cachePath = join(scratch, "cache.json");
    writeFileSync(cachePath, "not json");
    assert.equal(readDispatchCache({ cachePath }), null);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
});

test("getDispatchReadout serves a fresh (<10min) cache directly and never spawns a refresh", () => {
  const scratch = mkdtempSync(join(tmpdir(), "metroplat-cache-"));
  try {
    const cachePath = join(scratch, "cache.json");
    const cachedAt = new Date("2026-09-02T12:00:00.000Z");
    writeCache(cachePath, { ready: [{ scope: "a", text: "do a" }] }, cachedAt);
    const calls = [];
    const result = getDispatchReadout({ cachePath, now: () => cachedAt.getTime() + 60_000, spawnFn: fakeSpawn(calls) });
    assert.deepEqual(result.readout, { ready: [{ scope: "a", text: "do a" }] });
    assert.equal(result.note, "metroplat agent-work-dispatch cache is fresh");
    assert.equal(calls.length, 0, "a fresh cache must never trigger a background spawn");
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
});

test("getDispatchReadout returns the stale reading with a note and spawns exactly one detached refresh once past 10 minutes", () => {
  const scratch = mkdtempSync(join(tmpdir(), "metroplat-cache-"));
  try {
    const cachePath = join(scratch, "cache.json");
    const cachedAt = new Date("2026-09-02T12:00:00.000Z");
    writeCache(cachePath, { ready: [{ scope: "old", text: "stale item" }] }, cachedAt);
    const calls = [];
    const result = getDispatchReadout({ cachePath, now: () => cachedAt.getTime() + 11 * 60_000, spawnFn: fakeSpawn(calls) });
    assert.deepEqual(result.readout, { ready: [{ scope: "old", text: "stale item" }] });
    assert.match(result.note, /old; refresh spawned in background/);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].options.detached, true);
    assert.equal(calls[0].unrefCalled, true);
    assert.ok(calls[0].args.includes("--refresh-dispatch-cache"));
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
});

test("getDispatchReadout with no cache at all returns a null readout, still spawns a refresh, never blocks", () => {
  const scratch = mkdtempSync(join(tmpdir(), "metroplat-cache-"));
  try {
    const cachePath = join(scratch, "missing.json");
    const calls = [];
    const result = getDispatchReadout({ cachePath, spawnFn: fakeSpawn(calls) });
    assert.equal(result.readout, null);
    assert.match(result.note, /no cached metroplat agent-work-dispatch readout yet/);
    assert.equal(calls.length, 1);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
});

test("getDispatchReadout with spawnRefresh:false never calls spawn even when stale or absent", () => {
  const scratch = mkdtempSync(join(tmpdir(), "metroplat-cache-"));
  try {
    const cachePath = join(scratch, "missing.json");
    const calls = [];
    getDispatchReadout({ cachePath, spawnRefresh: false, spawnFn: fakeSpawn(calls) });
    assert.equal(calls.length, 0);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
});

test("spawnDispatchRefresh invokes node on this file with --refresh-dispatch-cache, detached and unreffed, never awaited", () => {
  const calls = [];
  spawnDispatchRefresh({ cachePath: "/tmp/x.json", timeoutMs: 5000, spawnFn: fakeSpawn(calls) });
  assert.equal(calls.length, 1);
  const [call] = calls;
  assert.equal(call.command, process.execPath);
  assert.ok(call.args[0].endsWith("emit-claude-per-turn-duty.mjs"));
  assert.deepEqual(call.args.slice(1), ["--refresh-dispatch-cache", "--cache-path", "/tmp/x.json", "--timeout-ms", "5000"]);
  assert.equal(call.options.detached, true);
  assert.equal(call.options.stdio, "ignore");
  assert.equal(call.unrefCalled, true);
});
