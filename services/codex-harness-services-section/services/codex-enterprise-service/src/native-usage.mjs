import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { semanticByteIdentity, semanticIdentity } from "./semiotic-circuit.mjs";

export const DEFAULT_SESSIONS_ROOT = "/home/emsenn/.codex/sessions";
const usageFields = ["input_tokens", "cached_input_tokens", "cache_write_input_tokens", "output_tokens", "reasoning_output_tokens", "total_tokens"];
const digest = (value) => Buffer.isBuffer(value)
  ? semanticByteIdentity(value, "bare-cedar-fog-codex.native-rollout-carrier").id
  : semanticIdentity(value, "bare-cedar-fog-codex.native-usage-material").id;
const integer = (value) => Number.isSafeInteger(value) && value >= 0 ? value : 0;
const gcd = (a, b) => b === 0n ? (a < 0n ? -a : a) : gcd(b, a % b);
function fraction(numerator, denominator = 1n) {
  if (denominator <= 0n) throw new TypeError("fraction denominator must be positive");
  const divisor = gcd(numerator, denominator);
  return { numerator: String(numerator / divisor), denominator: String(denominator / divisor) };
}
function decimalFraction(value) {
  const source = String(value); if (!/^[0-9]+(?:\.[0-9]+)?$/u.test(source)) throw new TypeError("decimal gauge must be nonnegative");
  const [whole, decimal = ""] = source.split("."); return fraction(BigInt(`${whole}${decimal}`), 10n ** BigInt(decimal.length));
}
function filesBelow(path) {
  if (!existsSync(path)) return [];
  return readdirSync(path, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? filesBelow(join(path, entry.name)) : entry.name.endsWith(".jsonl") ? [join(path, entry.name)] : []);
}
function readRollout(path) {
  const bytes = readFileSync(path), rows = bytes.toString("utf8").split("\n").filter(Boolean).flatMap((line) => { try { return [JSON.parse(line)]; } catch { return []; } });
  const meta = rows.find((row) => row.type === "session_meta")?.payload;
  return { path, receipt: digest(bytes), sessionId: meta?.id ?? null, source: meta?.source ?? null, rows };
}
function subtractUsage(current, prior = {}) { return Object.fromEntries(usageFields.map((field) => [field, Math.max(0, integer(current?.[field]) - integer(prior?.[field]))])); }
function addUsage(target, delta) { for (const field of usageFields) target[field] += integer(delta[field]); return target; }
function exclusiveTokenMix(usage) { return { uncachedInputTokens: Math.max(0, usage.input_tokens - usage.cached_input_tokens), cachedInputTokens: usage.cached_input_tokens, ordinaryOutputTokens: Math.max(0, usage.output_tokens - usage.reasoning_output_tokens), reasoningOutputTokens: usage.reasoning_output_tokens }; }
function turnGauges(rollout) {
  const turns = []; let latestUsage = {}; let active = null;
  for (const row of rollout.rows) {
    if (row.payload?.type === "token_count") {
      latestUsage = row.payload.info?.total_token_usage ?? latestUsage;
      if (active) { active.latestUsage = latestUsage; active.latestUsageAt = row.timestamp; active.rateLimits = row.payload.rate_limits ?? null; active.modelContextWindow = row.payload.info?.model_context_window ?? null; }
    } else if (row.payload?.type === "task_started") {
      if (active) turns.push(active);
      active = { sessionId: rollout.sessionId, turnId: row.payload.turn_id, startedAt: row.timestamp, completedAt: null, baselineUsage: latestUsage, latestUsage, latestUsageAt: null, rateLimits: null, modelContextWindow: null, model: null, reasoningEffort: null, workProducts: [] };
    } else if (row.type === "turn_context" && active && row.payload?.turn_id === active.turnId) {
      active.model = row.payload.model ?? null; active.reasoningEffort = row.payload.effort ?? null;
    } else if (row.payload?.type === "patch_apply_end" && active && row.payload.turn_id === active.turnId && row.payload.success === true) {
      const changes = row.payload.changes ?? {}, files = Object.keys(changes).sort();
      active.workProducts.push({ type: "RepositoryPatchWorkProductObserved", observedAt: row.timestamp, files, patchDigest: digest(JSON.stringify(changes)), providerReceipt: digest(JSON.stringify({ callId: row.payload.call_id ?? null, status: row.payload.status ?? null, success: row.payload.success })) });
    } else if (row.payload?.type === "task_complete" && active && row.payload.turn_id === active.turnId) {
      active.completedAt = row.timestamp; turns.push(active); active = null;
    }
  }
  if (active) turns.push(active);
  return turns.map((turn) => {
    const end = turn.completedAt ?? turn.latestUsageAt;
    const usage = subtractUsage(turn.latestUsage, turn.baselineUsage);
    return { sessionFace: digest(turn.sessionId ?? "unknown"), turn: turn.turnId, state: turn.completedAt ? "completed" : "ongoing", startedAt: turn.startedAt, observedThrough: end,
      wallTime: end ? { amount: fraction(BigInt(Math.max(0, Date.parse(end) - Date.parse(turn.startedAt)))), unit: "milliseconds", source: "Codex native task_started/task_complete or latest token_count timestamps" } : null,
      usage, exclusiveTokenMix: exclusiveTokenMix(usage), model: turn.model, reasoningEffort: turn.reasoningEffort, modelContextWindow: turn.modelContextWindow, rateLimits: turn.rateLimits, workProducts: turn.workProducts,
      nativeReceipt: { source: rollout.path, digest: rollout.receipt, transcriptRetainedByEnterprise: false } };
  });
}
function weeklyGauge(rollouts, monthlySubscription) {
  const tokenEvents = rollouts.flatMap((rollout) => rollout.rows.filter((row) => row.payload?.type === "token_count").map((row) => ({ row, sessionId: rollout.sessionId }))).sort((a, b) => Date.parse(a.row.timestamp) - Date.parse(b.row.timestamp));
  const latest = tokenEvents.at(-1); if (!latest?.row.payload.rate_limits?.primary) return null;
  const primary = latest.row.payload.rate_limits.primary, resetSeconds = integer(primary.resets_at), windowMinutes = integer(primary.window_minutes);
  if (!resetSeconds || !windowMinutes) return null;
  const windowStart = (resetSeconds - windowMinutes * 60) * 1000, bySession = new Map(), usage = Object.fromEntries(usageFields.map((field) => [field, 0]));
  for (const event of tokenEvents) {
    const current = event.row.payload.info?.total_token_usage ?? {}, prior = bySession.get(event.sessionId) ?? {};
    if (Date.parse(event.row.timestamp) >= windowStart) addUsage(usage, subtractUsage(current, prior));
    bySession.set(event.sessionId, current);
  }
  const used = decimalFraction(primary.used_percent), monthly = fraction(BigInt(monthlySubscription.numerator), BigInt(monthlySubscription.denominator));
  const weekly = fraction(BigInt(monthly.numerator) * 12n, BigInt(monthly.denominator) * 52n);
  const consumed = fraction(BigInt(weekly.numerator) * BigInt(used.numerator), BigInt(weekly.denominator) * BigInt(used.denominator) * 100n);
  return { window: { startedAt: new Date(windowStart).toISOString(), resetsAt: new Date(resetSeconds * 1000).toISOString(), minutes: windowMinutes }, usedPercent: used, usage,
    subscriptionAllocation: { amount: weekly, unit: "USD-per-week", source: "Leader-stated USD 200/month annualized as monthly × 12 / 52" },
    consumedSubscriptionAllocation: { amount: consumed, unit: "USD", source: "weekly subscription allocation × native rate-limit used percent" },
    estimatedCostPerObservedToken: usage.total_tokens > 0 ? { amount: fraction(BigInt(consumed.numerator), BigInt(consumed.denominator) * BigInt(usage.total_tokens)), unit: "USD-per-observed-native-total-token", source: "consumed subscription allocation / native token deltas observed in the same rate-limit window", status: "internal-estimate-not-provider-price" } : null,
    caveat: "The Pro rate-limit percentage is coarse and may weight model, cache, or reasoning usage differently; this estimate is an internal allocation gauge, not an OpenAI token price or settled cost." };
}
export function observeNativeUsage({ sessionsRoot = DEFAULT_SESSIONS_ROOT, sessionId, turnId, monthlySubscription = { numerator: "200", denominator: "1" }, includeWeekly = true } = {}) {
  const paths = filesBelow(resolve(sessionsRoot)), cache = new Map(), read = (path) => { if (!cache.has(path)) cache.set(path, readRollout(path)); return cache.get(path); };
  const turnPaths = sessionId ? paths.filter((path) => path.includes(sessionId)) : paths;
  const turns = turnPaths.map(read).flatMap(turnGauges).filter((turn) => (!sessionId || turn.sessionFace === digest(sessionId)) && (!turnId || turn.turn === turnId));
  const weekly = includeWeekly ? weeklyGauge(paths.map(read), monthlySubscription) : null, rate = weekly?.estimatedCostPerObservedToken?.amount;
  const attributedTurns = turns.map((turn) => ({ ...turn, estimatedSubscriptionAllocation: rate ? { amount: fraction(BigInt(rate.numerator) * BigInt(turn.usage.total_tokens), BigInt(rate.denominator)), unit: "USD", source: "turn native total-token delta × current weekly effective subscription-allocation estimate", status: "internal-estimate-not-provider-price" } : null }));
  return { type: "CodexNativeUsageGauges", observedAt: new Date().toISOString(), source: "provider-native Codex rollout receipts", turns: attributedTurns, latestTurn: attributedTurns.sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt))[0] ?? null, weekly, monetaryPricePerToken: "unknown", transcriptRetainedByEnterprise: false };
}
