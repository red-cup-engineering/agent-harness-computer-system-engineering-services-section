#!/usr/bin/env node
import { agentSessionHandoff, payloadFromText, readStdin, recordDevEvent } from "./dev-runtime.mjs";

try {
  const payload = payloadFromText(await readStdin());
  const handoff = await agentSessionHandoff(payload);
  await recordDevEvent("dev.bare-cedar-fog.emsenn.net.precompact-handoff", payload, {
    handoff: "checkpoint-requested",
    handoffCarrier: handoff,
  });
} catch {
  process.exitCode = 0;
}
