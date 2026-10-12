import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openHarnessLifecycleJournal } from "@red-cup-engineering/harness-lifecycle-journal-service";
import { observeClaudeLifecycle, observeLifecycle } from "../scripts/observe-claude-lifecycle.mjs";
import { lifecycleEvent, responseOf } from "./lifecycle-event.mjs";

// The observing actor and the journal custody root are parameters, exactly as
// the machine's own AgentHarnessPolicy and hook arguments supply them. This
// address is one the harness lifecycle journal admits, because a SubagentStop
// commissions a provider on that journal and it gates its own actors.
const actor = "actor:bZH6KBOlPVWbYpqp04izN_Xtwykn0XgsMBStm_FkPPw";
const clock = (iso) => () => new Date(iso);

test("an observation retains metadata and digests identities without retaining any session content", () => {
  const scratch = mkdtempSync(join(tmpdir(), "claude-lifecycle-"));
  try {
    const secret = "a prompt that must never be retained";
    const result = observeLifecycle({
      event: lifecycleEvent({ event: "UserPromptSubmit", sessionId: "raw-session-id", cwd: "/secret/workspace", prompt: secret }),
      actor,
      journalRoot: scratch,
      now: clock("2026-08-27T12:00:00.000Z"),
    });
    assert.equal(result.observation.event, "UserPromptSubmit");
    assert.equal(result.observation.actor, actor);
    assert.equal(result.observation.occurredAt, "2026-08-27T12:00:00.000Z");
    for (const key of ["sessionDigest", "workspaceDigest", "promptDigest"]) assert.match(result.observation[key], /^sha256:/u);
    const onDisk = readFileSync(join(scratch, "data/logs/2026/08/27/witness-journal-seavt.jsonl"), "utf8");
    assert.doesNotMatch(onDisk, /raw-session-id|a prompt that must never be retained/u);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
});

test("a Stop observation carries a transcriptDigest without retaining the transcript path", () => {
  const scratch = mkdtempSync(join(tmpdir(), "claude-lifecycle-"));
  try {
    const result = observeLifecycle({
      event: lifecycleEvent({ event: "Stop", cwd: scratch, transcriptPath: "/secret/transcript.jsonl" }),
      actor,
      journalRoot: scratch,
    });
    assert.match(result.observation.transcriptDigest, /^sha256:/u);
    const onDisk = readFileSync(join(scratch, `data/logs/${result.observation.occurredAt.slice(0, 10).replaceAll("-", "/")}/witness-journal-seavt.jsonl`), "utf8");
    assert.doesNotMatch(onDisk, /secret\/transcript/u);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
});

test("SessionStart admits only the bounded source label", () => {
  const scratch = mkdtempSync(join(tmpdir(), "claude-lifecycle-"));
  try {
    assert.equal(observeLifecycle({ event: lifecycleEvent({ event: "SessionStart", cwd: scratch, source: "resume" }), actor, journalRoot: scratch }).observation.source, "resume");
    assert.equal("source" in observeLifecycle({ event: lifecycleEvent({ event: "SessionStart", cwd: scratch, source: "invented" }), actor, journalRoot: scratch }).observation, false);
    assert.throws(() => observeLifecycle({ event: lifecycleEvent({ event: "SessionEnd", cwd: scratch }), actor, journalRoot: scratch }), /unsupported observed lifecycle event/);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
});

test("UserPromptSubmit and Stop chain to the session's prior lifecycle record, rooted at SessionStart", () => {
  const scratch = mkdtempSync(join(tmpdir(), "claude-lifecycle-"));
  try {
    const observe = (event, iso) => observeLifecycle({ event, actor, journalRoot: scratch, now: clock(iso) });
    const start = observe(lifecycleEvent({ event: "SessionStart", sessionId: "chain-session", cwd: scratch, source: "startup" }), "2026-09-02T10:00:00.000Z");
    assert.equal(start.relation, null);
    const prompt = observe(lifecycleEvent({ event: "UserPromptSubmit", sessionId: "chain-session", cwd: scratch, prompt: "hi" }), "2026-09-02T10:00:01.000Z");
    assert.deepEqual(prompt.relation, { subject: prompt.id, predicate: "follows", object: start.id });
    const stop = observe(lifecycleEvent({ event: "Stop", sessionId: "chain-session", cwd: scratch, transcriptPath: "/t" }), "2026-09-02T10:00:02.000Z");
    assert.deepEqual(stop.relation, { subject: stop.id, predicate: "follows", object: prompt.id });
    const again = observe(lifecycleEvent({ event: "UserPromptSubmit", sessionId: "chain-session", cwd: scratch, prompt: "again" }), "2026-09-02T10:00:03.000Z");
    assert.deepEqual(again.relation, { subject: again.id, predicate: "follows", object: stop.id });
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
});

test("SubagentStop commissions a provider on the harness lifecycle journal, linked to the turn's UserPromptSubmit", () => {
  const scratch = mkdtempSync(join(tmpdir(), "claude-lifecycle-"));
  try {
    const observe = (event, iso) => observeLifecycle({ event, actor, journalRoot: scratch, now: clock(iso) });
    const prompt = observe(lifecycleEvent({ event: "UserPromptSubmit", sessionId: "subagent-session", cwd: scratch, prompt: "go do it" }), "2026-09-02T11:00:00.000Z");
    const subagentStop = observe(lifecycleEvent({ event: "SubagentStop", sessionId: "subagent-session", cwd: scratch, transcriptPath: "/secret/subagent-transcript.jsonl" }), "2026-09-02T11:00:05.000Z");
    assert.deepEqual(subagentStop.relation, { subject: subagentStop.id, predicate: "follows", object: prompt.id });
    assert.equal(subagentStop.commission.turnId, prompt.id);
    const commissions = openHarnessLifecycleJournal({ root: scratch }).query({ category: "provider-commissioned" });
    assert.equal(commissions.length, 1);
    assert.equal(commissions[0].record.turn, prompt.id);
    assert.equal(commissions[0].record.name, "claude-subagent");
    assert.match(commissions[0].record.task, /^sha256:/u);
    assert.doesNotMatch(readFileSync(join(scratch, "data/logs/2026/09/02/witness-journal-seavt.jsonl"), "utf8"), /secret\/subagent-transcript/u);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
});

test("SubagentStop with no prior UserPromptSubmit for the session refuses", () => {
  const scratch = mkdtempSync(join(tmpdir(), "claude-lifecycle-"));
  try {
    assert.throws(() => observeLifecycle({
      event: lifecycleEvent({ event: "SubagentStop", sessionId: "lonely-session", cwd: scratch, transcriptPath: "/t" }),
      actor,
      journalRoot: scratch,
    }), /no UserPromptSubmit record/);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
});

test("an absent or malformed actor address refuses, and so does an absent journal root", () => {
  const scratch = mkdtempSync(join(tmpdir(), "claude-lifecycle-"));
  const event = lifecycleEvent({ event: "Stop", cwd: scratch, transcriptPath: "/t" });
  try {
    assert.throws(() => observeLifecycle({ event, journalRoot: scratch }), /constituted actor address is required/);
    assert.throws(() => observeLifecycle({ event, journalRoot: scratch, actor: "urn:ame:claude" }), /constituted actor address is required/);
    assert.throws(() => observeLifecycle({ event, actor }), /journal custody root is required/);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
});

test("the handler records the observation, adds nothing, and blocks nothing", () => {
  const scratch = mkdtempSync(join(tmpdir(), "claude-lifecycle-"));
  try {
    const response = responseOf(observeClaudeLifecycle(lifecycleEvent({ event: "SessionStart", cwd: scratch, source: "startup" }), { actor, journalRoot: scratch }));
    assert.deepEqual(response, { kind: "agent-lifecycle-response", version: 1, disposition: "continue" });
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
});
