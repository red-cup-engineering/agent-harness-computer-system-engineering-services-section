#!/usr/bin/env node

// Topic-oriented transcript search: which prior sessions (Claude root, Claude
// subagent, Codex) actually discussed a topic, ranked by match density. Grep
// never reads full transcript content into this process — it stays bounded
// even against a multi-gigabyte transcript tree.

import { spawnSync } from "node:child_process";
import { readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_RANK_CAP = 150;

// Both harnesses inline large base64 payloads that are not human-authored
// text: Claude extended-thinking blocks carry a "signature" field, Codex
// reasoning items carry an "encrypted_content" field. Neither can ever
// legitimately contain a search term, but base64's alphabet coincidentally
// contains short/common terms often enough to corrupt both file selection
// and match-density ranking. Verified 2026-08-31: plain "MUD" substring-
// matched 33 of 36 Codex session files; 6 of those 33 (18%) had zero real
// "mud" text and matched only inside encrypted_content blobs. Each such
// field is confirmed to sit alone on its own JSONL line (never sharing a
// line with real text/tool content), so excluding matching lines outright
// is safe. Extend this list if another harness or field is found to leak
// the same way.
const NOISE_LINE_MARKERS = ["encrypted_content", '"signature":"'];

// Pipe every grep through a noise-line exclusion first, entirely in
// subprocesses (bash -c with positional $1/$2 so file paths and terms never
// touch shell interpolation) — no transcript content is read into this
// process either way, matching the existing bounded design.
function runNoiseFilteredGrep(file, term, innerGrepArgs) {
  const excludeArgs = NOISE_LINE_MARKERS.map((marker) => `-e "${marker.replaceAll('"', '\\"')}"`).join(" ");
  const script = `grep -v -F ${excludeArgs} -- "$1" | grep ${innerGrepArgs} -- "$2"`;
  return spawnSync("bash", ["-c", script, "bash", file, term], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
}

function parseArgs(argv) {
  const options = {
    claudeRoot: path.join(process.env.HOME ?? "", ".claude", "projects", "-home-emsenn-info"),
    codexRoot: path.join(process.env.CODEX_HOME ?? path.join(process.env.HOME ?? "", ".codex"), "sessions"),
    terms: [],
    harness: "all",
    includeSubagents: false,
    limit: 10,
    snippetChars: 180,
    output: null,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--term") options.terms.push(argv[++index]);
    else if (argument === "--harness") options.harness = argv[++index];
    else if (argument === "--include-subagents") options.includeSubagents = true;
    else if (argument === "--limit") options.limit = Number(argv[++index]);
    else if (argument === "--claude-root") options.claudeRoot = argv[++index];
    else if (argument === "--codex-root") options.codexRoot = argv[++index];
    else if (argument === "--output") options.output = argv[++index];
    else throw new Error(`Unknown argument: ${argument}`);
  }
  if (options.terms.length === 0) {
    throw new Error("At least one --term is required (a single broad term like \"relationality\" matches most of the corpus; combine two or more with --term to narrow)");
  }
  if (!["all", "claude", "codex"].includes(options.harness)) {
    throw new Error(`--harness must be all, claude, or codex (got ${options.harness})`);
  }
  return options;
}

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

async function listSubagentFiles(directory) {
  const results = [];
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return results;
    throw error;
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const subagentsDir = path.join(directory, entry.name, "subagents");
    let subEntries;
    try {
      subEntries = await readdir(subagentsDir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const subEntry of subEntries) {
      if (subEntry.isFile() && subEntry.name.endsWith(".jsonl")) {
        results.push({ file: path.join(subagentsDir, subEntry.name), rootSessionId: entry.name });
      }
    }
  }
  return results;
}

async function listCodexFiles(directory) {
  const results = [];
  async function walk(dir) {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
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

// Coarse candidate selection stays one batched command across every file —
// fast even against hundreds of multi-MB transcripts — and does NOT apply
// the noise-line exclusion below. That means a handful of files can enter
// the candidate set on a pure base64 coincidence (verified 2026-08-31: 6 of
// 33 "MUD"-matched Codex files, 18%). That's an acceptable coarse-pass
// error: grepCount/grepSnippet below re-check with noise excluded on only
// the (rankCap-bounded, so cheap) ranked subset, so any such file shows 0
// real matches in the actual ranked output instead of a false snippet.
function grepMatchingFiles(files, term) {
  if (files.length === 0) return new Set();
  const result = spawnSync("grep", ["-l", "-i", "-F", "--", term, ...files], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.status !== 0 && result.status !== 1) {
    throw new Error(`grep -l failed (status ${result.status}): ${result.stderr}`);
  }
  return new Set(result.stdout.split("\n").filter(Boolean));
}

function intersectAll(sets) {
  if (sets.length === 0) return new Set();
  return sets.reduce((acc, set) => new Set([...acc].filter((item) => set.has(item))));
}

function grepCount(file, term) {
  const result = runNoiseFilteredGrep(file, term, "-c -i -F");
  const count = Number.parseInt(result.stdout.trim(), 10);
  return Number.isNaN(count) ? 0 : count;
}

function collectStrings(value, depth = 0) {
  if (depth > 6) return [];
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap((item) => collectStrings(item, depth + 1));
  if (value && typeof value === "object") return Object.values(value).flatMap((item) => collectStrings(item, depth + 1));
  return [];
}

// A matching JSONL line is a whole record (tool calls, metadata, nested
// content arrays), not readable prose. Parse it and pull the actual string
// that contains the term, windowed around the match, instead of printing
// raw JSON from the start of the line.
function extractSnippet(rawLine, term, maxChars) {
  const termLower = term.toLocaleLowerCase("en-US");
  let text = rawLine;
  try {
    const strings = collectStrings(JSON.parse(rawLine));
    const hit = strings.find((value) => value.toLocaleLowerCase("en-US").includes(termLower));
    if (hit) text = hit;
  } catch {
    // Not parseable JSON (or no matching string field) — fall back to the raw line.
  }
  const lower = text.toLocaleLowerCase("en-US");
  const index = lower.indexOf(termLower);
  if (index === -1) {
    return text.length > maxChars ? `${text.slice(0, maxChars)}…` : text;
  }
  const start = Math.max(0, index - Math.floor(maxChars / 2));
  const end = Math.min(text.length, start + maxChars);
  const windowed = text.slice(start, end).replace(/\s+/gu, " ").trim();
  return `${start > 0 ? "…" : ""}${windowed}${end < text.length ? "…" : ""}`;
}

function grepSnippet(file, term, maxChars) {
  const result = runNoiseFilteredGrep(file, term, "-m 1 -i -F");
  const line = (result.stdout.split("\n")[0] ?? "").trim();
  if (!line) return "";
  return extractSnippet(line, term, maxChars);
}

async function rankFiles(files, terms, { limit, snippetChars, rankCap = DEFAULT_RANK_CAP }) {
  if (files.length > rankCap) {
    return { truncated: true, matchedCount: files.length, ranked: [] };
  }
  const scored = [];
  for (const file of files) {
    const counts = terms.map((term) => grepCount(file, term));
    const total = counts.reduce((sum, value) => sum + value, 0);
    const info = await stat(file);
    scored.push({ file, total, mtime: info.mtime, snippet: grepSnippet(file, terms[0], snippetChars) });
  }
  // grepCount above is noise-line-filtered, but the candidate set (`files`)
  // came from the fast unfiltered grep -l pass, so a file can land here on a
  // pure base64 coincidence and score total 0 on every term. Drop those —
  // matchedCount below still reports the coarse candidate count so the
  // discrepancy (a real, verified, single-digit-percent effect for
  // short/generic terms — see SKILL.md) stays visible rather than silently
  // narrowed.
  const ranked = scored.filter((entry) => entry.total > 0);
  ranked.sort((a, b) => b.total - a.total || b.mtime - a.mtime);
  return { truncated: false, matchedCount: files.length, ranked: ranked.slice(0, limit) };
}

async function searchBucket(label, files, terms, options, describe) {
  if (files.length === 0) return { label, searched: 0, matchedCount: 0, truncated: false, ranked: [] };
  const perTermMatches = terms.map((term) => grepMatchingFiles(files, term));
  const intersected = [...intersectAll(perTermMatches)];
  const { truncated, matchedCount, ranked } = await rankFiles(intersected, terms, options);
  return { label, searched: files.length, matchedCount, truncated, ranked: ranked.map((entry) => ({ ...entry, describe: describe?.(entry.file) })) };
}

function formatReport(buckets, options) {
  const lines = [
    `# Topic transcript search: ${options.terms.join(" AND ")}`,
    "",
    "Grep-based, bounded: file lists and match counts only, never full transcript",
    "content. A ranked file is still raw evidence, not authority — read it and",
    "weigh owner text over assistant narration per the audit procedure below.",
    "",
  ];
  for (const bucket of buckets) {
    lines.push(`## ${bucket.label} (${bucket.matchedCount} of ${bucket.searched} files matched all terms)`, "");
    if (bucket.truncated) {
      lines.push(`Too many matches to rank (cap ${DEFAULT_RANK_CAP}) — add another --term to narrow before reading further.`, "");
      continue;
    }
    if (bucket.ranked.length === 0) {
      lines.push("No matches.", "");
      continue;
    }
    bucket.ranked.forEach((entry, index) => {
      const mtime = entry.mtime instanceof Date ? entry.mtime.toISOString() : entry.mtime;
      const tag = entry.describe ? ` [${entry.describe}]` : "";
      lines.push(`${index + 1}. ${mtime}  ${entry.total} matches  ${entry.file}${tag}`);
      if (entry.snippet) lines.push(`   snippet: ${entry.snippet}`);
    });
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}

async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  const buckets = [];

  if (options.harness !== "codex") {
    const rootFiles = await listJsonlFiles(options.claudeRoot);
    buckets.push(await searchBucket("claude-root", rootFiles, options.terms, options));

    if (options.includeSubagents) {
      const subagentEntries = await listSubagentFiles(options.claudeRoot);
      const subagentFiles = subagentEntries.map((entry) => entry.file);
      const rootIdByFile = new Map(subagentEntries.map((entry) => [entry.file, entry.rootSessionId]));
      buckets.push(
        await searchBucket("claude-subagents", subagentFiles, options.terms, options, (file) => `root: ${rootIdByFile.get(file)}`),
      );
    }
  }

  if (options.harness !== "claude") {
    const codexFiles = await listCodexFiles(options.codexRoot);
    buckets.push(await searchBucket("codex", codexFiles, options.terms, options));
  }

  const rendered = formatReport(buckets, options);
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

export {
  extractSnippet,
  formatReport,
  grepCount,
  grepMatchingFiles,
  grepSnippet,
  intersectAll,
  listCodexFiles,
  listJsonlFiles,
  listSubagentFiles,
  parseArgs,
  rankFiles,
  searchBucket,
};
