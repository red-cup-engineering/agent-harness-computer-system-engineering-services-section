#!/usr/bin/env node
import { agentOrientation, payloadFromText, readStdin } from "./dev-runtime.mjs";

try {
  const payload = payloadFromText(await readStdin());
  const orientation = await agentOrientation(payload);
  process.stdout.write(`${JSON.stringify(orientation, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`dev.bare-cedar-fog.emsenn.net orient-agent: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
