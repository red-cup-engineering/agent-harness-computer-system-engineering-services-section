#!/usr/bin/env node
import { hookBudgetMetrics } from "@emsenn/managing-operations/accounting";
import { payloadFromText, readStdin, recordDevEvent } from "./dev-runtime.mjs";

try {
  const raw = await readStdin();
  const payload = payloadFromText(raw);
  const metrics = hookBudgetMetrics(payload, raw);
  await recordDevEvent("dev.bare-cedar-fog.emsenn.net.budget-guard", payload, {
    budget: metrics,
  });
  if (metrics.budgetBand === "over" || metrics.budgetBand === "huge") {
    const tool = typeof payload.tool_name === "string" ? payload.tool_name : "this operation";
    process.stdout.write(`${JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PostToolUse",
        additionalContext: `dev.bare-cedar-fog.emsenn.net context-budget ${metrics.budgetBand}: ${tool} added ~${metrics.estimatedTokens} tokens (budget ${metrics.budgetLimitTokens}). Prefer compact MCP/read-* projections, targeted offsets, or read-work-vocabulary/orient-agent over re-reading raw payloads.`,
      },
    })}\n`);
  }
} catch {
  process.exitCode = 0;
}
