#!/usr/bin/env node
import { agentMashSignal, payloadFromText, readAgentState, readStdin, sessionId } from "./dev-runtime.mjs";

try {
  const payload = payloadFromText(await readStdin());
  const session = sessionId(payload);
  const [state, signal] = await Promise.all([
    readAgentState(),
    agentMashSignal(payload, { eventScanLimit: 160 }),
  ]);
  const current = state.sessions?.[session];
  const hooks = current?.hooks ?? 0;
  const harnesses = Array.isArray(current?.harnesses) ? current.harnesses.join(",") : "agent";
  const claims = signal.yourClaims.length;
  const capabilities = signal.yourCapabilities?.length ?? 0;
  const conflicts = signal.yourClaimConflicts.length;
  const coordination = signal.activityPub?.reading?.coordination ?? null;
  const inbox = signal.activityPub?.observer?.inbox ?? null;
  const inboxActivities = Number(inbox?.activities ?? 0);
  const perceivedHeld = inbox?.agent?.perception?.held ?? null;
  const claimText = claims === 0 ? "" : ` · claims ${claims}`;
  const capabilityText = capabilities === 0 ? "" : ` · caps ${capabilities}`;
  const conflictText = conflicts === 0 ? "" : ` · conflicts ${conflicts}`;
  const apText = coordination === null ? "" : ` · AP ${coordination}`;
  const inboxText = inboxActivities === 0 ? "" : ` · inbox ${inboxActivities}${perceivedHeld === null ? "" : `/held ${perceivedHeld}`}`;
  process.stdout.write(`◆ dev.bare-cedar-fog.emsenn.net · ${harnesses} · hooks ${hooks}${claimText}${capabilityText}${conflictText}${apText}${inboxText}\n`);
} catch {
  process.stdout.write("◆ dev.bare-cedar-fog.emsenn.net\n");
}
