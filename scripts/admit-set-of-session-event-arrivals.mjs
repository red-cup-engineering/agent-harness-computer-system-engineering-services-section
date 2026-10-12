#!/usr/bin/env node
// Reads this harness's own lifecycle journal (JSONL {a,e,t,v} rows in the
// witness-journal-seavt feed of a data root's log tier) and emits ONLY rows
// not previously seen as a JSON array of CloudEvents on stdout, mirroring
// newscable-source-broker's admit-set-of-feed-arrivals.mjs shape (a
// byte-offset-per-file cursor here instead of a per-feed id list). Never
// calls metroplat; composition happens later via a shell pipe into
// admit-set-of-arrivals.
import { createHash } from "node:crypto";
import { relative, resolve as resolvePath, sep } from "node:path";
import { readFileBytes, readFileText } from "@red-cup-engineering/computer-file-engineering-services-section/read-file";
import { writeFileText } from "@red-cup-engineering/computer-file-engineering-services-section/write-file";
import { termToJson } from "@red-cup-engineering/computer-data-engineering-services-section/semiotic-expression-notation/json-codec";
import { dataArtifactFiles } from "@red-cup-engineering/eavt-services-section/data-artifact-listing";

// relateFilepath/resolveFilepath-service were folded away (I/O family
// collapse, c9bde928adb) into plain node:path builtins; this package's own
// use of both was always a single-purpose wrapper (POSIX-relative, and
// resolve-against-cwd for a one-element argv path), so it takes the builtin
// directly rather than restoring a one-file package.
const relateFilepath = ({ from, to }) => relative(from, to).split(sep).join("/");
const resolveFilepath = (parts) => resolvePath(...parts);

const JOURNAL_SUBJECT = "witness-journal-seavt";
// A row whose `v` carries a key matching this pattern anywhere in its
// (possibly nested) shape is refused outright rather than admitted with the
// key stripped: a row that needs this filter to trigger should never have
// reached this lane.
const SECRET_KEY_PATTERN = /token|secret|password|key/iu;

function usage() {
  return "Usage: admit-set-of-session-event-arrivals --logs-root <path> --cursor <path> [--repo-root <path>]\n" +
    "Lists the witness-journal-seavt feed files in the log tier of --logs-root\n" +
    "(the machine's own data root) and emits one CloudEvent\n" +
    "per lifecycle row (a=\"lifecycle.<Event>\") not already covered by the\n" +
    "recorded byte offset for that file. A row whose v contains a key that\n" +
    "looks like a secret is refused (skipped, offset still advances).\n";
}

/**
 * Lists every witness-journal-seavt feed file in the log tier of the data root `root`, in date order.
 * @param {string} root - data root whose log tier holds the feed.
 * @returns {string[]} paths to every matching file found.
 */
export function findJournalFiles(root) {
  return dataArtifactFiles(root, "log", { subject: JOURNAL_SUBJECT, match: (filename) => filename.endsWith(".jsonl") }).map((file) => file.path);
}

function offsetText(bytes, offset) {
  return offset >= bytes.length ? "" : bytes.subarray(offset).toString("utf8");
}

/**
 * Reads the bytes of `filePath` from `offset` to end-of-file.
 * @param {string} filePath - absolute path to the journal file.
 * @param {number} offset - byte offset to start reading from.
 * @returns {Promise<string>} the new bytes as UTF-8 text ("" when offset is at or past EOF).
 */
export async function readNewBytes(filePath, offset) {
  return offsetText(await readFileBytes(filePath), offset);
}

/**
 * Reports whether `value` contains, at any depth, an object key matching `SECRET_KEY_PATTERN`.
 * @param {unknown} value - a parsed JSON value (row.v).
 * @returns {boolean} true when a secret-looking key is found anywhere in `value`.
 */
export function containsSecretLookingKey(value) {
  if (value === null || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some((item) => containsSecretLookingKey(item));
  for (const [key, nested] of Object.entries(value)) {
    if (SECRET_KEY_PATTERN.test(key)) return true;
    if (containsSecretLookingKey(nested)) return true;
  }
  return false;
}

/**
 * Computes the CloudEvent id for one lifecycle journal row.
 * @param {string} relativePath - the journal file's repository-relative path.
 * @param {object} row - the parsed `{a, e, t, v}` row.
 * @returns {string} a `sha256:<hex>` id, stable for the same file+row content.
 */
export function cloudEventId(relativePath, row) {
  const key = row.e ?? JSON.stringify(row);
  return `sha256:${createHash("sha256").update(`${relativePath}\n${key}`, "utf8").digest("hex")}`;
}

/**
 * Maps one lifecycle journal row to a CloudEvent envelope.
 * @param {string} relativePath - the journal file's repository-relative path, used as `source`.
 * @param {{a: string, e?: string, t?: string, v: object}} row - one parsed journal row.
 * @returns {object} a CloudEvents 1.0 envelope carrying `row.v` as `data`.
 */
export function rowToCloudEvent(relativePath, row) {
  const time = typeof row.t === "string" && Number.isFinite(Date.parse(row.t)) ? new Date(row.t).toISOString() : new Date(0).toISOString();
  return {
    specversion: "1.0",
    id: cloudEventId(relativePath, row),
    source: relativePath,
    type: "org.561-group.session-event.v1",
    time,
    datacontenttype: "application/json",
    data: row.v,
  };
}

/**
 * Loads the byte-offset dedup cursor from disk, tolerating a missing or empty file.
 * @param {string} cursorPath - path to the cursor JSON file.
 * @returns {Promise<{version: number, files: Record<string, number>}>} the cursor document.
 */
export async function loadCursor(cursorPath) {
  try {
    const parsed = JSON.parse(await readFileText(cursorPath));
    return { version: 1, files: (parsed && typeof parsed === "object" && parsed.files && typeof parsed.files === "object") ? parsed.files : {} };
  } catch { return { version: 1, files: {} }; }
}

/**
 * Writes the byte-offset dedup cursor to disk, creating parent directories as needed.
 * @param {string} cursorPath - path to the cursor JSON file.
 * @param {{version: number, files: Record<string, number>}} cursor - the cursor document to persist.
 * @returns {Promise<void>}
 */
export async function saveCursor(cursorPath, cursor) {
  await writeFileText(cursorPath, `${JSON.stringify(cursor, null, 2)}\n`);
}

/**
 * Scans every journal file under `logsRoot` and emits CloudEvents for lifecycle rows past `cursor`.
 * @param {object} options
 * @param {string} options.logsRoot - data root whose log tier holds the `witness-journal-seavt` feed.
 * @param {string} options.repoRoot - base for computing each file's repository-relative `source`.
 * @param {{version: number, files: Record<string, number>}} options.cursor - the prior dedup cursor.
 * @returns {Promise<{events: object[], cursor: {version: number, files: Record<string, number>}}>}
 *   the new CloudEvents and the updated cursor to persist.
 */
export async function admitSetOfSessionEventArrivals({ logsRoot, repoRoot, cursor }) {
  const nextCursor = { version: 1, files: { ...cursor.files } };
  const events = [];
  for (const filePath of findJournalFiles(logsRoot)) {
    const relativePath = relateFilepath({ from: repoRoot, to: filePath });
    const priorOffset = cursor.files[relativePath] ?? 0;
    const bytes = await readFileBytes(filePath);
    const newText = offsetText(bytes, priorOffset);
    let consumedBytes = 0;
    for (const line of newText.split("\n")) {
      const lineBytes = Buffer.byteLength(line, "utf8") + 1; // accounts for the split "\n"
      if (line.trim() === "") { consumedBytes += lineBytes; continue; }
      let row;
      try { row = JSON.parse(line); }
      catch { consumedBytes += lineBytes; continue; }
      consumedBytes += lineBytes;
      if (!row || typeof row !== "object" || !Object.hasOwn(row, "e") || !Object.hasOwn(row, "a") || !Object.hasOwn(row, "v")) continue;
      let decoded;
      try { decoded = { ...row, e: termToJson(row.e), a: termToJson(row.a), v: termToJson(row.v) }; } catch { continue; }
      if (typeof decoded.a !== "string" || !decoded.a.startsWith("lifecycle.")) continue;
      if (containsSecretLookingKey(decoded.v)) continue;
      events.push(rowToCloudEvent(relativePath, decoded));
    }
    // Clamp to actual size: a still-being-written file's tail line may lack
    // a trailing "\n", and consumedBytes must never overrun the observed size.
    nextCursor.files[relativePath] = Math.min(priorOffset + consumedBytes, bytes.length);
  }
  return { events, cursor: nextCursor };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const argv = process.argv.slice(2);
  if (argv.includes("--help")) { process.stdout.write(usage()); process.exit(0); }
  const value = (flag) => { const index = argv.indexOf(flag); return index < 0 ? undefined : argv[index + 1]; };
  const logsRootArg = value("--logs-root");
  const cursorArg = value("--cursor");
  if (logsRootArg === undefined || cursorArg === undefined) { process.stderr.write(usage()); process.exit(1); }
  const logsRoot = resolveFilepath([logsRootArg]);
  const cursorPath = resolveFilepath([cursorArg]);
  const repoRoot = resolveFilepath([value("--repo-root") ?? logsRoot]);

  const cursor = await loadCursor(cursorPath);
  const { events, cursor: nextCursor } = await admitSetOfSessionEventArrivals({ logsRoot, repoRoot, cursor });
  await saveCursor(cursorPath, nextCursor);
  process.stdout.write(`${JSON.stringify(events, null, 2)}\n`);
}
