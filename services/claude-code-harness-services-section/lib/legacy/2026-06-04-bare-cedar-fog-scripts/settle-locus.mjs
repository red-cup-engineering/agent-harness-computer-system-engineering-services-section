#!/usr/bin/env node
import { payloadFromText, readStdin, recordDevEvent, recordWorkLocusClaim } from "./dev-runtime.mjs";

const MUTATING_TOOLS = new Set(["Edit", "Write", "MultiEdit", "NotebookEdit", "apply_patch"]);

function toolName(payload) {
  return typeof payload.tool_name === "string" ? payload.tool_name
    : typeof payload.toolName === "string" ? payload.toolName
      : typeof payload.tool === "string" ? payload.tool
        : null;
}

try {
  const payload = payloadFromText(await readStdin());
  await recordDevEvent("dev.bare-cedar-fog.emsenn.net.settle-locus", payload);
  const name = toolName(payload);
  if (name !== null && MUTATING_TOOLS.has(name)) {
    await recordWorkLocusClaim({
      ...payload,
      action: "release",
      reason: `automatic pretool claim for ${name}`,
    });
  }
} catch {
  process.exitCode = 0;
}
