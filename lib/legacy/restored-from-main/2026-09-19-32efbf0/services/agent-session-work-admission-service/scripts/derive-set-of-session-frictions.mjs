#!/usr/bin/env node
// One transformation: an agent session transcript in, the session's frictions
// readout out (tool errors and non-zero command exits, grouped and counted).
// Reads --transcript, or the transcript_path of a Stop hook input on stdin.
// The byte cursor, so a per-turn run reads only what the previous run has
// not, is a caller-supplied path (--cursor): the state it keeps belongs to
// the machine running the session, never to this service.
//
// Every filesystem reach goes through the house's effect owners, so the
// transcript is read whole and sliced at the cursor rather than read from a
// byte offset: the file-read owner offers no partial read, and a session
// transcript is small enough that correctness is worth the extra bytes.
import { createHash } from "node:crypto";
import { readFileBytes, readFileText } from "@red-cup-engineering/file-services/read-file";
import { writeFileText } from "@red-cup-engineering/file-services/write-file";
import { toPosixPath } from "@red-cup-engineering/filepath-services-section";
import { resolveFilepath } from "@red-cup-engineering/resolve-filepath-service";
import { isMain } from "@red-cup-engineering/javascript-file-main-guard-service";
import { makeDirectory } from "@red-cup-engineering/make-directory-service";
import { readJavascriptNodeStandardInputText } from "@red-cup-engineering/read-javascript-node-standard-input-text-service";
import { argument } from "@red-cup-engineering/javascript-node-services-section/argv";
import { deriveSessionFrictions, parseTranscriptLines } from "../src/session-frictions.mjs";

/** The parent directory of one absolute posix path. */
function parentOf(path) {
  const segments = toPosixPath(path).split("/");
  segments.pop();
  const parent = segments.join("/");
  return parent === "" ? "/" : parent;
}

/**
 * Reads one transcript from `offset` to its end.
 *
 * @param {string} path - the transcript carrier.
 * @param {number} offset - the byte offset the previous run stopped at.
 * @returns {Promise<{text: string, end: number}>} the new text and the carrier's current size.
 */
export async function readTranscriptFrom(path, offset) {
  const bytes = await readFileBytes(path);
  if (offset >= bytes.length) return { text: "", end: bytes.length };
  return { text: bytes.subarray(offset).toString("utf8"), end: bytes.length };
}

/**
 * Derives the frictions of one transcript, honoring and advancing a byte
 * cursor when one is given.
 *
 * @param {{transcript: string, cursorPath?: string|null, sessionId?: string}} options
 * @returns {Promise<object>} the readout, plus `transcriptDigest` and `bytes` read.
 */
export async function deriveTranscriptFrictions({ transcript, cursorPath = null, sessionId }) {
  const path = resolveFilepath([transcript]);
  const key = `sha256:${createHash("sha256").update(path).digest("hex")}`;
  let cursor = {};
  if (cursorPath) {
    try {
      cursor = JSON.parse(await readFileText(cursorPath));
    } catch {
      // No cursor yet, or one this run cannot read: start from the beginning.
      cursor = {};
    }
  }
  const offset = cursorPath ? Number(cursor[key] ?? 0) : 0;
  const { text, end } = await readTranscriptFrom(path, offset);
  const readout = deriveSessionFrictions(parseTranscriptLines(text), { sessionId });
  if (cursorPath) {
    await makeDirectory({ path: parentOf(cursorPath) });
    await writeFileText(cursorPath, `${JSON.stringify({ ...cursor, [key]: end }, null, 2)}\n`);
  }
  return { ...readout, transcriptDigest: key, bytes: end - offset };
}

function usage() {
  return "Usage: derive-set-of-session-frictions [--transcript <jsonl>] (--cursor <path> | --no-cursor) [--session <id>]\n" +
    "Prints the {kind:\"agent-session.session-frictions\"} readout for one agent session\n" +
    "transcript: every tool error and non-zero command exit, grouped by tool and failure\n" +
    "line. Without --transcript, reads a Stop hook input on stdin and uses its transcript_path.\n" +
    "--no-cursor reads the whole transcript; otherwise --cursor names the machine's own\n" +
    "byte-offset cursor file, keyed by transcript path digest.\n";
}

if (isMain(import.meta.url)) {
  if (process.argv.includes("--help")) {
    process.stdout.write(usage());
    process.exit(0);
  }
  try {
    let transcript = argument("--transcript");
    let sessionId = argument("--session");
    if (transcript === undefined) {
      const read = await readJavascriptNodeStandardInputText({ type: "JavascriptNodeStandardInputTextReadRequest", version: 1 }, { standardInput: process.stdin });
      const input = JSON.parse(read.text);
      transcript = input.transcript_path;
      sessionId ??= input.session_id;
    }
    if (typeof transcript !== "string" || transcript === "") throw new Error("no transcript given (--transcript or hook transcript_path)");
    const cursorArgument = argument("--cursor");
    if (!process.argv.includes("--no-cursor") && cursorArgument === undefined) throw new Error("either --cursor <path> or --no-cursor is required");
    const cursorPath = process.argv.includes("--no-cursor") ? null : resolveFilepath([cursorArgument]);
    process.stdout.write(`${JSON.stringify(await deriveTranscriptFrictions({ transcript, cursorPath, sessionId }))}\n`);
  } catch (error) {
    process.stderr.write(`derive-set-of-session-frictions: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
