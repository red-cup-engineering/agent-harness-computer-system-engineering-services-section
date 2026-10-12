import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { admitClaudeSession, admitClaudeSessionOnStop, sessionIdOfTranscript } from "../scripts/admit-claude-session.mjs";

const actor = "actor:bZH6KBOlPVWbYpqp04izN_Xtwykn0XgsMBStm_FkPPw";

// One constructed AgentLifecycleEvent, as the lifecycle-hook platform's
// decoder delivers it; the handler is exercised directly.
const stopEvent = (transcriptPath) => ({
  kind: "agent-lifecycle-event",
  version: 1,
  runtime: "claude",
  event: "Stop",
  session: { id: "s", ...(transcriptPath === undefined ? {} : { transcriptPath }) },
  native: {},
});

test("a session id is the transcript carrier's own name, without its journal-line suffix", () => {
  assert.equal(sessionIdOfTranscript("/some/path/my-session.jsonl"), "my-session");
  assert.equal(sessionIdOfTranscript("my-session.jsonl"), "my-session");
  assert.equal(sessionIdOfTranscript("/some/path/my-session"), "my-session");
});

test("the Stop reaction refuses an event naming no transcript", async () => {
  await assert.rejects(() => admitClaudeSessionOnStop(stopEvent()), /names no transcript path/u);
  await assert.rejects(() => admitClaudeSessionOnStop(stopEvent("   ")), /names no transcript path/u);
});

test("the Stop reaction admits the session the event names, carrying every parameter forward, and blocks nothing", async () => {
  const calls = [];
  const response = await admitClaudeSessionOnStop(stopEvent("/some/path/my-session.jsonl"), {
    actor,
    journalRoot: "/journal",
    objectKind: "x.session-admission",
    admit: (options) => calls.push(options),
  });
  assert.deepEqual(response, { kind: "agent-lifecycle-response", version: 1, disposition: "continue" });
  assert.deepEqual(calls, [{
    transcriptPath: "/some/path/my-session.jsonl",
    sessionId: "my-session",
    actor,
    journalRoot: "/journal",
    objectKind: "x.session-admission",
  }]);
});

test("the admission calls both rail verbs with exactly the fields their operations accept, and journals one receipt naming both results", async () => {
  const journalRoot = mkdtempSync(join(tmpdir(), "admit-claude-session-journal-"));
  try {
    const seenCalls = [];
    const runVerb = async (verb, input) => {
      seenCalls.push({ verb, input });
      return verb === "claude-session-admit" ? { id: "urn:session-admission:1" } : { id: "urn:token-usage-admission:1" };
    };
    const result = await admitClaudeSession({ transcriptPath: "/x/session.jsonl", actor, journalRoot, runVerb });

    assert.equal(seenCalls.length, 2);
    assert.equal(seenCalls[0].verb, "claude-session-admit");
    assert.deepEqual(seenCalls[0].input, { sessionId: "session" });
    assert.equal(seenCalls[1].verb, "agent-session-token-usage-admit");
    assert.deepEqual(seenCalls[1].input, { provider: "claude", sessionId: "session" });

    assert.deepEqual(result.sessionAdmission, { id: "urn:session-admission:1" });
    assert.deepEqual(result.tokenUsageAdmission, { id: "urn:token-usage-admission:1" });
    assert.equal(result.root, journalRoot);
    assert.ok(typeof result.id === "string" && result.id !== "");

    const day = new Date().toISOString().slice(0, 10).replaceAll("-", "/");
    const onDisk = readFileSync(join(journalRoot, "data/logs", day, "witness-journal-seavt.jsonl"), "utf8");
    assert.match(onDisk, /urn:session-admission:1/);
    assert.match(onDisk, /urn:token-usage-admission:1/);
    assert.match(onDisk, /metroplat\.session-admit/);
    assert.match(onDisk, new RegExp(actor));
  } finally {
    rmSync(journalRoot, { recursive: true, force: true });
  }
});

test("a rail that sees no turns is recorded as unseen, never as zero usage", async () => {
  const journalRoot = mkdtempSync(join(tmpdir(), "admit-claude-session-journal-"));
  try {
    const unseen = await admitClaudeSession({ transcriptPath: "/x/session.jsonl", actor, journalRoot, runVerb: async () => ({ turns: 0 }) });
    assert.equal(unseen.usageSeenByRail, false);
    const seen = await admitClaudeSession({ transcriptPath: "/x/session.jsonl", actor, journalRoot, runVerb: async () => ({ turns: 3 }) });
    assert.equal(seen.usageSeenByRail, true);
  } finally {
    rmSync(journalRoot, { recursive: true, force: true });
  }
});

test("the admission refuses a missing transcript, actor, or journal root", async () => {
  await assert.rejects(() => admitClaudeSession({ runVerb: () => ({}) }), /names no transcriptPath/u);
  await assert.rejects(() => admitClaudeSession({ transcriptPath: "/x.jsonl", runVerb: () => ({}) }), /admitting actor is required/u);
  await assert.rejects(() => admitClaudeSession({ transcriptPath: "/x.jsonl", actor, runVerb: () => ({}) }), /journal custody root is required/u);
});
