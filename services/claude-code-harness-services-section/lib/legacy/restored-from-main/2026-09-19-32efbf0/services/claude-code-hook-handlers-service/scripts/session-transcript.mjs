// A session's own transcript, read as evidence about what the session was
// asked and what it already did. This is deliberately NOT the
// session-transcript-dialects seam: that seam is privacy-bounded and refuses
// to return transcript text at all, because its collectors publish civic
// pulses. A guard's question is the opposite kind -- "did the user, in their
// own words, ask for this?" -- and can only be answered by reading the user's
// turns, inside this one process, to allow or refuse one tool call. Nothing
// read here is journaled, published, or returned to a caller.
import { readFileText } from "@red-cup-engineering/file-services/read-file";

/**
 * The rows of one transcript, skipping blank and malformed lines. An
 * unreadable transcript reads as no rows rather than an error: a guard whose
 * evidence is missing decides on that absence, it does not crash the turn.
 *
 * @param {string} transcriptPath - the runtime's own transcript file.
 * @param {typeof readFileText} [readText]
 * @returns {Promise<object[]>}
 */
export async function transcriptRows(transcriptPath, readText = readFileText) {
  let text;
  try {
    text = await readText(transcriptPath);
  } catch {
    return [];
  }
  const rows = [];
  for (const line of text.split(/\r?\n/u)) {
    if (line.trim() === "") continue;
    try {
      rows.push(JSON.parse(line));
    } catch {
      continue;
    }
  }
  return rows;
}

/**
 * One user turn's plain text, across the string and content-block-array
 * message shapes the runtime writes.
 *
 * @param {object} row - one transcript row.
 * @returns {string} the turn's text, or "" when the row is not a user turn.
 */
export function userTurnText(row) {
  if (!row || typeof row !== "object" || row.message?.role !== "user") return "";
  const content = row.message.content;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.filter((block) => block && block.type === "text" && typeof block.text === "string").map((block) => block.text).join("\n");
}

/**
 * Whether any user turn in the transcript matches one of the patterns.
 *
 * @param {string} transcriptPath - the runtime's own transcript file.
 * @param {readonly RegExp[]} patterns
 * @param {typeof readFileText} [readText]
 * @returns {Promise<boolean>}
 */
export async function transcriptHasUserPattern(transcriptPath, patterns, readText = readFileText) {
  for (const row of await transcriptRows(transcriptPath, readText)) {
    const text = userTurnText(row);
    if (text !== "" && patterns.some((pattern) => pattern.test(text))) return true;
  }
  return false;
}

/**
 * Whether any assistant turn in the transcript already made a tool call the
 * predicate accepts, given the tool's name and input.
 *
 * @param {string} transcriptPath - the runtime's own transcript file.
 * @param {(name: string, input: unknown) => boolean} predicate
 * @param {typeof readFileText} [readText]
 * @returns {Promise<boolean>}
 */
export async function transcriptHasToolUse(transcriptPath, predicate, readText = readFileText) {
  for (const row of await transcriptRows(transcriptPath, readText)) {
    if (row?.message?.role !== "assistant" || !Array.isArray(row.message.content)) continue;
    for (const block of row.message.content) {
      if (block?.type === "tool_use" && predicate(block.name, block.input)) return true;
    }
  }
  return false;
}
