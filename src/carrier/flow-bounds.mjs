/**
 * The bounds a carrier session keeps, as the flow regulation of the dispatch of work to inference
 * asks of every lane (organizing `enterprise/flow.mjs`: a demand spends on a lane only while its
 * gradient stays positive, so each carrying has a finite budget):
 *
 *   budget   how many provider turns and how many tokens one task may draw before no further turn
 *            is launched. The caller states it (derived from the route's `budget` by
 *            `budgetOfRoute`); a session whose caller states none takes the carrier configuration's
 *            (`dialect.budget`, or `METROPLAT_<POOL>_SESSION_TURNS` / `_TOKENS`). There is no
 *            unbounded session: with neither, the session is refused before it starts. What was
 *            spent is kept in the task's directory, so a recovery resumes the same budget instead
 *            of opening a new one.
 *   ingress  how many input tokens of variable context a prompt may inline (`dialect.ceiling`
 *            or the carrier's own parameter). What does not fit is written once into the task's
 *            directory and the prompt names its path, digest and a short summary, so the carrier
 *            reads what it needs.
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";

const positiveInteger = (value) => Number.isSafeInteger(value) && value > 0 ? value : undefined;
const positiveNumber = (value) => Number.isFinite(value) && value > 0 ? value : undefined;
const envName = (dialect, suffix) => `METROPLAT_${dialect.pool.toUpperCase().replaceAll("-", "_")}_${suffix}`;

/** The session budget of a route's budget (`{ share, amount, unit }` of organizing `routeFlow`): its
 *  tokens when the lane meters tokens, and the turns the caller allows. Fields the route does not
 *  state stay absent, and the carrier configuration answers for them. */
export function budgetOfRoute(routeBudget, { turns } = {}) {
  const tokens = routeBudget?.unit === "token" && Number.isFinite(routeBudget.amount) ? Math.floor(routeBudget.amount) : undefined;
  return Object.freeze({
    ...(positiveInteger(turns) === undefined ? {} : { turns }),
    ...(positiveInteger(tokens) === undefined ? {} : { tokens }),
  });
}

/** `{ turns, tokens }`, both finite: the caller's, else the dialect's, else the environment's. */
export function resolveSessionBudget(dialect, budget, environment = process.env) {
  const resolved = {};
  for (const [field, suffix] of [["turns", "SESSION_TURNS"], ["tokens", "SESSION_TOKENS"]]) {
    const value = positiveInteger(budget?.[field]) ?? positiveInteger(dialect.budget?.[field]) ?? positiveInteger(Number(environment?.[envName(dialect, suffix)]));
    if (value === undefined) throw new TypeError(`a ${dialect.label} session needs a finite ${field} budget: from its caller, its dialect's budget or ${envName(dialect, suffix)}`);
    resolved[field] = value;
  }
  return Object.freeze(resolved);
}

/** The tokens one turn drew: the dialect's reading of its usage, else input, output and reasoning
 *  output (the fields of organizing `TOKEN_USAGE_RESOURCES` that are not cache reads). */
export function tokensDrawn(dialect, usage) {
  if (usage === null || typeof usage !== "object") return 0;
  if (typeof dialect.tokensOf === "function") return Math.max(0, Number(dialect.tokensOf(usage)) || 0);
  return ["input_tokens", "cache_write_input_tokens", "output_tokens", "reasoning_output_tokens"]
    .reduce((sum, field) => sum + (Number.isFinite(usage[field]) ? usage[field] : 0), 0);
}

/** The task directory holding a turn directory (`<task>/turns/turn-000001`), or the directory itself. */
export function taskRootOf(directory) {
  return /^turn-\d{6}$/u.test(path.basename(directory)) && path.basename(path.dirname(directory)) === "turns"
    ? path.dirname(path.dirname(directory)) : directory;
}

const BUDGET_FILE = "session-budget.json";

/**
 * The meter of one task: the turns and tokens its provider invocations have drawn, kept in the task's
 * directory. `charge(result)` records one launched turn; `exhausted()` says why no further turn may
 * be launched, or nothing while budget remains.
 */
export function sessionMeter(dialect, directory, { budget, environment = process.env } = {}) {
  const limits = resolveSessionBudget(dialect, budget, environment);
  const root = taskRootOf(directory);
  const file = path.join(root, BUDGET_FILE);
  let drawn = { turns: 0, tokens: 0 };
  try {
    const stored = JSON.parse(readFileSync(file, "utf8"));
    drawn = { turns: positiveInteger(stored.turns) ?? 0, tokens: positiveInteger(stored.tokens) ?? 0 };
  } catch (error) { if (error.code !== "ENOENT" && !(error instanceof SyntaxError)) throw error; }
  const keep = () => {
    mkdirSync(root, { recursive: true, mode: 0o700 });
    const next = `${file}.${process.pid}`;
    writeFileSync(next, `${JSON.stringify(drawn)}\n`, { mode: 0o600 });
    renameSync(next, file);
  };
  return Object.freeze({
    limits,
    drawn: () => Object.freeze({ ...drawn }),
    charge(result) { drawn = { turns: drawn.turns + 1, tokens: drawn.tokens + tokensDrawn(dialect, result?.usage) }; keep(); return result; },
    exhausted() {
      if (drawn.turns >= limits.turns) return `${drawn.turns} of ${limits.turns} turns`;
      if (drawn.tokens >= limits.tokens) return `${drawn.tokens} of ${limits.tokens} tokens`;
      return undefined;
    },
  });
}

/** A session result stopped for its spent budget: not ok, with the reason among its errors. */
export function stoppedForBudget(dialect, result, reason) {
  return Object.freeze({ ...result, ok: false, budgetSpent: true,
    errors: Object.freeze([...(result.errors ?? []), `${dialect.label} session budget spent (${reason}); no further turn is launched`]) });
}

/** The ingress parameters of a carrier: its ceiling in input tokens and the bytes one token stands for. */
export function resolveIngress(dialect, { ceiling, bytesPerToken } = {}, environment = process.env) {
  const limit = positiveInteger(ceiling) ?? positiveInteger(dialect.ceiling) ?? positiveInteger(Number(environment?.[envName(dialect, "CONTEXT_CEILING")]));
  const size = positiveNumber(bytesPerToken) ?? positiveNumber(dialect.bytesPerToken);
  if (limit === undefined) throw new TypeError(`a ${dialect.label} carrier needs a context ceiling (input tokens): its parameter, its dialect's ceiling or ${envName(dialect, "CONTEXT_CEILING")}`);
  if (size === undefined) throw new TypeError(`a ${dialect.label} carrier needs its dialect's bytesPerToken to measure a context against its ceiling`);
  return Object.freeze({ ceiling: limit, bytesPerToken: size });
}

const clip = (text, limit) => text.length <= limit ? text : `${text.slice(0, limit)}…`;

/**
 * Lines for the variable context of a prompt under the ingress ceiling. `entries` are
 * `{ key, label, value, summary? }`; each returns the line `label: <JSON>` while the entries inlined so
 * far, smallest first, stay within `ceiling`, and otherwise a line naming the file the value was
 * written to (once, under its digest, in `directory`), its size and digest, and `summary`.
 */
export function contextLines(entries, { ceiling, bytesPerToken, directory }) {
  const measured = entries.map((entry) => {
    const text = typeof entry.value === "string" ? entry.value : JSON.stringify(entry.value);
    return { ...entry, text, tokens: Math.ceil(Buffer.byteLength(text) / bytesPerToken) };
  });
  let inlined = 0;
  const inline = new Set();
  for (const entry of [...measured].sort((a, b) => a.tokens - b.tokens)) {
    if (inlined + entry.tokens > ceiling) break;
    inlined += entry.tokens;
    inline.add(entry.key);
  }
  return new Map(measured.map((entry) => {
    if (inline.has(entry.key)) return [entry.key, `${entry.label}: ${entry.text}`];
    const digest = createHash("sha256").update(entry.text).digest("hex");
    const file = path.join(directory, "context", `${entry.key}-${digest.slice(0, 16)}.json`);
    mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
    try { writeFileSync(file, entry.text, { mode: 0o600, flag: "wx" }); } catch (error) { if (error.code !== "EEXIST") throw error; }
    return [entry.key, `${entry.label}: not inlined (${Buffer.byteLength(entry.text)} bytes, about ${entry.tokens} input tokens, over the ${ceiling}-token ingress ceiling); kept in ${file} (sha256 ${digest}). ${entry.summary === undefined ? "" : `Summary: ${clip(entry.summary, 800)}. `}Read from that file only what your method needs.`];
  }));
}
