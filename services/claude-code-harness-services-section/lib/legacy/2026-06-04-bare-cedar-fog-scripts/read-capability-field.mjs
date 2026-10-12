#!/usr/bin/env node
import { payloadFromText, readCapabilityField, readStdin } from "./dev-runtime.mjs";

try {
  const field = await readCapabilityField(payloadFromText(await readStdin()));
  process.stdout.write(`${JSON.stringify(field, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`dev.bare-cedar-fog.emsenn.net read-capability-field: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
