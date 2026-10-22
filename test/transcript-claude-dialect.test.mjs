import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { claudeSessionTranscriptDialect as dialect } from "../src/transcripts/claude-dialect.mjs";

test("defaultSessionRoot escapes a repo path the way Claude Code's own project directories are named", () => {
  const root = dialect.defaultSessionRoot("/home/emsenn/info");
  assert.match(root, /\/\.claude\/projects\/-home-emsenn-info$/u);
});

test("enumerateSessionFiles reads the flat layout by mtime and never descends into a subdirectory", () => {
  const root = mkdtempSync(join(tmpdir(), "claude-dialect-"));
  const inWindow = join(root, "session-a.jsonl");
  const outOfWindow = join(root, "session-b.jsonl");
  writeFileSync(inWindow, "");
  writeFileSync(outOfWindow, "");
  const within = new Date("2026-07-30T12:00:00.000Z");
  const stale = new Date("2020-01-01T00:00:00.000Z");
  utimesSync(inWindow, within, within);
  utimesSync(outOfWindow, stale, stale);
  mkdirSync(join(root, "subagents"), { recursive: true });
  writeFileSync(join(root, "subagents", "agent-echo.jsonl"), "");
  utimesSync(join(root, "subagents", "agent-echo.jsonl"), within, within);
  const files = dialect.enumerateSessionFiles(root, new Date("2026-07-30T11:00:00.000Z"), new Date("2026-07-30T13:00:00.000Z"));
  assert.deepEqual(files, [inWindow]);
});

test("rowKind distinguishes user text, tool results, assistant text, and tool calls", () => {
  assert.equal(dialect.rowKind({ type: "user", message: { role: "user", content: "hello" } }), "user-message");
  assert.equal(dialect.rowKind({ type: "user", message: { role: "user", content: [{ type: "tool_result", tool_use_id: "t1", is_error: false }] } }), "tool-result");
  assert.equal(dialect.rowKind({ type: "assistant", message: { role: "assistant", content: [{ type: "text", text: "hi" }] } }), "assistant-message");
  assert.equal(dialect.rowKind({ type: "assistant", message: { role: "assistant", content: [{ type: "tool_use", id: "t1", name: "Bash", input: {} }] } }), "tool-call");
  assert.equal(dialect.rowKind({ type: "queue-operation" }), "other");
  assert.equal(dialect.rowKind({ type: "ai-title" }), "other");
});

test("modelOf and tokenUsageOf read only assistant rows", () => {
  const row = { type: "assistant", message: { model: "claude-sonnet-5", usage: { input_tokens: 2, cache_creation_input_tokens: 3709, cache_read_input_tokens: 100, output_tokens: 12 } } };
  assert.equal(dialect.modelOf(row), "claude-sonnet-5");
  assert.deepEqual(dialect.tokenUsageOf(row), { input: 2, cached: 3809, output: 12, reasoning: 0 });
  assert.equal(dialect.modelOf({ type: "user", message: {} }), null);
  assert.equal(dialect.tokenUsageOf({ type: "user", message: {} }), null);
});

test("toolCallsOf carries every tool_use block on one row, and the singular accessors read the first", () => {
  const secret = "DO-NOT-DISCLOSE-TOOL-INPUT";
  const row = { type: "assistant", message: { content: [
    { type: "tool_use", id: "toolu_1", name: "Bash", input: { command: secret } },
    { type: "tool_use", id: "toolu_2", name: "Edit", input: { file_path: secret } },
  ] } };
  const calls = dialect.toolCallsOf(row);
  assert.deepEqual(calls, [{ name: "Bash", transport: "tool_use", callId: "toolu_1" }, { name: "Edit", transport: "tool_use", callId: "toolu_2" }]);
  assert.equal(dialect.toolNameOf(row), "Bash");
  assert.equal(dialect.callIdOf(row), "toolu_1");
  assert.equal(JSON.stringify(calls).includes(secret), false);
});

test("toolResultsOf carries only tool_use_id and is_error, never the result content", () => {
  const secret = "DO-NOT-DISCLOSE-TOOL-OUTPUT";
  const row = { type: "user", message: { content: [{ type: "tool_result", tool_use_id: "toolu_1", is_error: true, content: secret }] } };
  const results = dialect.toolResultsOf(row);
  assert.deepEqual(results, [{ toolUseId: "toolu_1", isError: true }]);
  assert.equal(JSON.stringify(results).includes(secret), false);
});

test("toolClassPatterns classify Claude's own tool names", () => {
  assert.match("Bash", dialect.toolClassPatterns.exec);
  assert.match("Edit", dialect.toolClassPatterns.patch);
  assert.match("Write", dialect.toolClassPatterns.patch);
  assert.match("mcp__bare-cedar-fog-claude-enterprise__open_claude_demand", dialect.toolClassPatterns.market);
  assert.doesNotMatch("Read", dialect.toolClassPatterns.patch);
  assert.doesNotMatch("Read", dialect.toolClassPatterns.exec);
});

test("safeMetadata never carries message text or tool input/output", () => {
  const secret = "DO-NOT-DISCLOSE-TRANSCRIPT-TEXT";
  const row = { timestamp: "2026-07-30T12:00:00.000Z", type: "user", message: { role: "user", content: secret } };
  const metadata = dialect.safeMetadata(row);
  assert.deepEqual(metadata, { timestamp: "2026-07-30T12:00:00.000Z", type: "user", payloadType: "user-message", role: "user", name: null });
  assert.equal(JSON.stringify(metadata).includes(secret), false);
});

test("provider cells are available to the Claude activity provider", () => {
  assert.equal(dialect.providerCells.pulse, "urn:ame:claude-session-activity-provider:pulse-provider");
  assert.equal(dialect.providerCells.toolObservation, "urn:ame:claude-session-activity-provider:tool-observation");
});
