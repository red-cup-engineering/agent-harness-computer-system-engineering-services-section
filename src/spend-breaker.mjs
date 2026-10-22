// A circuit breaker on one turn's inference spend: what a Claude Code session has spent since the
// Leader's last message, read from the session's own transcript. Past the budget the session's
// tools are refused until the Leader speaks again, so a turn ends in a report instead of a loop.
//
// Spend is counted in input-equivalent tokens: Anthropic prices cache reads at 0.1, five-minute
// cache writes at 1.25, one-hour cache writes at 2 and output at 5 times a model's input rate, so
// the count is proportional to cost on every model without a price table.
//
// The budget: over this machine's 2,574 turns of 2026-09-22 to 2026-10-22 the median turn spent
// 0.2M and the 90th percentile 3.3M; 217 turns passed 4M, and 36% of all spend fell beyond those
// turns' first 4M.
import { closeSync, fstatSync, openSync, readSync } from "node:fs";

export const WEIGHTS = Object.freeze({ input: 1, cacheWrite: 1.25, cacheWriteHour: 2, cacheRead: 0.1, output: 5 });
export const TURN_BUDGET = 4_000_000;
const CHUNK = 1 << 20;
const MAX_TAIL = 64 * CHUNK;

/** Whether one transcript row is a message the Leader wrote (not a tool result, reminder or summary). */
export function isLeaderMessage(row) {
  if (row?.type !== "user" || row.isMeta || row.isCompactSummary || row.message?.role !== "user") return false;
  const content = row.message.content;
  if (typeof content === "string") return !content.startsWith("<command-") && !content.startsWith("<local-command-");
  return Array.isArray(content) && content.some((part) => part?.type === "text") && !content.some((part) => part?.type === "tool_result");
}

/** Input-equivalent tokens of one API usage record. */
export function weighted(usage = {}) {
  const hour = usage.cache_creation?.ephemeral_1h_input_tokens ?? 0;
  return (usage.input_tokens ?? 0) * WEIGHTS.input
    + ((usage.cache_creation_input_tokens ?? 0) - hour) * WEIGHTS.cacheWrite + hour * WEIGHTS.cacheWriteHour
    + (usage.cache_read_input_tokens ?? 0) * WEIGHTS.cacheRead
    + (usage.output_tokens ?? 0) * WEIGHTS.output;
}

/**
 * The spend of the rows after the last Leader message: `{ spent, calls, bounded }`. A response
 * streamed over several rows shares one message id and is counted once, at its last usage.
 * `bounded` is false when no Leader message was found, so the count covers only what was read.
 */
export function turnSpend(rows) {
  let start = 0;
  for (let i = rows.length - 1; i >= 0; i -= 1) if (isLeaderMessage(rows[i])) { start = i + 1; break; }
  const usages = new Map();
  for (const row of rows.slice(start)) {
    const message = row?.type === "assistant" ? row.message : undefined;
    if (message?.usage) usages.set(message.id ?? `${usages.size}`, message.usage);
  }
  let spent = 0;
  for (const usage of usages.values()) spent += weighted(usage);
  return { spent: Math.round(spent), calls: usages.size, bounded: start > 0 };
}

const parse = (line) => { try { return JSON.parse(line); } catch { return undefined; } };

/** The transcript rows from its end back to the last Leader message, reading at most `limit` bytes. */
export function tailRows(file, { limit = MAX_TAIL } = {}) {
  const fd = openSync(file, "r");
  try {
    const size = fstatSync(fd).size;
    let end = size, text = "";
    while (end > 0 && size - end < limit) {
      const length = Math.min(CHUNK, end);
      const buffer = Buffer.alloc(length);
      readSync(fd, buffer, 0, length, end - length);
      end -= length;
      text = buffer.toString("utf8") + text;
      const lines = text.split("\n");
      const whole = end === 0 ? lines : lines.slice(1);
      if (whole.some((line) => line.includes('"type":"user"') && isLeaderMessage(parse(line)))) return whole.map(parse).filter(Boolean);
    }
    return text.split("\n").slice(end === 0 ? 0 : 1).map(parse).filter(Boolean);
  } finally {
    closeSync(fd);
  }
}

const budgetOf = (env) => {
  const value = Number(env.AGENT_TURN_BUDGET);
  return Number.isFinite(value) && value > 0 ? value : TURN_BUDGET;
};

/** The breaker's verdict on one PreToolUse event: a deny reason once the turn is over budget, else undefined. */
export function spendVerdict(input, { env = process.env } = {}) {
  if (env.AGENT_TURN_BUDGET === "off" || typeof input?.transcript_path !== "string") return undefined;
  let spend;
  try { spend = turnSpend(tailRows(input.transcript_path)); } catch { return undefined; }
  const budget = budgetOf(env);
  if (spend.spent < budget) return undefined;
  const millions = (n) => `${(n / 1e6).toFixed(1)}M`;
  return `spend breaker: this turn has spent ${millions(spend.spent)} input-equivalent tokens over ${spend.calls} model calls since the Leader's last message (budget ${millions(budget)}). Stop: report to the Leader what is done, what is not, and what you would do next.`;
}
