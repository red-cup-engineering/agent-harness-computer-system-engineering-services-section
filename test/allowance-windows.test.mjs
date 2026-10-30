import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import { subscriptionAllowance, subscriptionDeclaration, subscriptionReadings } from "@red-cup-engineering/computer-inference-engine/media/subscription-allowances";
import { admitAllowance } from "@red-cup-engineering/organizing/enterprise/allowances";

import { antigravityAllowanceStatement, antigravityDialect } from "../services/antigravity-harness-services-section/src/antigravity-session.mjs";
import { readCodexSessionContext } from "../services/codex-harness-services-section/src/codex-exec.mjs";
import { scratchRoot } from "./support/scratch.mjs";

// What `agy --print /usage` printed on 2026-10-28T00:59Z (an admission output kept beside the Group 354 runs).
const AGY_USAGE = "Gemini Models\tWeekly Limit Remaining\t91%\t2026-11-03T09:34:42Z\nGemini Models\tFive Hour Limit Remaining\t72%\t2026-10-28T04:11:50Z\nClaude and GPT models\tWeekly Limit Remaining\t100%\t2026-11-04T00:59:16Z\nClaude and GPT models\tFive Hour Limit Remaining\t100%\t2026-10-28T05:59:16Z\nGemini 4 Argon\tGemini 4 Argon Weekly Limit\t0%\t2026-11-03T09:29:07Z\n";

/** The Antigravity allowance with the stated meters its declaration needs to carry (computer-inference-engine
 *  `content/allowances/google-ai-pro-antigravity.json`: `week` stated, 100 percent, beside the other windows). */
const statedAntigravity = () => admitAllowance({
  ...subscriptionDeclaration("google-ai-pro-antigravity"),
  meters: [
    { id: "week", law: "stated", hours: 168, budget: 100, because: "the weekly Gemini window agy states" },
    { id: "five-hour", law: "stated", hours: 5, budget: 100, because: "the five-hour Gemini window agy states" },
    { id: "claude-gpt-week", law: "stated", hours: 168, budget: 100, because: "the weekly Claude and GPT window agy states" },
  ],
});

test("agy's usage text becomes a statement of the used share of each window with its reset", () => {
  const statement = antigravityAllowanceStatement(AGY_USAGE, antigravityDialect.quotaMeters);
  assert.deepEqual(Object.keys(statement.unifiedWindows).sort(), ["claude-gpt-five-hour", "claude-gpt-week", "five-hour", "week"]);
  assert.equal(statement.unifiedWindows.week.resetsAt, Date.parse("2026-11-03T09:34:42Z") / 1000);
  assert.equal(Math.round(statement.unifiedWindows.week.utilization * 100), 9);
  assert.equal(antigravityAllowanceStatement("nothing here\n", antigravityDialect.quotaMeters), undefined);
  assert.equal(antigravityAllowanceStatement("Gemini Models\tWeekly Limit Remaining\t191%\t2026-11-03T09:34:42Z\n", antigravityDialect.quotaMeters), undefined);
});

test("the statement is read as ledger readings of the allowance's stated meters", () => {
  const allowance = statedAntigravity();
  const statement = antigravityAllowanceStatement(AGY_USAGE, antigravityDialect.quotaMeters);
  const readings = subscriptionReadings(allowance, statement, { at: "2026-10-28T01:00:00.000Z" });
  assert.deepEqual(readings.map(({ type, meter, used, resetsAt }) => ({ type, meter, used, resetsAt })).sort((a, b) => a.meter.localeCompare(b.meter)), [
    { type: "reading", meter: "claude-gpt-week", used: 0, resetsAt: "2026-11-04T00:59:16.000Z" },
    { type: "reading", meter: "five-hour", used: 28, resetsAt: "2026-10-28T04:11:50.000Z" },
    { type: "reading", meter: "week", used: 9, resetsAt: "2026-11-03T09:34:42.000Z" },
  ]);
});

test("Codex's rate-limit statement in its session is read as readings of the chatgpt-codex window", (t) => {
  const codexHome = mkdtempSync(path.join(scratchRoot(), "codex-home-"));
  t.after(() => rmSync(codexHome, { recursive: true, force: true }));
  const thread = "01926f3a-0000-7000-8000-000000000001";
  const created = Number.parseInt(thread.replaceAll("-", "").slice(0, 12), 16);
  const day = new Date(created).toISOString().slice(0, 10).replaceAll("-", "/");
  const folder = path.join(codexHome, "sessions", day);
  mkdirSync(folder, { recursive: true });
  const resetsAt = Math.floor(Date.parse("2026-11-02T00:00:00Z") / 1000);
  const timestamp = new Date(created + 1000).toISOString();
  writeFileSync(path.join(folder, `rollout-${thread}.jsonl`), [
    { timestamp, type: "turn_context", payload: { model: "gpt-5.5", effort: "high" } },
    { timestamp, type: "event_msg", payload: { type: "token_count", rate_limits: { primary: { used_percent: 62.5, window_minutes: 10080, resets_at: resetsAt }, secondary: null } } },
  ].map((entry) => JSON.stringify(entry)).join("\n") + "\n");
  const context = readCodexSessionContext(thread, { before: created + 60_000, codexHome });
  assert.equal(context.model, "gpt-5.5");
  const readings = subscriptionReadings(subscriptionAllowance("chatgpt-codex"), context.allowance, { at: timestamp });
  assert.deepEqual(readings.map(({ meter, used, resetsAt: reset }) => ({ meter, used, reset })), [{ meter: "primary", used: 62.5, reset: "2026-11-02T00:00:00.000Z" }]);
});
