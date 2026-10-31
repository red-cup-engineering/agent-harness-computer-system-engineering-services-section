import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, appendFileSync } from "node:fs";
import { scratchRoot } from "./support/scratch.mjs";
import { join, dirname } from "node:path";
import test from "node:test";
import { dataArtifactAddress } from "@red-cup-engineering/eavt-services-section/data-artifact-address";
import { jsonToTerm } from "@red-cup-engineering/computer-data-engineering-services-section/semiotic-expression-notation/json-codec";
import {
  admitSetOfSessionEventArrivals,
  containsSecretLookingKey,
  findJournalFiles,
  loadCursor,
  rowToCloudEvent,
} from "../scripts/admit-set-of-session-event-arrivals.mjs";

const direct = (row) => ({ ...row, e: jsonToTerm(row.e), a: jsonToTerm(row.a), v: jsonToTerm(row.v) });

// A journal at its data-law address in a scratch tree, built per test: a committed file under a
// data/logs path is itself a log, and the log compactor seals it.
function journalTree(t) {
  const root = mkdtempSync(join(scratchRoot(), "session-event-journal-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const address = dataArtifactAddress({ root, tier: "log", encoding: "jsonl", at: "2026-09-01", action: "admit", subject: "witness-journal-seavt" });
  mkdirSync(dirname(address.path), { recursive: true });
  const observation = { actor: "actor:fixture", sessionDigest: "sha256:fixture", type: "BareCedarFogClaudeLifecycleObservation", version: 2 };
  const rows = [
    { e: "ni:///sha-256;fixture1", a: "lifecycle.UserPromptSubmit", v: { ...observation, event: "UserPromptSubmit", occurredAt: "2026-09-01T00:04:29.771Z", promptDigest: "sha256:fixture" }, t: "2026-09-01T00:04:29.771Z" },
    { e: "ni:///sha-256;fixture2", a: "lifecycle.Stop", v: { ...observation, event: "Stop", occurredAt: "2026-09-01T00:11:27.339Z" }, t: "2026-09-01T00:11:27.339Z" },
    { e: "ni:///sha-256;notlifecycle", a: "deployment", v: { note: "not a lifecycle row, must be skipped" }, t: "2026-09-01T00:12:00.000Z" },
    { e: "ni:///sha-256;fixture3", a: "lifecycle.SubagentStop", v: { actor: "actor:fixture", apiKey: "should-never-be-admitted", event: "SubagentStop" }, t: "2026-09-01T00:13:00.000Z" },
  ];
  writeFileSync(address.path, rows.map((row) => `${JSON.stringify(direct(row))}\n`).join(""));
  return { root, source: address.path.slice(root.length + 1) };
}

test("first run emits one CloudEvent per lifecycle row, skips non-lifecycle rows, and refuses secret-looking rows", async (t) => {
  const { root, source } = journalTree(t);
  const cursor = await loadCursor("/nonexistent/cursor.json");
  const { events, cursor: nextCursor } = await admitSetOfSessionEventArrivals({ logsRoot: root, repoRoot: root, cursor });
  // The journal has 4 rows: UserPromptSubmit, Stop (both lifecycle, admitted),
  // a non-lifecycle "deployment" row (skipped), and a lifecycle row whose
  // v carries "apiKey" (refused).
  assert.equal(events.length, 2);
  assert.deepEqual(events.map((event) => event.data.event), ["UserPromptSubmit", "Stop"]);
  const [event] = events;
  assert.equal(event.specversion, "1.0");
  assert.equal(event.type, "org.561-group.session-event.v1");
  assert.equal(event.source, source);
  assert.match(event.id, /^sha256:[0-9a-f]{64}$/u);
  assert.equal(Object.values(nextCursor.files)[0] > 0, true);
});

test("second run against the unchanged journal is idempotent and emits nothing new", async (t) => {
  const { root } = journalTree(t);
  const cursor = await loadCursor("/nonexistent/cursor.json");
  const first = await admitSetOfSessionEventArrivals({ logsRoot: root, repoRoot: root, cursor });
  const second = await admitSetOfSessionEventArrivals({ logsRoot: root, repoRoot: root, cursor: first.cursor });
  assert.equal(first.events.length, 2);
  assert.deepEqual(second.events, []);
});

test("a row appended after the cursor is admitted while prior rows are not re-admitted", async () => {
  const workDir = mkdtempSync(join(scratchRoot(), "session-event-arrivals-"));
  try {
    const filePath = dataArtifactAddress({ root: workDir, tier: "log", encoding: "jsonl", at: "2026-09-02", action: "admit", subject: "witness-journal-seavt" }).path;
    mkdirSync(dirname(filePath), { recursive: true });
    const direct = (row) => ({ ...row, e: jsonToTerm(row.e), a: jsonToTerm(row.a), v: jsonToTerm(row.v) });
    writeFileSync(filePath, `${JSON.stringify(direct({ a: "lifecycle.SessionStart", e: "ni:///sha-256;a", t: "2026-09-02T00:00:00.000Z", v: { event: "SessionStart" } }))}\n`);
    const first = await admitSetOfSessionEventArrivals({ logsRoot: workDir, repoRoot: workDir, cursor: await loadCursor("/nonexistent/cursor.json") });
    assert.equal(first.events.length, 1);

    appendFileSync(filePath, `${JSON.stringify(direct({ a: "lifecycle.UserPromptSubmit", e: "ni:///sha-256;b", t: "2026-09-02T00:01:00.000Z", v: { event: "UserPromptSubmit" } }))}\n`);
    const second = await admitSetOfSessionEventArrivals({ logsRoot: workDir, repoRoot: workDir, cursor: first.cursor });
    assert.equal(second.events.length, 1);
    assert.equal(second.events[0].data.event, "UserPromptSubmit");
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
});

test("containsSecretLookingKey finds token/secret/password/key names at any depth, case-insensitively", () => {
  assert.equal(containsSecretLookingKey({ ok: true }), false);
  assert.equal(containsSecretLookingKey({ apiKey: "x" }), true);
  assert.equal(containsSecretLookingKey({ nested: { AUTH_TOKEN: "x" } }), true);
  assert.equal(containsSecretLookingKey({ list: [{ password: "x" }] }), true);
  assert.equal(containsSecretLookingKey({ sessionDigest: "sha256:abc" }), false);
});

test("findJournalFiles returns [] for a missing root instead of throwing", () => {
  assert.deepEqual(findJournalFiles("/nonexistent/root"), []);
});

test("rowToCloudEvent falls back to the epoch when t is missing or unparseable", () => {
  const event = rowToCloudEvent("a/b.jsonl", { a: "lifecycle.Stop", v: { event: "Stop" } });
  assert.equal(event.time, new Date(0).toISOString());
});
