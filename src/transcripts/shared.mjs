import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";

/**
 * The provider-neutral half of a session-transcript dialect: file
 * enumeration and line parsing that do not vary by provider once a
 * provider's own on-disk shard layout is known. A dialect module
 * (codex-dialect.mjs, claude-dialect.mjs, ...) composes these with its own
 * row-shape knowledge; it never re-derives them.
 */

export function sha256Hex(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function sha256Digest(value) {
  return `sha256:${sha256Hex(value)}`;
}

export function dateParts(value, timeZone) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(value);
  const field = (type) => parts.find((part) => part.type === type)?.value;
  return { year: field("year"), month: field("month"), day: field("day") };
}

/**
 * Enumerate `<root>/YYYY/MM/DD/*.jsonl` — Codex's on-disk shard layout.
 * Pads one calendar day either side of the window across both UTC and
 * America/Chicago so a session that rolled over a local-time midnight is
 * never silently dropped. This was candidateFiles(), triplicated across
 * collect-colony-activity.mjs, observe-tool-invocations.mjs, and
 * sensor.mjs before this package existed — but not quite verbatim:
 * sensor.mjs's copy additionally refused a symlinked day directory or a
 * symlinked *.jsonl entry, and the other two did not. That is a strictly
 * stricter, symlink-safety-only condition (no existing test — here or in
 * either consumer — creates a symlink inside a session root), so the one
 * shared body below keeps the stricter guard for all three rather than
 * silently dropping it from the two that lacked it.
 */
export function dayShardedCandidateFiles(root, from, to, { zones = ["UTC", "America/Chicago"] } = {}) {
  const dates = new Map();
  for (let at = from.getTime() - 86_400_000; at <= to.getTime() + 86_400_000; at += 86_400_000) {
    for (const zone of zones) {
      const parts = dateParts(new Date(at), zone);
      dates.set(`${parts.year}-${parts.month}-${parts.day}`, parts);
    }
  }
  const files = [];
  for (const parts of dates.values()) {
    const directory = join(root, parts.year, parts.month, parts.day);
    if (!existsSync(directory) || !lstatSync(directory).isDirectory() || lstatSync(directory).isSymbolicLink()) continue;
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.isFile() && !entry.isSymbolicLink() && entry.name.endsWith(".jsonl")) files.push(join(directory, entry.name));
    }
  }
  return files.sort();
}

/**
 * Enumerate `*.jsonl` files that are direct children of a flat session
 * root — Claude Code's on-disk layout (`<session-uuid>.jsonl`, no date
 * directories). Candidacy is decided by file mtime padded one day either
 * side of the window, since a flat layout carries no timestamp in its own
 * path the way a day-sharded one does. Only direct children of `root` are
 * ever read: a subdirectory such as Claude's per-session `subagents/`
 * sidecar is never traversed into, so a subagent transcript can never echo
 * back into its own parent session's pulse.
 */
export function flatMtimeCandidateFiles(root, from, to, { paddingMs = 86_400_000 } = {}) {
  if (!existsSync(root)) return [];
  const lower = from.getTime() - paddingMs;
  const upper = to.getTime() + paddingMs;
  const files = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".jsonl")) continue;
    const path = join(root, entry.name);
    let mtimeMs;
    try { ({ mtimeMs } = statSync(path)); } catch { continue; }
    if (mtimeMs >= lower && mtimeMs <= upper) files.push(path);
  }
  return files.sort();
}

export function safeRow(line) {
  try { return JSON.parse(line); } catch { return null; }
}

function sessionRootOf(dialect, sessionRoot) {
  const requested = sessionRoot ?? dialect.defaultSessionRoot();
  const root = resolve(requested);
  if (!isAbsolute(requested) || !existsSync(root) || !lstatSync(root).isDirectory() || lstatSync(root).isSymbolicLink()) {
    throw new Error(`contracted session store is unavailable: ${root}`);
  }
  return root;
}

function isFileWithin(root, path) {
  const resolved = resolve(path);
  if (!existsSync(resolved) || !lstatSync(resolved).isFile() || lstatSync(resolved).isSymbolicLink() || !resolved.endsWith(".jsonl")) return false;
  const rel = relative(realpathSync(root), realpathSync(resolved));
  return rel !== "" && rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
}

/** Enumerate concrete session files without reading their contents. */
export function findSessionFiles(dialect, { sessionRoot, matchFile = () => true } = {}) {
  const root = sessionRootOf(dialect, sessionRoot);
  const files = [];
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory() && !entry.isSymbolicLink()) visit(path);
      else if (entry.isFile() && !entry.isSymbolicLink() && path.endsWith(".jsonl") && matchFile(path)) files.push(path);
    }
  };
  visit(root);
  return files.sort();
}

/**
 * Parse only explicitly selected native transcript files. Callers receive
 * rows transiently and may ask for an opaque file identity, never file bytes.
 */
export function scanSessionFiles(dialect, { sessionRoot, files, label, identifyFile = null, visit }) {
  const root = sessionRootOf(dialect, sessionRoot);
  if (!Array.isArray(files) || typeof visit !== "function") throw new TypeError(`${label} needs selected files and a row visitor`);
  const selected = [...new Set(files.map((path) => resolve(path)))].sort();
  if (selected.some((path) => !isFileWithin(root, path))) throw new Error(`${label} selected a file outside the contracted session store`);
  const receipts = new Map(); let malformedRows = 0;
  for (const path of selected) {
    const bytes = readFileSync(path);
    if (typeof identifyFile === "function") receipts.set(path, identifyFile(bytes, path));
    for (const line of bytes.toString("utf8").split("\n")) {
      if (line === "") continue;
      const row = safeRow(line);
      if (row === null) { malformedRows += 1; continue; }
      visit(row, path);
    }
  }
  return { files: selected, receipts, malformedRows };
}

/** Validate `{ fromExclusive, toInclusive }` as one increasing exact interval. */
export function exactWindow(window, label) {
  const from = Date.parse(window?.fromExclusive);
  const to = Date.parse(window?.toInclusive);
  if (!Number.isFinite(from) || !Number.isFinite(to) || from >= to) throw new TypeError(`${label} needs an increasing exact interval`);
  return { from, to };
}

/**
 * Read the privacy-safe rows in one exact observation window.  The callback
 * receives parsed native rows only transiently; callers must project them
 * through their dialect and must not retain transcript text or tool payloads.
 *
 * @param {{defaultSessionRoot?: Function, enumerateSessionFiles: Function, rowTimestamp: Function}} dialect
 * @param {{window: {fromExclusive: string, toInclusive: string}, sessionRoot?: string, label: string, visit: Function}} options
 * @returns {{files: string[], activeFiles: Set<string>, malformedRows: number}}
 */
export function scanSessionRows(dialect, { window, sessionRoot, label, visit }) {
  const { from, to } = exactWindow(window, label);
  const root = sessionRootOf(dialect, sessionRoot);
  const files = dialect.enumerateSessionFiles(root, new Date(from), new Date(to));
  const activeFiles = new Set(); let malformedRows = 0;
  const scanned = scanSessionFiles(dialect, { sessionRoot: root, files, label, visit(row, path) {
    const at = Date.parse(dialect.rowTimestamp(row));
    if (!Number.isFinite(at)) { malformedRows += 1; return; }
    visit(row, path, at);
    if (at > from && at <= to) activeFiles.add(path);
  } });
  return { files: scanned.files, activeFiles, malformedRows: scanned.malformedRows + malformedRows };
}

/**
 * Read only rows in the exact window through scanSessionRows.
 *
 * @param {object} dialect
 * @param {object} options
 * @returns {{files: string[], activeFiles: Set<string>, malformedRows: number}}
 */
export function observeSessionWindow(dialect, { window, sessionRoot, label, visit }) {
  const { from, to } = exactWindow(window, label);
  return scanSessionRows(dialect, { window, sessionRoot, label, visit(row, path, at) {
    if (at > from && at <= to) visit(row, path, at);
  } });
}

/**
 * Convert cumulative provider counters to mutually exclusive token classes.
 * A lower later counter is a provider reset, so its post-reset value starts a
 * new segment rather than creating a negative delta.  Output includes any
 * reasoning count in Codex's native total; `output` here excludes it.
 *
 * @param {{input?: number, cached?: number, output?: number, reasoning?: number}} before
 * @param {{input?: number, cached?: number, output?: number, reasoning?: number}} after
 * @returns {{uncachedInput: number, cachedInput: number, output: number, reasoning: number, total: number}}
 */
export function cumulativeTokenDelta(before = {}, after = {}) {
  const delta = cumulativeCounterDelta(before, after, ["input", "cached", "output", "reasoning"]);
  const input = delta.input, cached = delta.cached, rawOutput = delta.output, reasoning = Math.min(rawOutput, delta.reasoning);
  const uncachedInput = Math.max(0, input - cached), output = Math.max(0, rawOutput - reasoning);
  return { uncachedInput, cachedInput: cached, output, reasoning, total: uncachedInput + cached + output + reasoning };
}

/** Convert arbitrary cumulative nonnegative provider counters into a segment delta. */
export function cumulativeCounterDelta(before = {}, after = {}, fields = []) {
  return Object.fromEntries(fields.map((key) => {
    const earlier = Number(before[key]) || 0, later = Number(after[key]) || 0;
    return [key, later >= earlier ? later - earlier : later];
  }));
}

/**
 * Derive the singular toolNameOf/toolTransportOf/callIdOf accessors the
 * seam names from a dialect's toolCallsOf(row) — the array-valued method
 * every dialect actually implements, since a Codex transcript row carries
 * at most one tool call but a Claude assistant row's content can carry
 * several. The singular accessors read the first entry and exist only for
 * a caller that has already established a row carries exactly one call.
 */
export function firstToolCallAccessors(toolCallsOf) {
  return {
    toolNameOf: (row) => toolCallsOf(row)[0]?.name ?? null,
    toolTransportOf: (row) => toolCallsOf(row)[0]?.transport ?? null,
    callIdOf: (row) => toolCallsOf(row)[0]?.callId ?? null,
  };
}
