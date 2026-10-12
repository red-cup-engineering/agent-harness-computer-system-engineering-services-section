#!/usr/bin/env node
import { payloadFromText, readStdin, recordWorkLocusClaim } from "./dev-runtime.mjs";

try {
  const result = await recordWorkLocusClaim(payloadFromText(await readStdin()));
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`dev.bare-cedar-fog.emsenn.net claim-locus: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
