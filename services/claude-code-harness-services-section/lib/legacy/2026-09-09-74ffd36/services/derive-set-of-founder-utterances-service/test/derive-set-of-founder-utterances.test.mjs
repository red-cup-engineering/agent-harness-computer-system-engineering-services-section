import assert from "node:assert/strict";
import test from "node:test";
import { deriveSetOfFounderUtterances } from "../scripts/derive-set-of-founder-utterances.mjs";

const WINDOW = { since: "2026-09-02T00:00:00.000Z", until: "2026-09-05T02:05:00.000Z" };

test("keeps one plain user prompt within the window", () => {
  const lines = [JSON.stringify({ type: "user", timestamp: "2026-09-02T01:00:00.000Z", message: { content: "hello founder" } })];
  const result = deriveSetOfFounderUtterances({ transcripts: [{ session: "aaaaaaaa", lines }], ...WINDOW });
  assert.deepEqual(result.rows, [{ session: "aaaaaaaa", ts: "2026-09-02T01:00:00.000Z", text: "hello founder" }]);
  assert.equal(result.prompts, 1);
  assert.deepEqual(result.sessions, { aaaaaaaa: 1 });
  assert.equal(result.type, "FounderUtteranceSet");
  assert.equal(result.version, 1);
});

test("ignores a non-user record", () => {
  const lines = [JSON.stringify({ type: "assistant", timestamp: "2026-09-02T01:00:00.000Z", message: { content: "not a founder line" } })];
  const result = deriveSetOfFounderUtterances({ transcripts: [{ session: "aaaaaaaa", lines }], ...WINDOW });
  assert.deepEqual(result.rows, []);
});

test("drops a user message carrying a tool_result block entirely", () => {
  const lines = [JSON.stringify({ type: "user", timestamp: "2026-09-02T01:00:00.000Z", message: { content: [{ type: "tool_result", content: "output" }, { type: "text", text: "should not survive" }] } })];
  const result = deriveSetOfFounderUtterances({ transcripts: [{ session: "aaaaaaaa", lines }], ...WINDOW });
  assert.deepEqual(result.rows, []);
});

test("strips a system-reminder span and keeps the remaining text", () => {
  const lines = [JSON.stringify({ type: "user", timestamp: "2026-09-02T01:00:00.000Z", message: { content: "<system-reminder>ambient</system-reminder>real ask" } })];
  const result = deriveSetOfFounderUtterances({ transcripts: [{ session: "aaaaaaaa", lines }], ...WINDOW });
  assert.equal(result.rows[0].text, "real ask");
});

test("drops a message that is only a stripped system-reminder span", () => {
  const lines = [JSON.stringify({ type: "user", timestamp: "2026-09-02T01:00:00.000Z", message: { content: "<system-reminder>ambient only</system-reminder>" } })];
  const result = deriveSetOfFounderUtterances({ transcripts: [{ session: "aaaaaaaa", lines }], ...WINDOW });
  assert.deepEqual(result.rows, []);
});

test("drops a house noise block", () => {
  const lines = [JSON.stringify({ type: "user", timestamp: "2026-09-02T01:00:00.000Z", message: { content: "This session is being continued from a previous one." } })];
  const result = deriveSetOfFounderUtterances({ transcripts: [{ session: "aaaaaaaa", lines }], ...WINDOW });
  assert.deepEqual(result.rows, []);
});

test("drops a message dated after the window's until", () => {
  const lines = [JSON.stringify({ type: "user", timestamp: "2026-09-05T02:05:01.000Z", message: { content: "too late" } })];
  const result = deriveSetOfFounderUtterances({ transcripts: [{ session: "aaaaaaaa", lines }], ...WINDOW });
  assert.deepEqual(result.rows, []);
});

test("drops a message dated before the window's since", () => {
  const lines = [JSON.stringify({ type: "user", timestamp: "2026-09-01T23:59:59.000Z", message: { content: "too early" } })];
  const result = deriveSetOfFounderUtterances({ transcripts: [{ session: "aaaaaaaa", lines }], ...WINDOW });
  assert.deepEqual(result.rows, []);
});

test("dedupes on the first 200 characters across two different transcripts", () => {
  const line = JSON.stringify({ type: "user", timestamp: "2026-09-02T01:00:00.000Z", message: { content: "same ask repeated" } });
  const laterLine = JSON.stringify({ type: "user", timestamp: "2026-09-02T02:00:00.000Z", message: { content: "same ask repeated" } });
  const result = deriveSetOfFounderUtterances({
    transcripts: [{ session: "aaaaaaaa", lines: [line] }, { session: "bbbbbbbb", lines: [laterLine] }],
    ...WINDOW,
  });
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].session, "aaaaaaaa");
});

test("sorts rows ascending by timestamp regardless of input order", () => {
  const early = JSON.stringify({ type: "user", timestamp: "2026-09-02T01:00:00.000Z", message: { content: "first" } });
  const late = JSON.stringify({ type: "user", timestamp: "2026-09-03T01:00:00.000Z", message: { content: "second" } });
  const result = deriveSetOfFounderUtterances({ transcripts: [{ session: "aaaaaaaa", lines: [late, early] }], ...WINDOW });
  assert.deepEqual(result.rows.map((row) => row.text), ["first", "second"]);
});

test("skips an unparseable trailing line rather than throwing", () => {
  const lines = ["{not json", JSON.stringify({ type: "user", timestamp: "2026-09-02T01:00:00.000Z", message: { content: "still works" } })];
  const result = deriveSetOfFounderUtterances({ transcripts: [{ session: "aaaaaaaa", lines }], ...WINDOW });
  assert.equal(result.rows.length, 1);
});

test("refuses a missing transcripts array", () => assert.throws(() => deriveSetOfFounderUtterances({ ...WINDOW }), /transcripts must be an array/u));

test("refuses a non-string since", () => assert.throws(() => deriveSetOfFounderUtterances({ transcripts: [], since: 1, until: WINDOW.until }), /since and until must be/u));

test("refuses a non-string until", () => assert.throws(() => deriveSetOfFounderUtterances({ transcripts: [], since: WINDOW.since, until: null }), /since and until must be/u));
