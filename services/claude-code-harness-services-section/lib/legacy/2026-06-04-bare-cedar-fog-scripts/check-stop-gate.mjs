#!/usr/bin/env node
import { agentMashSignal, payloadFromText, readStdin, recordDevEvent } from "./dev-runtime.mjs";

try {
  const payload = payloadFromText(await readStdin());
  const signal = await agentMashSignal(payload, { eventScanLimit: 320 });
  const gate = signal.yourClaims.length === 0 ? "clear" : "watch";
  await recordDevEvent("dev.bare-cedar-fog.emsenn.net.check-stop-gate", payload, {
    gate,
    reason: gate === "clear"
      ? "dev.bare-cedar-fog.emsenn.net agent cockpit instance has no local stop blockers"
      : "dev.bare-cedar-fog.emsenn.net sees active work-locus claims for this session at stop",
    activeClaims: signal.yourClaims,
    claimConflicts: signal.yourClaimConflicts,
  });
} catch {
  process.exitCode = 0;
}
