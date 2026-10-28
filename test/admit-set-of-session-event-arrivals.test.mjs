import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, appendFileSync } from "node:fs";
import { scratchRoot } from "./support/scratch.mjs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
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

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const FIXTURE_ROOT = join(TEST_DIR, "fixtures", "session-event-journal-tree");

test("first run emits one CloudEvent per lifecycle row, skips non-lifecycle rows, and refuses secret-looking rows", async () => {
  const cursor = await loadCursor("/nonexistent/cursor.json");
  const { events, cursor: nextCursor } = await admitSetOfSessionEventArrivals({ logsRoot: FIXTURE_ROOT, repoRoot: TEST_DIR, cursor });
  // Fixture has 4 rows: UserPromptSubmit, Stop (both lifecycle, admitted),
  // a non-lifecycle "deployment" row (skipped), and a lifecycle row whose
  // v carries "apiKey" (refused).
  assert.equal(events.length, 2);
  assert.deepEqual(events.map((event) => event.data.event), ["UserPromptSubmit", "Stop"]);
  const [event] = events;
  assert.equal(event.specversion, "1.0");
  assert.equal(event.type, "org.561-group.session-event.v1");
  assert.equal(event.source, "fixtures/session-event-journal-tree/data/logs/witness-journal-seavt-logs/2026-09-01-admit-witness-journal-seavt.jsonl");
  assert.match(event.id, /^sha256:[0-9a-f]{64}$/u);
  assert.equal(Object.values(nextCursor.files)[0] > 0, true);
});

test("second run against the unchanged fixture file is idempotent and emits nothing new", async () => {
  const cursor = await loadCursor("/nonexistent/cursor.json");
  const first = await admitSetOfSessionEventArrivals({ logsRoot: FIXTURE_ROOT, repoRoot: TEST_DIR, cursor });
  const second = await admitSetOfSessionEventArrivals({ logsRoot: FIXTURE_ROOT, repoRoot: TEST_DIR, cursor: first.cursor });
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
