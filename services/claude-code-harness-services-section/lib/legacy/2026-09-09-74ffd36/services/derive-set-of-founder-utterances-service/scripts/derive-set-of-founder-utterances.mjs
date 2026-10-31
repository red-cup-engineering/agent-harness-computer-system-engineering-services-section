#!/usr/bin/env node
const SYSTEM_REMINDER_PATTERN = /<system-reminder>[\s\S]*?<\/system-reminder>/gu;
const IDE_SELECTION_PATTERN = /<ide_selection>[\s\S]*?<\/ide_selection>/gu;

const NOISE_PATTERNS = [
  /^\s*<(task-notification|local-command)/u,
  /\[SYSTEM NOTIFICATION/u,
  /<command-name>/u,
  /^Base directory for this skill/u,
  /^\[Request interrupted/u,
  /^This session is being continued/u,
  /^Caveat: The messages below/u,
];

/**
 * The plain text of one user message's content, or null when the content
 * carries a tool_result block (dropped in its entirety rather than partially kept).
 * @param {unknown} content
 * @returns {string|null}
 */
function messageText(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  if (content.some((block) => block?.type === "tool_result")) return null;
  return content.filter((block) => block?.type === "text").map((block) => block.text).join("\n");
}

/**
 * Whether a stripped, trimmed message text is a house noise block that
 * carries no founder utterance.
 * @param {string} text
 * @returns {boolean}
 */
function isNoise(text) {
  return NOISE_PATTERNS.some((pattern) => pattern.test(text));
}

/**
 * Derives a FounderUtteranceSet from one or more Claude session transcripts already split into lines: every user-authored prompt — never a tool result, a stripped system-reminder/ide_selection span, or a house noise block — deduplicated on the first 200 characters of its text across the whole request, restricted to a closed [since, until] timestamp window, and sorted ascending by timestamp.
 * @param {{transcripts: Array<{session: string, lines: string[]}>, since: string, until: string}} request
 * @returns {{type: "FounderUtteranceSet", version: 1, since: string, until: string, prompts: number, sessions: Record<string, number>, rows: Array<{session: string, ts: string, text: string}>}}
 * @throws {TypeError} When transcripts is not an array, or since/until are not strings.
 */
export function deriveSetOfFounderUtterances(request) {
  if (!request || !Array.isArray(request.transcripts)) throw new TypeError("transcripts must be an array");
  if (typeof request.since !== "string" || typeof request.until !== "string") throw new TypeError("since and until must be ISO timestamp strings");
  const sinceMs = Date.parse(request.since);
  const untilMs = Date.parse(request.until);
  const rows = [];
  const seen = new Set();
  for (const transcript of request.transcripts) {
    const session = transcript?.session;
    const lines = Array.isArray(transcript?.lines) ? transcript.lines : [];
    for (const line of lines) {
      if (!line) continue;
      let record;
      try {
        record = JSON.parse(line);
      } catch {
        continue;
      }
      if (!record || record.type !== "user") continue;
      const ts = record.timestamp;
      const tsMs = typeof ts === "string" ? Date.parse(ts) : NaN;
      if (!(tsMs >= sinceMs && tsMs <= untilMs)) continue;
      const extracted = messageText(record.message?.content);
      if (extracted === null) continue;
      const text = extracted.replace(SYSTEM_REMINDER_PATTERN, "").replace(IDE_SELECTION_PATTERN, "").trim();
      if (text === "" || isNoise(text)) continue;
      const key = text.slice(0, 200);
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push({ session, ts, text });
    }
  }
  rows.sort((a, b) => a.ts.localeCompare(b.ts));
  const sessions = {};
  for (const row of rows) sessions[row.session] = (sessions[row.session] ?? 0) + 1;
  return {
    type: "FounderUtteranceSet",
    version: 1,
    since: request.since,
    until: request.until,
    prompts: rows.length,
    sessions,
    rows,
  };
}

if (import.meta.main) {
  if (process.argv.includes("--help")) {
    process.stdout.write(
      "deriveSetOfFounderUtterances — Derives a FounderUtteranceSet from one or more Claude session transcripts already split into lines: every user-authored prompt — never a tool result, a stripped system-reminder/ide_selection span, or a house noise block — deduplicated on the first 200 characters of its text across the whole request, restricted to a closed [since, until] timestamp window, and sorted ascending by timestamp.\n",
    );
  } else {
    let text = "";
    for await (const chunk of process.stdin) text += chunk;
    for (const line of text.split("\n")) {
      if (line.length > 0) process.stdout.write(`${JSON.stringify(deriveSetOfFounderUtterances(JSON.parse(line)))}\n`);
    }
  }
}
