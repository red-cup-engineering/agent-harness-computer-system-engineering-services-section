#!/usr/bin/env node
import { agentMashSignal, payloadFromText, readStdin, recordDevEvent, recordWorkLocusClaim } from "./dev-runtime.mjs";

const MUTATING_TOOLS = new Set(["Edit", "Write", "MultiEdit", "NotebookEdit", "apply_patch"]);

function toolName(payload) {
  return typeof payload.tool_name === "string" ? payload.tool_name
    : typeof payload.toolName === "string" ? payload.toolName
      : typeof payload.tool === "string" ? payload.tool
        : null;
}

try {
  const payload = payloadFromText(await readStdin());
  await recordDevEvent("dev.bare-cedar-fog.emsenn.net.campaign-pretool", payload);
  const name = toolName(payload);
  if (name !== null && MUTATING_TOOLS.has(name)) {
    const result = await recordWorkLocusClaim({
      ...payload,
      reason: `automatic pretool claim for ${name}`,
      ttl_minutes: 90,
    });
    const signal = await readMashSignal(payload);
    process.stdout.write(`${JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        additionalContext: pretoolClaimContext(name, result, signal),
      },
    })}\n`);
  }
} catch {
  process.exitCode = 0;
}

async function readMashSignal(payload) {
  try {
    return await agentMashSignal(payload, { eventScanLimit: 240 });
  } catch {
    return null;
  }
}

function pretoolClaimContext(tool, result, signal) {
  const capability = result.capability;
  const lines = [
    `dev.bare-cedar-fog.emsenn.net MASH pre-tool claim: ${tool} now holds ${capability?.grants ?? "an unknown workspace locus"} as ${capability?.id ?? "an unknown Capability"}.`,
  ];
  lines.push(...inboxPerceptionContext(signal));
  if (Array.isArray(result.conflicts) && result.conflicts.length > 0) {
    lines.push(`OCap conflict watch: ${result.conflicts.length} overlapping active capability claim${result.conflicts.length === 1 ? "" : "s"}.`);
    for (const conflict of result.conflicts.slice(0, 4)) {
      lines.push(`- ${conflict.path}: ${conflict.left.session} ${conflict.left.capability ?? conflict.left.claimId} overlaps ${conflict.right.session} ${conflict.right.capability ?? conflict.right.claimId} (${conflict.severity}).`);
    }
    lines.push("Before editing, prefer the ICK Jupyter InfoTile notebook at /api/contents/notebooks/infotile-field.ipynb or release/renegotiate the overlapping capability if this is not intentionally shared work.");
  } else {
    lines.push("No active overlapping work-locus capability claims were detected for this edit.");
  }
  return lines.join("\n");
}

function inboxPerceptionContext(signal) {
  const inbox = signal?.activityPub?.observer?.inbox ?? null;
  if (inbox === null || inbox.activities === 0) return ["No delivered ActivityPub inbox activities are currently addressed to this agent actor."];
  const agent = inbox.agent;
  const lines = [
    `AP inbox perception: ${inbox.activities} delivered activit${inbox.activities === 1 ? "y" : "ies"} folded through animating perceiveInbox${agent === null ? "." : `; held ${agent.perception?.held ?? 0}, contested ${agent.perception?.contested ?? 0}, stance ${agent.stance?.lean ?? "unknown"}, cognition ${agent.cognition?.regime ?? "unknown"}.`}`,
  ];
  for (const activity of (inbox.recent ?? []).slice(-3)) {
    lines.push(`- inbox ${activity.type} from ${activity.actor}: ${activity.content ?? activity.objectId ?? activity.id ?? "no object summary"}`);
  }
  lines.push("Before mutating, treat direct AP inbox Activities as live coordination context alongside OCap claims.");
  return lines;
}
