#!/usr/bin/env node
import { payloadFromText, readAgentSessionHandoff, readStdin } from "./dev-runtime.mjs";

try {
  const handoff = await readAgentSessionHandoff(payloadFromText(await readStdin()));
  process.stdout.write(`${JSON.stringify(handoff, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`dev.bare-cedar-fog.emsenn.net read-session-handoff: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
