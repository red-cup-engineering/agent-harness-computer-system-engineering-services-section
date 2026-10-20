import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { contextOfClaudeTranscript, DEFAULT_MAX_BYTES, formHandoffRecord, renderHandoffPrompt } from "../src/agent-handoff.mjs";

const script = path.join(path.dirname(fileURLToPath(import.meta.url)), "../scripts/write-agent-handoff.mjs");
const input = () => ({
  work: { id: "work:ledger", title: "Agent cost ledger" },
  goal: "Land the ledger ingest command by PR with all tests green.",
  state: {
    done: ["Reader and pricing written", { what: "tests", result: "13 pass" }],
    decisions: [{ what: "Cache writes priced by TTL", why: "1h writes cost 1.6x the 5m price" }],
    nextSteps: ["Open the PR on current main", "Run the ingest over today's sessions"],
    doNotRedo: ["The price lookup: claims are in data/records"],
  },
  evidence: { commits: ["abc1234 Add ledger ingest"], files: [{ path: "src/ingest.mjs", note: "entry" }] },
});

test("a handoff record is content-addressed and renders the successor's prompt", () => {
  const now = new Date("2026-10-19T12:00:00Z");
  const record = formHandoffRecord(input(), { now });
  assert.equal(record.kind, "agent-handoff-record");
  assert.match(record.id, /^sha256:[0-9a-f]{64}$/u);
  assert.equal(formHandoffRecord(input(), { now }).id, record.id);
  const prompt = renderHandoffPrompt(record);
  assert.match(prompt, /## Next steps\n- Open the PR/u);
  assert.match(prompt, /## Do not redo/u);
  assert.match(prompt, /what: tests; result: 13 pass/u);
  assert.ok(Buffer.byteLength(prompt) < 4000, "a realistic handoff prompt is a few thousand bytes");
});

test("a handoff without a next step, a goal or a work is refused by name", () => {
  const noNext = input(); noNext.state.nextSteps = [];
  assert.throws(() => formHandoffRecord(noNext), /nextSteps is required/u);
  const noGoal = input(); delete noGoal.goal;
  assert.throws(() => formHandoffRecord(noGoal), /goal is required/u);
  const noWork = input(); delete noWork.work;
  assert.throws(() => formHandoffRecord(noWork), /work\.id is required/u);
});

test("a handoff never carries a credential", () => {
  for (const secret of ["sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123", "ghp_abcdefghijklmnopqrstuvwxyz0123456789", "password=hunter2hunter2", "-----BEGIN PRIVATE KEY-----"]) {
    const bad = input(); bad.state.done.push(`found ${secret}`);
    assert.throws(() => formHandoffRecord(bad), /never secrets/u, secret);
  }
});

test("a handoff over the size limit is refused, and the limit is below the 15k-token record the cost model assumes", () => {
  const big = input(); big.state.done = Array.from({ length: 100 }, (_, i) => `step ${i} ${"x".repeat(580)}`);
  assert.throws(() => formHandoffRecord(big), /limit is 48000/u);
  assert.ok(DEFAULT_MAX_BYTES / 4 <= 15_000);
});

test("context and model come from the transcript's last billable request, usage fields only", () => {
  const row = (model, usage) => JSON.stringify({ type: "assistant", message: { model, content: [{ text: "SECRET" }], usage } });
  const content = [row("claude-opus-5-5", { input_tokens: 1, cache_read_input_tokens: 100, cache_creation_input_tokens: 10 }), row("claude-opus-5-5", { input_tokens: 2, cache_read_input_tokens: 150_000, cache_creation_input_tokens: 4000 }), row("<synthetic>", { input_tokens: 9 })].join("\n");
  assert.deepEqual(contextOfClaudeTranscript(content), { model: "claude-opus-5-5", contextTokens: 154_002 });
  assert.equal(contextOfClaudeTranscript("{}"), null);
});

test("the command writes the record to its address and prints the successor prompt", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "handoff-"));
  const inputFile = path.join(dir, "in.json");
  writeFileSync(inputFile, JSON.stringify(input()));
  const transcript = path.join(dir, "t.jsonl");
  writeFileSync(transcript, JSON.stringify({ type: "assistant", message: { model: "claude-sonnet-5-5", usage: { input_tokens: 3, cache_read_input_tokens: 170_000, cache_creation_input_tokens: 1000 } } }) + "\n");
  const out = path.join(dir, "out");
  const printed = JSON.parse(execFileSync("node", [script, "--input", inputFile, "--out", out, "--transcript", transcript, "--session", "s1", "--agent", "a1"], { encoding: "utf8" }));
  assert.equal(printed.contextTokens, 171_003);
  const record = JSON.parse(readFileSync(printed.file, "utf8"));
  assert.equal(record.id, printed.id);
  assert.deepEqual(record.from, { sessionId: "s1", agentId: "a1", model: "claude-sonnet-5-5", contextTokens: 171_003 });
  const prompt = execFileSync("node", [script, "--input", inputFile, "--out", out, "--prompt"], { encoding: "utf8" });
  assert.match(prompt, /You continue Work work:ledger/u);
  const refused = spawnSync("node", [script, "--input", path.join(dir, "missing.json")], { encoding: "utf8" });
  assert.equal(refused.status, 2);
});

test("real original message references and receiving receipts survive the existing durable handoff", () => {
  const value = input();
  value.evidence.messages = [
    { source: "fixture:chat-turn:1", channel: "chat", sourceAuthority: "not-a-signed-actor-message" },
    { source: "fixture:chat-turn:2", channel: "chat", sourceAuthority: "not-a-signed-actor-message" },
  ];
  value.evidence.receipts = [
    { ref: "fixture:pr-review:1", stage: "source-review-only" },
    { ref: "fixture:consumer:unknown", stage: "independent-receiving-not-yet-observed" },
  ];
  const record = formHandoffRecord(value, { now: new Date("2026-10-20T15:40:00Z") });
  assert.deepEqual(record.evidence.messages, value.evidence.messages,
    "two occurrences remain distinct even when their texts concern the same work");
  assert.deepEqual(record.evidence.receipts, value.evidence.receipts,
    "a source review receipt stays separate from an unobserved consumer");
  const prompt = renderHandoffPrompt(record);
  assert.match(prompt, /## Source messages\n- source: fixture:chat-turn:1/u);
  assert.match(prompt, /source: fixture:chat-turn:2/u);
  assert.match(prompt, /## Receiving and effect receipts\n- ref: fixture:pr-review:1/u);
  assert.match(prompt, /not independently accepted Work/u);
  assert.match(prompt, /receiver|receiving/u);
  const legacy = formHandoffRecord(input(), { now: new Date("2026-10-20T15:40:00Z") });
  assert.equal(Object.hasOwn(legacy.evidence, "messages"), false, "historical v1 handoff payloads must not acquire new empty fields and change their content address");
  assert.equal(Object.hasOwn(legacy.evidence, "receipts"), false, "historical v1 handoff payloads must keep the old canonical form");
  assert.doesNotMatch(renderHandoffPrompt(legacy), /## Source messages/u);
});

test("message and receiving evidence retain the existing secret refusal boundary", () => {
  const bad = input();
  bad.evidence.messages = [{ source: "chat-turn", instruction: "password=hunter2hunter2" }];
  assert.throws(() => formHandoffRecord(bad), /never secrets/u);
  const alsoBad = input();
  alsoBad.evidence.receipts = [{ token: "ghp_abcdefghijklmnopqrstuvwxyz0123456789" }];
  assert.throws(() => formHandoffRecord(alsoBad), /never secrets/u);
});

test("unknown or invalid context usage never becomes a zero-token or stale measured Session budget", () => {
  const row = (model, usage) => JSON.stringify({ type: "assistant", message: { model, usage } });
  const normal = contextOfClaudeTranscript(row("claude-sonnet", { input_tokens: 10 }));
  assert.deepEqual(normal, { model: "claude-sonnet", contextTokens: 10 }, "absent optional cache counters are zero");
  const complete = contextOfClaudeTranscript(row("claude-sonnet", {
    input_tokens: 2, cache_read_input_tokens: 15_000, cache_creation_input_tokens: 4_000,
  }));
  assert.equal(complete.contextTokens, 19_002);
  for (const bad of [
    { cache_read_input_tokens: 10 },
    { input_tokens: "100" },
    { input_tokens: 10, cache_read_input_tokens: -1 },
    { input_tokens: 10, cache_creation_input_tokens: "400" },
    { input_tokens: Number.MAX_SAFE_INTEGER, cache_read_input_tokens: 1 },
  ]) {
    const reading = contextOfClaudeTranscript(row("claude-sonnet", bad));
    assert.deepEqual(reading, { model: "claude-sonnet", contextTokens: null },
      "missing/malformed context is unmeasured, never inferred to be zero");
    const handoff = input();
    handoff.from = reading;
    const saved = formHandoffRecord(handoff, { now: new Date("2026-10-20T18:00:00Z") });
    assert.equal(saved.from.contextTokens, null,
      "a successor's actual original handoff does not claim an unknown usage measurement");
  }
  assert.deepEqual(contextOfClaudeTranscript([
    row("earlier", { input_tokens: 800 }),
    row("latest", { input_tokens: 30, cache_read_input_tokens: -1 }),
  ].join("\n")), { model: "latest", contextTokens: null },
  "a later incomplete request must not inherit an earlier, dangerously smaller context reading");
  assert.equal(contextOfClaudeTranscript(row("<synthetic>", { input_tokens: 700 })), null);
});

test("CLI handoff selects actual transcript meter and current occurrence over stale draft values", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "handoff-meter-"));
  const draft = input();
  draft.from = { sessionId: "old-s", agentId: "old-a", model: "guessed-model", contextTokens: 1 };
  const inputFile = path.join(dir, "draft.json");
  const transcript = path.join(dir, "observed.jsonl");
  writeFileSync(inputFile, JSON.stringify(draft));
  writeFileSync(transcript, JSON.stringify({ type: "assistant",
    message: { model: "real-model", usage: { input_tokens: 7, cache_read_input_tokens: 15_000 } } }) + "\n");
  const result = JSON.parse(execFileSync("node", [script, "--input", inputFile,
    "--out", dir, "--transcript", transcript, "--session", "actual-s", "--agent", "actual-a"], { encoding: "utf8" }));
  assert.equal(result.contextTokens, 15_007);
  let record = JSON.parse(readFileSync(result.file, "utf8"));
  assert.deepEqual(record.from, { sessionId: "actual-s", agentId: "actual-a", model: "real-model", contextTokens: 15_007 });
  // An incomplete newer provider record cannot be concealed with yesterday's
  // manual estimate: preserve unknown capacity for the next actor.
  writeFileSync(transcript, JSON.stringify({ type: "assistant",
    message: { model: "real-model", usage: { cache_read_input_tokens: 15_000 } } }) + "\n");
  const next = JSON.parse(execFileSync("node", [script, "--input", inputFile,
    "--out", dir, "--transcript", transcript, "--session", "actual-s", "--agent", "actual-a"], { encoding: "utf8" }));
  assert.equal(next.contextTokens, null);
  record = JSON.parse(readFileSync(next.file, "utf8"));
  assert.equal(record.from.contextTokens, null);
  assert.equal(record.from.model, "real-model");
});
