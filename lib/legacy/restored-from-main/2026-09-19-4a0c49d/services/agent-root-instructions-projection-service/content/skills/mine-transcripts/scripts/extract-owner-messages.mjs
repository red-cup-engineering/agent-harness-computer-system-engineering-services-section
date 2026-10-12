#!/usr/bin/env node

// Deterministic owner-message extractor, local or remote (ssh) over a
// Claude/Codex transcript store. Self-contained on purpose: --host pipes
// this file's own source into a remote `node --input-type=module -`, which
// cannot resolve a relative import to a sibling script on the far side.

import { spawnSync } from "node:child_process";
import { createReadStream } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { createInterface } from "node:readline";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_CHUNKS = 12;
const DEFAULT_REMOTE_TIMEOUT_SECONDS = 300;

// Transcripts can exceed available memory. Keep one line at a time, preserving
// exact source locations and reporting unreadable input instead of losing it.
async function* transcriptLines(file, diagnostics) {
  const input = createReadStream(file, { encoding: "utf8" });
  const lines = createInterface({ input, crlfDelay: Infinity });
  let index = 0;
  try {
    for await (const line of lines) yield [index++, line];
  } catch (error) {
    diagnostics.push({ file, error: error.message });
  } finally {
    lines.close();
    input.destroy();
  }
}

/**
 * Root-only listing (never `<session-id>/subagents/*.jsonl`) — a local copy
 * of find-topic-transcripts.mjs's `listJsonlFiles`, kept local because a
 * remote stdin-executed copy of this file cannot import that sibling.
 * @param {string} directory
 * @returns {Promise<string[]>}
 */
async function listJsonlFiles(directory) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
  return entries.filter((entry) => entry.isFile() && entry.name.endsWith(".jsonl")).map((entry) => path.join(directory, entry.name));
}

/**
 * Codex sessions are date-sharded (`YYYY/MM/DD/rollout-*.jsonl`); walk the
 * whole tree. Local copy of find-topic-transcripts.mjs's `listCodexFiles`,
 * for the same self-containment reason as `listJsonlFiles` above.
 * @param {string} directory
 * @returns {Promise<string[]>}
 */
async function listCodexFiles(directory) {
  const results = [];
  async function walk(dir) {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch (error) {
      if (error.code === "ENOENT") return;
      throw error;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.isFile() && entry.name.endsWith(".jsonl")) results.push(full);
    }
  }
  await walk(directory);
  return results;
}

/**
 * Codex wraps a turn's first user message in harness-injected markup
 * (environment/AGENTS/permissions context), never owner text. Local copy of
 * extract-root-session-audit.mjs's `isInjectedContext`, kept local for the
 * same self-containment reason as the file listers above.
 * @param {string} text
 * @returns {boolean}
 */
function isInjectedContext(text) {
  const value = text.trimStart();
  return value.startsWith("# AGENTS.md instructions for ")
    || value.startsWith("<environment_context>")
    || value.startsWith("<permissions instructions>")
    || value.startsWith("<app-context>")
    || value.startsWith("<codex_internal_context");
}

/**
 * Expand a leading `~` or `~/...` against the current process's HOME. Every
 * ssh invocation below passes argv arrays (no shell), so the remote node
 * process must expand its own `~` the same way the local one does.
 * @param {string} inputPath
 * @returns {string}
 */
function expandHome(inputPath) {
  if (inputPath === "~") return process.env.HOME ?? inputPath;
  if (inputPath.startsWith("~/")) return path.join(process.env.HOME ?? "", inputPath.slice(2));
  return inputPath;
}

/**
 * Start of today in the local timezone, as the ISO/UTC string transcripts
 * carry, so `--today` string-compares against `timestamp` like `--since`.
 * @param {Date} [now]
 * @returns {string}
 */
function localMidnightIso(now = new Date()) {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
}

/**
 * @param {string[]} argv
 * @returns {{store: string, kind: "claude"|"codex", host: string|null, out: string|null, chunks: number, since: string|null, until: string|null, emitJsonl: boolean}}
 */
function parseArgs(argv) {
  const options = {
    store: null,
    kind: "claude",
    host: null,
    out: null,
    chunks: DEFAULT_CHUNKS,
    since: null,
    until: null,
    session: null,
    emitJsonl: false,
    stores: null,
    patterns: null,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--store") options.store = argv[++index];
    else if (argument === "--kind") options.kind = argv[++index];
    else if (argument === "--host") options.host = argv[++index];
    else if (argument === "--out") options.out = argv[++index];
    else if (argument === "--chunks") options.chunks = Number(argv[++index]);
    else if (argument === "--since") options.since = argv[++index];
    else if (argument === "--until") options.until = argv[++index];
    else if (argument === "--today") options.since = localMidnightIso();
    else if (argument === "--session") options.session = argv[++index];
    else if (argument === "--emit-jsonl") options.emitJsonl = true;
    else if (argument === "--stores") options.stores = argv[++index];
    else if (argument === "--patterns") options.patterns = argv[++index];
    else throw new Error(`Unknown argument: ${argument}`);
  }
  if (!["claude", "codex"].includes(options.kind)) {
    throw new Error(`--kind must be claude or codex (got ${options.kind})`);
  }
  if (options.store === null) {
    options.store = options.kind === "codex"
      ? path.join(process.env.CODEX_HOME ?? path.join(process.env.HOME ?? "", ".codex"), "sessions")
      : path.join(process.env.HOME ?? "", ".claude", "projects", "-home-emsenn-info");
  }
  options.store = expandHome(options.store);
  if (!Number.isInteger(options.chunks) || options.chunks < 1) {
    throw new Error(`--chunks must be a positive integer (got ${argv.includes("--chunks") ? options.chunks : "unset"})`);
  }
  return options;
}

/**
 * Owner-authored slash-command echoes and auto-compact continuation banners
 * are synthetic "user" turns, not owner text — the same exclusion the
 * skill's Codex `<environment_context>` filter makes for its own harness.
 * @param {string} text
 * @returns {boolean}
 */
function isNoiseText(text) {
  const trimmed = text.trimStart();
  if (trimmed.startsWith("<command-") || trimmed.startsWith("<local-command")) return true;
  if (trimmed.startsWith("<task-notification>") || trimmed.startsWith("[Request interrupted by user")) return true;
  if (trimmed.startsWith("<teammate-message")) return true;
  if (text.includes("This session is being continued")) return true;
  return false;
}

/**
 * @param {unknown} content Claude `message.content` — a plain string, or an
 *   array of typed blocks (`text`, `tool_result`, `tool_use`, `thinking`).
 * @returns {string} Joined `text`-typed blocks only; empty for anything else.
 */
function claudeMessageText(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.filter((block) => block?.type === "text").map((block) => block.text ?? "").join("\n");
}

/**
 * Extract owner ("user") turns from Claude root transcripts. Root files
 * only — a `<session-id>/subagents/*.jsonl` fork is a different
 * conversation's own turns, never the owner's, so it is never among the
 * files this function is given.
 * @param {string[]} files
 * @returns {Promise<{s: string, t: string, cwd: string, n: number, text: string}[]>}
 */
async function extractClaudeOwnerMessages(files, diagnostics = [], selection = {}) {
  const rows = [];
  for (const file of files) {
    const fallbackSession = path.basename(file, ".jsonl");
    for await (const [index, line] of transcriptLines(file, diagnostics)) {
      if (!line) continue;
      let record;
      try {
        record = JSON.parse(line);
      } catch {
        diagnostics.push({ file, line: index + 1, error: "invalid JSON record" });
        continue;
      }
      if (record.type !== "user" || record.isMeta === true || record.isSidechain === true) continue;
      const messageText = claudeMessageText(record.message?.content);
      if (!messageText || isNoiseText(messageText)) continue;
      const timestamp = record.timestamp ?? "";
      if (!withinDateRange(timestamp, selection.since, selection.until)) continue;
      rows.push({
        s: record.sessionId ?? fallbackSession,
        t: timestamp,
        cwd: record.cwd ?? "",
        n: messageText.length,
        text: messageText,
        source: file,
        line: index + 1,
      });
    }
  }
  return rows;
}

/**
 * @param {unknown} content Codex `payload.content` — a plain string, or an
 *   array of blocks shaped `{type: "input_text"|"output_text", text}` (the
 *   documented shape) or a bare `{input_text}` field (an alternate shape
 *   this extractor also accepts).
 * @returns {string}
 */
function codexMessageText(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((item) => {
      if (typeof item === "string") return item;
      return item?.text ?? item?.input_text ?? "";
    })
    .filter(Boolean)
    .join("\n");
}

/**
 * Extract owner turns from Codex rollouts. A rollout whose `session_meta`
 * marks it `thread_source: "subagent"` (a delegated sub-thread, per its
 * `source.subagent.thread_spawn` parentage) is skipped whole — same root-
 * only law as the Claude side, applied to Codex's fork shape.
 * @param {string[]} files
 * @returns {Promise<{s: string, t: string, cwd: string, n: number, text: string}[]>}
 */
async function extractCodexOwnerMessages(files, diagnostics = [], selection = {}) {
  const rows = [];
  for (const file of files) {
    let sessionId = path.basename(file, ".jsonl");
    let cwd = "";
    let skipFile = false;
    const fileRows = [];
    for await (const [index, line] of transcriptLines(file, diagnostics)) {
      if (!line) continue;
      let record;
      try {
        record = JSON.parse(line);
      } catch {
        diagnostics.push({ file, line: index + 1, error: "invalid JSON record" });
        continue;
      }
      if (record.type === "session_meta") {
        const meta = record.payload ?? {};
        sessionId = meta.id ?? sessionId;
        cwd = meta.cwd ?? cwd;
        if (meta.thread_source === "subagent" || meta.source === "subagent" || meta.source?.subagent) {
          skipFile = true;
          break;
        }
        continue;
      }
      if (record.type !== "response_item") continue;
      const payload = record.payload ?? {};
      const isUserTurn = payload.role === "user" || payload.type === "user_message";
      if (!isUserTurn) continue;
      const messageText = codexMessageText(payload.content);
      if (!messageText || isNoiseText(messageText) || isInjectedContext(messageText)) continue;
      const timestamp = record.timestamp ?? "";
      // Do this while the file is streaming. Applying --since only after every
      // Codex rollout has been parsed retains the entire historical corpus in
      // memory and makes a date-bounded owner audit fail before it can report
      // its coverage.
      if (!withinDateRange(timestamp, selection.since, selection.until)) continue;
      fileRows.push({ s: sessionId, t: timestamp, cwd, n: messageText.length, text: messageText, source: file, line: index + 1 });
    }
    if (!skipFile) rows.push(...fileRows);
  }
  return rows;
}

/**
 * @param {{s: string, t: string, cwd: string, n: number, text: string}[]} rows
 * @param {string|null} since Inclusive ISO lower bound (string-compared).
 * @param {string|null} until Inclusive ISO upper bound (string-compared).
 * @returns {typeof rows}
 */
function filterByDate(rows, since, until) {
  return rows.filter((row) => withinDateRange(row.t, since, until));
}

/** Keep a date-bounded extraction bounded before rows enter the corpus. */
function withinDateRange(timestamp, since, until) {
  if (since && timestamp < since) return false;
  if (until && timestamp > until) return false;
  return true;
}

/**
 * Run one store's extraction: list root files (sorted for determinism,
 * since directory read order is not guaranteed), extract, date-filter, and
 * sort by timestamp.
 * @param {{store: string, kind: "claude"|"codex", since: string|null, until: string|null}} options
 * @returns {Promise<{files: string[], rows: {s: string, t: string, cwd: string, n: number, text: string}[]}>}
 */
async function extractRows(options) {
  const diagnostics = [];
  const files = options.kind === "codex"
    ? (await listCodexFiles(options.store)).sort()
    : (await listJsonlFiles(options.store)).sort();
  const rows = options.kind === "codex"
    ? await extractCodexOwnerMessages(files, diagnostics, options)
    : await extractClaudeOwnerMessages(files, diagnostics, options);
  const filtered = dedupeRows(filterBySession(filterByDate(rows, options.since, options.until), options.session));
  filtered.sort((a, b) => (a.t < b.t ? -1 : a.t > b.t ? 1 : 0));
  return { files, rows: filtered, diagnostics };
}

/** Search owner text, never assistant quotations or raw transcript JSON. */
function matchOwnerMessages(rows, patterns) {
  if (!Array.isArray(patterns) || patterns.length === 0) throw new TypeError("patterns must be a nonempty array");
  const ids = new Set();
  const compiled = patterns.map(({ id, pattern }) => {
    if (typeof id !== "string" || !id || ids.has(id) || typeof pattern !== "string" || !pattern) throw new TypeError("each pattern needs a unique id and a nonempty pattern");
    ids.add(id);
    return { id, regex: new RegExp(pattern, "giu") };
  });
  return rows.flatMap((row) => {
    const matches = compiled.flatMap(({ id, regex }) => Array.from(row.text.matchAll(regex), (match) => ({ id, index: match.index, text: match[0] })));
    return matches.length ? [{ ...row, matches }] : [];
  });
}

/** Enumerated stores make corpus coverage explicit; errors never become empty success. */
async function extractStores(stores, options = {}) {
  if (!Array.isArray(stores) || stores.length === 0) throw new TypeError("stores must be a nonempty array");
  const coverage = [], rows = [];
  for (const spec of stores) {
    if (!["claude", "codex"].includes(spec.kind) || typeof spec.store !== "string" || !spec.store) throw new TypeError("each store needs kind claude|codex and a store path");
    const input = { ...options, ...spec, store: expandHome(spec.store) };
    try {
      if (!spec.host) await readdir(input.store);
      const result = spec.host ? { rows: await runRemoteExtraction(input), files: null, diagnostics: null } : await extractRows(input);
      coverage.push({ ...spec, files: result.files?.length ?? null, messages: result.rows.length, diagnostics: result.diagnostics });
      rows.push(...result.rows.map((row) => ({ ...row, kind: spec.kind, host: spec.host ?? "local", store: spec.store })));
    } catch (error) {
      coverage.push({ ...spec, error: error.message });
    }
  }
  return { rows: dedupeRows(rows).sort((a, b) => a.t.localeCompare(b.t)), coverage };
}

/**
 * A resumed or forked session file re-carries the earlier turns; keep the
 * first copy of each (timestamp, text) pair.
 * @template {{t: string, text: string}} Row
 * @param {Row[]} rows
 * @returns {Row[]}
 */
function dedupeRows(rows) {
  const seen = new Set();
  return rows.filter((row) => {
    const key = `${row.t}\u0000${row.text}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Keep rows whose session id starts with `prefix` (a full id or the first
 * characters of one); no prefix keeps everything.
 * @template {{s: string}} Row
 * @param {Row[]} rows
 * @param {string|null} prefix
 * @returns {Row[]}
 */
function filterBySession(rows, prefix) {
  if (!prefix) return rows;
  return rows.filter((row) => String(row.s).startsWith(prefix));
}

/**
 * Partition rows (already sorted by timestamp) into `chunkCount` slices of
 * roughly equal total character count. Greedy prefix-sum split — the last
 * chunk absorbs any remainder.
 * @param {{text: string}[]} rows
 * @param {number} chunkCount
 * @returns {Array<typeof rows>}
 */
function chunkRows(rows, chunkCount) {
  const chunks = [];
  if (rows.length === 0) {
    for (let index = 0; index < chunkCount; index += 1) chunks.push([]);
    return chunks;
  }
  const totalChars = rows.reduce((sum, row) => sum + row.text.length, 0);
  const target = Math.max(1, Math.ceil(totalChars / chunkCount));
  let current = [];
  let currentChars = 0;
  for (const row of rows) {
    current.push(row);
    currentChars += row.text.length;
    if (currentChars >= target && chunks.length < chunkCount - 1) {
      chunks.push(current);
      current = [];
      currentChars = 0;
    }
  }
  chunks.push(current);
  while (chunks.length < chunkCount) chunks.push([]);
  return chunks;
}

/**
 * @param {{t: string, s: string, cwd: string, text: string}[]} rows
 * @returns {string}
 */
function renderChunk(rows) {
  return rows.map((row) => `\n---\n[${row.t}] session=${String(row.s).slice(0, 8)} cwd=${row.cwd}\n${row.text}\n`).join("");
}

/**
 * @param {{fileCount: number|null, rows: {t: string, text: string}[], chunks: Array<{text: string}[]>, host: string|null}} args
 * @returns {string} The exact line written to stderr (also returned for tests).
 */
function summaryLine({ fileCount, rows, chunks, host }) {
  const chars = rows.reduce((sum, row) => sum + row.text.length, 0);
  const first = rows[0]?.t ?? "-";
  const last = rows[rows.length - 1]?.t ?? "-";
  const sizes = chunks.filter((chunk) => chunk.length > 0).map((chunk) => chunk.reduce((sum, row) => sum + row.text.length, 0));
  const filesPart = fileCount === null ? `files=remote:${host}` : `files=${fileCount}`;
  return `${filesPart} messages=${rows.length} chars=${chars} range=${first}..${last} chunks=${JSON.stringify(sizes)}`;
}

/**
 * @param {{out: string, chunks: number}} options
 * @param {{s: string, t: string, cwd: string, n: number, text: string}[]} rows
 * @returns {Promise<{jsonlPath: string, chunkPaths: string[], chunks: Array<typeof rows>}>}
 */
async function writeOutputs(options, rows) {
  await mkdir(options.out, { recursive: true });
  const jsonlPath = path.join(options.out, "owner-messages.jsonl");
  const jsonlContent = rows.map((row) => JSON.stringify(row)).join("\n") + (rows.length > 0 ? "\n" : "");
  await writeFile(jsonlPath, jsonlContent, "utf8");

  const chunks = chunkRows(rows, options.chunks);
  const pad = Math.max(2, String(chunks.length).length);
  const chunkPaths = [];
  for (let index = 0; index < chunks.length; index += 1) {
    const name = `chunk-${String(index + 1).padStart(pad, "0")}.txt`;
    const chunkPath = path.join(options.out, name);
    await writeFile(chunkPath, renderChunk(chunks[index]), "utf8");
    chunkPaths.push(chunkPath);
  }
  return { jsonlPath, chunkPaths, chunks };
}

/**
 * Run this same script's extraction on a remote host: pipe this file's own
 * source into `ssh <host> node --input-type=module -`, passing through
 * `--store`/`--kind`/`--since`/`--until` plus `--emit-jsonl` so the remote
 * process only extracts and prints JSONL to its stdout — no remote file is
 * ever written. Read-only on the host.
 * @param {{host: string, store: string, kind: "claude"|"codex", since: string|null, until: string|null}} options
 * @param {{spawnFn?: typeof spawnSync, readSource?: () => Promise<string>}} [deps]
 * @returns {Promise<{s: string, t: string, cwd: string, n: number, text: string}[]>}
 */
async function runRemoteExtraction(options, deps = {}) {
  const spawnFn = deps.spawnFn ?? spawnSync;
  const readSource = deps.readSource ?? (() => readFile(fileURLToPath(import.meta.url), "utf8"));
  const source = await readSource();
  const remoteArgs = ["--store", options.store, "--kind", options.kind, "--emit-jsonl"];
  if (options.since) remoteArgs.push("--since", options.since);
  if (options.until) remoteArgs.push("--until", options.until);
  const sshArgs = [
    String(DEFAULT_REMOTE_TIMEOUT_SECONDS),
    "ssh",
    "-o",
    "BatchMode=yes",
    "-o",
    "ConnectTimeout=8",
    options.host,
    "node",
    "--input-type=module",
    "-",
    ...remoteArgs,
  ];
  const result = spawnFn("timeout", sshArgs, { input: source, encoding: "utf8", maxBuffer: 512 * 1024 * 1024 });
  if (result.error) throw new Error(`ssh to ${options.host} failed to start: ${result.error.message}`);
  const stderr = (result.stderr ?? "").trim();
  if (result.status !== 0) {
    if (/command not found|no such file or directory/iu.test(stderr) && /node/u.test(stderr)) {
      throw new Error(`node is not available on ${options.host}: ${stderr}`);
    }
    throw new Error(`remote extraction on ${options.host} failed (status ${result.status}): ${stderr}`);
  }
  if (stderr) process.stderr.write(`[${options.host}] ${stderr}\n`);
  return (result.stdout ?? "").split(/\r?\n/u).filter(Boolean).map((line) => JSON.parse(line));
}

/**
 * @param {string[]} [argv]
 * @returns {Promise<void>}
 */
async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);

  if (options.emitJsonl) {
    const { files, rows, diagnostics } = await extractRows(options);
    process.stdout.write(rows.map((row) => JSON.stringify(row)).join("\n") + (rows.length > 0 ? "\n" : ""));
    process.stderr.write(`${summaryLine({ fileCount: files.length, rows, chunks: [], host: null })}\n`);
    if (diagnostics.length) {
      process.stderr.write(`${JSON.stringify({ diagnostics })}\n`);
      process.exitCode = 2;
    }
    return;
  }

  let fileCount = null;
  let rows;
  let coverage = null;
  if (options.stores) {
    ({ rows, coverage } = await extractStores(JSON.parse(await readFile(options.stores, "utf8")), options));
    fileCount = coverage.every((item) => typeof item.files === "number") ? coverage.reduce((sum, item) => sum + item.files, 0) : null;
    if (coverage.some((item) => item.error || item.diagnostics?.length)) process.exitCode = 2;
  } else if (options.host) {
    rows = await runRemoteExtraction(options);
  } else {
    const extracted = await extractRows(options);
    fileCount = extracted.files.length;
    rows = extracted.rows;
    if (extracted.diagnostics.length) {
      process.stderr.write(`${JSON.stringify({ diagnostics: extracted.diagnostics })}\n`);
      process.exitCode = 2;
    }
  }

  if (options.patterns) rows = matchOwnerMessages(rows, JSON.parse(await readFile(options.patterns, "utf8")));

  if (!options.out) {
    if (coverage) process.stderr.write(`${JSON.stringify({ coverage })}\n`);
    process.stdout.write(renderChunk(rows));
    process.stderr.write(`${summaryLine({ fileCount, rows, chunks: [rows], host: options.host })}\n`);
    return;
  }
  const { chunks } = await writeOutputs(options, rows);
  if (coverage) await writeFile(path.join(options.out, "coverage.json"), `${JSON.stringify(coverage, null, 2)}\n`);
  process.stderr.write(`${summaryLine({ fileCount, rows, chunks, host: options.host })}\n`);
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
const isStdinEntry = process.argv[1] === "-";
if (isStdinEntry || invokedPath === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}

export {
  chunkRows,
  claudeMessageText,
  codexMessageText,
  dedupeRows,
  expandHome,
  extractClaudeOwnerMessages,
  extractCodexOwnerMessages,
  extractRows,
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
  writeOutputs,
};
