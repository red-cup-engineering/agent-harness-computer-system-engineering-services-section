#!/usr/bin/env node
import { payloadFromText, readInfotileField, readStdin } from "./dev-runtime.mjs";

try {
  const payload = payloadFromText(await readStdin());
  const field = await readInfotileField(payload);
  process.stdout.write(`${JSON.stringify(field, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`dev.bare-cedar-fog.emsenn.net read-infotile-field: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
