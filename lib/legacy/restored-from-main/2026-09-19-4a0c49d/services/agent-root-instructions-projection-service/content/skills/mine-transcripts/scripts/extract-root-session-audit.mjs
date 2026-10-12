#!/usr/bin/env node

import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

function parseArgs(argv) {
  const options = {
    sessionsRoot: path.join(process.env.CODEX_HOME ?? path.join(process.env.HOME ?? "", ".codex"), "sessions"),
    sessionId: process.env.CODEX_SESSION_ID,
    output: null,
    terms: [],
    includeContext: false,
    maxBlocks: 100,
    maxOwnerChars: 8000,
    maxAssistantChars: 4000,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--include-context") options.includeContext = true;
    else if (argument === "--sessions-root") options.sessionsRoot = argv[++index];
    else if (argument === "--session-id") options.sessionId = argv[++index];
    else if (argument === "--output") options.output = argv[++index];
    else if (argument === "--term") options.terms.push(argv[++index]);
    else if (argument === "--max-blocks") options.maxBlocks = Number(argv[++index]);
    else if (argument === "--max-owner-chars") options.maxOwnerChars = Number(argv[++index]);
    else if (argument === "--max-assistant-chars") options.maxAssistantChars = Number(argv[++index]);
    else throw new Error(`Unknown argument: ${argument}`);
  }
  if (!options.sessionId) throw new Error("No root session id: set CODEX_SESSION_ID or pass --session-id");
  return options;
}

async function findRolloutById(directory, sessionId) {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const candidate = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      const found = await findRolloutById(candidate, sessionId);
      if (found) return found;
    } else if (entry.name.endsWith(`${sessionId}.jsonl`)) {
      return candidate;
    }
  }
  return null;
}

function parseJsonLines(text) {
  return text.split(/\r?\n/u).filter(Boolean).map((line, index) => {
    try {
      return JSON.parse(line);
    } catch (error) {
      throw new Error(`Invalid JSONL at line ${index + 1}: ${error.message}`);
    }
  });
}

function sessionMeta(records) {
  return records.find((record) => record.type === "session_meta")?.payload;
}

async function resolveRootRollout(sessionsRoot, requestedId) {
  let sessionId = requestedId;
  const visited = new Set();
  while (sessionId && !visited.has(sessionId)) {
    visited.add(sessionId);
    const rolloutPath = await findRolloutById(sessionsRoot, sessionId);
    if (!rolloutPath) throw new Error(`No rollout found for session ${sessionId}`);
    const records = parseJsonLines(await readFile(rolloutPath, "utf8"));
    const meta = sessionMeta(records);
    const parentId = meta?.source?.subagent?.thread_spawn?.parent_thread_id;
    if (!parentId) return { rolloutPath, records, meta };
    sessionId = parentId;
  }
  throw new Error(`Could not resolve a root rollout from ${requestedId}`);
}

function messageText(payload) {
  return (payload.content ?? [])
    .filter((item) => item.type === "input_text" || item.type === "output_text")
    .map((item) => item.text ?? "")
    .join("\n");
}

function isInjectedContext(text) {
  const value = text.trimStart();
  return value.startsWith("# AGENTS.md instructions for ")
    || value.startsWith("<environment_context>")
    || value.startsWith("<permissions instructions>")
    || value.startsWith("<app-context>");
}

function extractOwnerBlocks(records, { includeContext = false } = {}) {
  const blocks = [];
  let current = null;
  const seenRecords = new Set();
  for (const record of records) {
    const payload = record.payload ?? {};
    if (record.type !== "response_item" || payload.type !== "message") continue;
    if (payload.role !== "user" && payload.role !== "assistant") continue;
    const text = messageText(payload);
    if (!text) continue;
    const fingerprint = `${record.timestamp ?? ""}\0${payload.role}\0${text}`;
    if (seenRecords.has(fingerprint)) continue;
    seenRecords.add(fingerprint);
    if (payload.role === "user") {
      const context = isInjectedContext(text);
      if (context && !includeContext) {
        current = null;
        continue;
      }
      current = { timestamp: record.timestamp, text, context, assistant: [] };
      blocks.push(current);
    } else if (current) {
      current.assistant.push({ timestamp: record.timestamp, text });
    }
  }
  return blocks;
}

function truncate(text, maximum) {
  if (text.length <= maximum) return text;
  return `${text.slice(0, maximum)}\n\n[truncated at ${maximum} characters]`;
}

function renderAudit({ rolloutPath, meta, blocks }, options) {
  const terms = options.terms.map((term) => term.toLocaleLowerCase("en-US"));
  const filtered = blocks.filter((block) => {
    if (terms.length === 0) return true;
    const haystack = [block.text, ...block.assistant.map((item) => item.text)].join("\n").toLocaleLowerCase("en-US");
    return terms.some((term) => haystack.includes(term));
  }).slice(0, options.maxBlocks);
  const lines = [
    "# Root session ruling audit",
    "",
    `- Session: \`${meta?.id ?? "unknown"}\``,
    `- Rollout: \`${rolloutPath}\``,
    `- Owner blocks: ${filtered.length} of ${blocks.length}`,
    "- Precedence: later owner blocks override earlier conflicting language",
    "",
  ];
  filtered.forEach((block, index) => {
    lines.push(`## Owner ${index + 1} — ${block.timestamp ?? "timestamp unavailable"}`, "", truncate(block.text, options.maxOwnerChars), "");
    if (block.assistant.length > 0) {
      lines.push("### Assistant actions before the next owner message", "");
      block.assistant.forEach((item) => {
        lines.push(`#### ${item.timestamp ?? "timestamp unavailable"}`, "", truncate(item.text, options.maxAssistantChars), "");
      });
    }
  });
  return `${lines.join("\n")}\n`;
}

async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  const root = await resolveRootRollout(options.sessionsRoot, options.sessionId);
  const blocks = extractOwnerBlocks(root.records, options);
  const rendered = renderAudit({ ...root, blocks }, options);
  if (options.output) await writeFile(options.output, rendered, "utf8");
  else process.stdout.write(rendered);
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (invokedPath === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}

export { extractOwnerBlocks, parseArgs, parseJsonLines, renderAudit, resolveRootRollout };
