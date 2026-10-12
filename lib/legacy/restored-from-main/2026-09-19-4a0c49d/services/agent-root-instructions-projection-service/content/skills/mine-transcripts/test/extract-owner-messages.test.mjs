import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  chunkRows,
  claudeMessageText,
  codexMessageText,
  dedupeRows,
  expandHome,
  extractClaudeOwnerMessages,
  extractCodexOwnerMessages,
  extractStores,
  matchOwnerMessages,
  filterByDate,
  filterBySession,
  isNoiseText,
  localMidnightIso,
  parseArgs,
  renderChunk,
  runRemoteExtraction,
  summaryLine,
} from "../scripts/extract-owner-messages.mjs";

test("correction search preserves exact spelling and finds every occurrence without merging separate turns", () => {
  const rows = [
    { t: "a", text: "I odn't know what to say. I don't know how to explain this." },
    { t: "b", text: "I odn't know what to say. I don't know how to explain this." },
    { t: "c", text: "ordinary work" },
  ];
  const matches = matchOwnerMessages(rows, [{ id: "request", pattern: "I (?:odn't|don't) know" }]);
  assert.deepEqual(matches.map(({ text }) => text), rows.slice(0, 2).map(({ text }) => text));
  assert.deepEqual(matches[0].matches.map(({ index, text }) => [index, text]), [[0, "I odn't know"], [26, "I don't know"]]);
  assert.throws(() => matchOwnerMessages(rows, [{ id: "x", pattern: "[" }]), SyntaxError);
});

test("maintained recall patterns find natural uncertainty, emphasis, typos and repeated requests", async () => {
  const patterns = JSON.parse(await readFile(new URL("../references/recurring-corrections.json", import.meta.url), "utf8"));
  const text = [
    "I truly truly don't know what to say to get you to see this.",
    "I odn't know what to say to get you to X.",
    "I dunno how to say this.",
    "I'm not sure how to prompt you.",
    "I really, really, am just at a loss of what to say.",
    "I cannot really prompt you much better than I am.",
    "I keep asking for the same thing.",
  ];
  assert.equal(matchOwnerMessages(text.map((text) => ({ text })), patterns).length, text.length);
  assert.deepEqual(matchOwnerMessages([{ text: "Please fix the CLI help typo." }], patterns), []);
});

test("multi-store search reports missing stores and excludes both forms of delegated Codex metadata", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "owner-stores-"));
  try {
    const claude = path.join(directory, "claude"), codex = path.join(directory, "codex");
    await mkdir(claude); await mkdir(codex);
    await writeFile(path.join(claude, "root.jsonl"), [
      { type: "user", timestamp: "a", sessionId: "human", message: { content: "I don't know how to explain this" } },
      { type: "user", isSidechain: true, message: { content: "delegated text" } },
      { type: "assistant", message: { content: "I don't know how to explain this" } },
    ].map(JSON.stringify).join("\n"));
    for (const [name, source] of [["nested", { subagent: { thread_spawn: { parent_thread_id: "human" } } }], ["string", "subagent"]]) {
      await writeFile(path.join(codex, name + ".jsonl"), [
        { type: "session_meta", payload: { id: name, source } },
        { type: "response_item", payload: { role: "user", content: "delegated prompt" } },
      ].map(JSON.stringify).join("\n"));
    }
    await writeFile(path.join(codex, "root.jsonl"), [
      { type: "session_meta", payload: { id: "codex-human", source: "cli" } },
      { type: "response_item", timestamp: "b", payload: { role: "user", content: "I keep asking" } },
      "malformed record",
    ].map((x) => typeof x === "string" ? x : JSON.stringify(x)).join("\n"));
    const result = await extractStores([{ kind: "claude", store: claude }, { kind: "codex", store: codex }, { kind: "claude", store: path.join(directory, "missing") }]);
    assert.deepEqual(result.rows.map(({ text }) => text), ["I don't know how to explain this", "I keep asking"]);
    assert.equal(result.rows[0].line, 1);
    assert.equal(result.rows[1].line, 2);
    assert.equal(result.rows[1].source, path.join(codex, "root.jsonl"));
    assert.equal(result.coverage[1].diagnostics[0].line, 3);
    assert.match(result.coverage[2].error, /ENOENT/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("parseArgs needs nothing: defaults to the laptop Claude store, stdout, no filters", () => {
  const options = parseArgs([]);
  assert.equal(options.kind, "claude");
  assert.equal(options.out, null);
  assert.equal(options.since, null);
  assert.equal(options.session, null);
});

test("parseArgs --today sets since to local midnight; --session keeps a prefix", () => {
  const options = parseArgs(["--today", "--session", "46b2a78e"]);
  assert.equal(options.since, localMidnightIso());
  assert.equal(options.session, "46b2a78e");
});

test("isNoiseText drops task notifications and interruption echoes", () => {
  assert.equal(isNoiseText("<task-notification>\n<task-id>x</task-id>"), true);
  assert.equal(isNoiseText("[Request interrupted by user for tool use]"), true);
});

test("dedupeRows keeps the first copy of a (timestamp, text) pair", () => {
  const rows = [{ t: "a", text: "x" }, { t: "a", text: "x" }, { t: "b", text: "x" }];
  assert.deepEqual(dedupeRows(rows), [rows[0], rows[2]]);
});

test("filterBySession keeps rows whose session id starts with the prefix", () => {
  const rows = [{ s: "46b2a78e-1", t: "a" }, { s: "8834c3fe-2", t: "b" }];
  assert.deepEqual(filterBySession(rows, "46b2"), [rows[0]]);
  assert.deepEqual(filterBySession(rows, null), rows);
});

test("parseArgs rejects an unknown --kind and a non-positive --chunks", () => {
  assert.throws(() => parseArgs(["--kind", "vps", "--out", "/tmp/x"]), /--kind must be claude or codex/u);
  assert.throws(() => parseArgs(["--out", "/tmp/x", "--chunks", "0"]), /--chunks must be a positive integer/u);
});

test("parseArgs picks a claude vs codex default store and expands a leading ~", () => {
  const claudeDefault = parseArgs(["--out", "/tmp/x"]);
  assert.ok(claudeDefault.store.endsWith(path.join(".claude", "projects", "-home-emsenn-info")));
  const codexDefault = parseArgs(["--kind", "codex", "--out", "/tmp/x"]);
  assert.ok(codexDefault.store.endsWith(path.join(".codex", "sessions")));
  const explicit = parseArgs(["--store", "~/.claude/projects/-home-emsenn-561-group", "--out", "/tmp/x"]);
  assert.equal(explicit.store, path.join(process.env.HOME ?? "", ".claude/projects/-home-emsenn-561-group"));
});

test("expandHome handles bare ~, ~/rest, and untouched absolute paths", () => {
  assert.equal(expandHome("~"), process.env.HOME ?? "~");
  assert.equal(expandHome("~/foo/bar"), path.join(process.env.HOME ?? "", "foo/bar"));
  assert.equal(expandHome("/already/absolute"), "/already/absolute");
});

test("isNoiseText drops slash-command echoes and continuation banners, keeps real text", () => {
  assert.equal(isNoiseText("<command-message>foo</command-message>"), true);
  assert.equal(isNoiseText("<local-command-caveat>ignore</local-command-caveat>"), true);
  assert.equal(isNoiseText("This session is being continued from a previous conversation."), true);
  assert.equal(isNoiseText("Ship the thing by Friday."), false);
});

test("claudeMessageText joins only text-typed blocks, excluding tool_result", () => {
  assert.equal(claudeMessageText("plain string"), "plain string");
  assert.equal(
    claudeMessageText([{ type: "text", text: "first" }, { type: "tool_result", content: "ignored" }, { type: "text", text: "second" }]),
    "first\nsecond",
  );
  assert.equal(claudeMessageText(undefined), "");
});

test("codexMessageText accepts a string, {text} blocks, and {input_text} blocks", () => {
  assert.equal(codexMessageText("plain"), "plain");
  assert.equal(codexMessageText([{ type: "input_text", text: "a" }, { input_text: "b" }]), "a\nb");
  assert.equal(codexMessageText(null), "");
});

test("filterByDate keeps rows within an inclusive [since, until] window", () => {
  const rows = [{ t: "2026-06-01T00:00:00.000Z" }, { t: "2026-06-15T00:00:00.000Z" }, { t: "2026-07-01T00:00:00.000Z" }];
  assert.deepEqual(filterByDate(rows, "2026-06-01T00:00:00.000Z", "2026-06-30T23:59:59.999Z"), [rows[0], rows[1]]);
  assert.deepEqual(filterByDate(rows, null, null), rows);
});

test("chunkRows splits sorted rows into roughly equal-character chunks", () => {
  const rows = [{ text: "aaaaaaaaaa" }, { text: "bbbbbbbbbb" }, { text: "cccccccccc" }, { text: "dddddddddd" }];
  const chunks = chunkRows(rows, 2);
  assert.equal(chunks.length, 2);
  assert.deepEqual(chunks[0], [rows[0], rows[1]]);
  assert.deepEqual(chunks[1], [rows[2], rows[3]]);
});

test("chunkRows requesting more chunks than rows still returns exactly chunkCount arrays", () => {
  const rows = [{ text: "one" }];
  const chunks = chunkRows(rows, 3);
  assert.equal(chunks.length, 3);
  assert.deepEqual(chunks[0], rows);
  assert.deepEqual(chunks[1], []);
  assert.deepEqual(chunks[2], []);
});

test("renderChunk renders the house separator format with an 8-char session prefix", () => {
  const rendered = renderChunk([{ t: "2026-06-01T00:00:00.000Z", s: "session-aaa-11112222", cwd: "/home/emsenn/info", text: "Ship it." }]);
  assert.equal(rendered, "\n---\n[2026-06-01T00:00:00.000Z] session=session- cwd=/home/emsenn/info\nShip it.\n");
});

test("summaryLine reports files/messages/chars/range/chunks, or files=remote:<host> when file count is unknown", () => {
  const rows = [{ t: "2026-06-01T00:00:00.000Z", text: "abc" }, { t: "2026-06-02T00:00:00.000Z", text: "de" }];
  const line = summaryLine({ fileCount: 2, rows, chunks: [[rows[0]], [rows[1]]], host: null });
  assert.equal(line, "files=2 messages=2 chars=5 range=2026-06-01T00:00:00.000Z..2026-06-02T00:00:00.000Z chunks=[3,2]");
  const remoteLine = summaryLine({ fileCount: null, rows, chunks: [], host: "cold-red-gate" });
  assert.match(remoteLine, /^files=remote:cold-red-gate /u);
});

test("extractClaudeOwnerMessages keeps only root-file owner text, excluding noise and tool_result blocks", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "owner-extract-claude-"));
  try {
    await writeFile(path.join(directory, "session-a.jsonl"), [
      JSON.stringify({ type: "user", sessionId: "session-a-11112222", timestamp: "2026-06-01T10:00:00.000Z", cwd: "/home/emsenn/info", message: { content: "Ship the thing by Friday." } }),
      JSON.stringify({ type: "assistant", sessionId: "session-a-11112222", timestamp: "2026-06-01T10:00:05.000Z", cwd: "/home/emsenn/info", message: { content: [{ type: "text", text: "On it." }] } }),
      JSON.stringify({ type: "user", sessionId: "session-a-11112222", timestamp: "2026-06-01T10:05:00.000Z", cwd: "/home/emsenn/info", message: { content: [{ type: "text", text: "Also fix the pin." }, { type: "tool_result", content: "ignored" }] } }),
      JSON.stringify({ type: "user", sessionId: "session-a-11112222", timestamp: "2026-06-01T10:06:00.000Z", cwd: "/home/emsenn/info", message: { content: "<command-message>x</command-message>" } }),
    ].join("\n"));
    const rows = await extractClaudeOwnerMessages([path.join(directory, "session-a.jsonl")]);
    assert.deepEqual(rows.map((row) => row.text), ["Ship the thing by Friday.", "Also fix the pin."]);
    assert.equal(rows[0].s, "session-a-11112222");
    assert.equal(rows[0].n, "Ship the thing by Friday.".length);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("extractCodexOwnerMessages skips a whole subagent-thread rollout and drops injected environment_context", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "owner-extract-codex-"));
  try {
    const root = path.join(directory, "rollout-root.jsonl");
    const subagent = path.join(directory, "rollout-subagent.jsonl");
    await writeFile(root, [
      JSON.stringify({ timestamp: "2026-06-03T10:00:00.000Z", type: "session_meta", payload: { id: "root1", cwd: "/home/emsenn/561-group" } }),
      JSON.stringify({ timestamp: "2026-06-03T10:00:01.000Z", type: "response_item", payload: { type: "message", role: "user", content: [{ type: "input_text", text: "<environment_context>\n  <cwd>/home/emsenn/561-group</cwd>\n</environment_context>" }] } }),
      JSON.stringify({ timestamp: "2026-06-03T10:00:05.000Z", type: "response_item", payload: { type: "message", role: "user", content: [{ type: "input_text", text: "Codex ruling: never rotate the provider keys." }] } }),
    ].join("\n"));
    await writeFile(subagent, [
      JSON.stringify({ timestamp: "2026-06-03T11:00:00.000Z", type: "session_meta", payload: { id: "subagent1", cwd: "/home/emsenn/561-group", thread_source: "subagent", source: { subagent: { thread_spawn: { parent_thread_id: "root1" } } } } }),
      JSON.stringify({ timestamp: "2026-06-03T11:00:05.000Z", type: "response_item", payload: { type: "message", role: "user", content: [{ type: "input_text", text: "A dispatched subagent's own prompt, never the owner." }] } }),
    ].join("\n"));
    const rows = await extractCodexOwnerMessages([root, subagent]);
    assert.deepEqual(rows.map((row) => row.text), ["Codex ruling: never rotate the provider keys."]);
    assert.equal(rows[0].s, "root1");
    assert.equal(rows[0].cwd, "/home/emsenn/561-group");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("date-bounded Codex extraction discards old turns before they enter the in-memory corpus", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "owner-extract-codex-date-"));
  try {
    const root = path.join(directory, "rollout-root.jsonl");
    await writeFile(root, [
      JSON.stringify({ timestamp: "2026-06-01T10:00:00.000Z", type: "session_meta", payload: { id: "root1", cwd: "/home/emsenn/info" } }),
      JSON.stringify({ timestamp: "2026-06-01T10:00:05.000Z", type: "response_item", payload: { role: "user", content: "old direction" } }),
      JSON.stringify({ timestamp: "2026-06-04T10:00:05.000Z", type: "response_item", payload: { role: "user", content: "current direction" } }),
    ].join("\n"));
    const rows = await extractCodexOwnerMessages([root], [], { since: "2026-06-03T00:00:00.000Z", until: "2026-06-05T00:00:00.000Z" });
    assert.deepEqual(rows.map((row) => row.text), ["current direction"]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("runRemoteExtraction surfaces a clear error when node is absent on the remote host", async () => {
  const spawnFn = () => ({ status: 127, stdout: "", stderr: "bash: node: command not found", error: null });
  await assert.rejects(
    () => runRemoteExtraction({ host: "some-host", store: "/home/x/.claude/projects/-x", kind: "claude", since: null, until: null }, { spawnFn, readSource: async () => "// source" }),
    /node is not available on some-host/u,
  );
});

test("runRemoteExtraction parses the remote worker's JSONL stdout", async () => {
  const row = { s: "root1", t: "2026-06-03T10:00:05.000Z", cwd: "/home/emsenn/561-group", n: 10, text: "hello" };
  const spawnFn = () => ({ status: 0, stdout: `${JSON.stringify(row)}\n`, stderr: "files=1 messages=1 chars=5 range=x..y chunks=[]", error: null });
  const rows = await runRemoteExtraction({ host: "cold-red-gate", store: "~/.claude/projects/-x", kind: "claude", since: null, until: null }, { spawnFn, readSource: async () => "// source" });
  assert.deepEqual(rows, [row]);
});

test("end-to-end CLI run over a tiny fixture store writes owner-messages.jsonl and the requested chunk count", async () => {
  const { spawnSync } = await import("node:child_process");
  const scriptPath = path.join(new URL("..", import.meta.url).pathname, "scripts", "extract-owner-messages.mjs");
  const storeDir = await mkdtemp(path.join(os.tmpdir(), "owner-extract-e2e-store-"));
  const outDir = await mkdtemp(path.join(os.tmpdir(), "owner-extract-e2e-out-"));
  try {
    await mkdir(path.join(storeDir, "nested-session", "subagents"), { recursive: true });
    await writeFile(path.join(storeDir, "session-a.jsonl"), [
      JSON.stringify({ type: "user", sessionId: "session-a-11112222", timestamp: "2026-06-01T10:00:00.000Z", cwd: "/home/emsenn/info", message: { content: "First owner turn." } }),
      JSON.stringify({ type: "user", sessionId: "session-a-11112222", timestamp: "2026-06-01T10:05:00.000Z", cwd: "/home/emsenn/info", message: { content: "Second owner turn." } }),
    ].join("\n"));
    await writeFile(path.join(storeDir, "nested-session", "subagents", "agent-1.jsonl"), JSON.stringify({
      type: "user", sessionId: "nested-session", timestamp: "2026-06-01T10:01:00.000Z", cwd: "/home/emsenn/info", message: { content: "Subagent prompt, never the owner." },
    }));

    const result = spawnSync("node", [scriptPath, "--store", storeDir, "--kind", "claude", "--out", outDir, "--chunks", "2"], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stderr, /^files=1 messages=2 chars=\d+ range=.+\.\..+ chunks=\[.+\]/mu);

    const jsonl = await readFile(path.join(outDir, "owner-messages.jsonl"), "utf8");
    const rows = jsonl.trim().split("\n").map((line) => JSON.parse(line));
    assert.deepEqual(rows.map((row) => row.text), ["First owner turn.", "Second owner turn."]);

    const chunkOne = await readFile(path.join(outDir, "chunk-01.txt"), "utf8");
    assert.match(chunkOne, /session=session-/u);

    const stdoutRun = spawnSync("node", [scriptPath, "--store", storeDir, "--session", "session-a"], { encoding: "utf8" });
    assert.equal(stdoutRun.status, 0, stdoutRun.stderr);
    assert.match(stdoutRun.stdout, /First owner turn\.[\s\S]*Second owner turn\./u);
    assert.match(stdoutRun.stderr, /^files=1 messages=2 /mu);
  } finally {
    await rm(storeDir, { recursive: true, force: true });
    await rm(outDir, { recursive: true, force: true });
  }
});
