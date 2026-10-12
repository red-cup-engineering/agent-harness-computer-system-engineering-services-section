#!/usr/bin/env node
import { readDevWorkVocabulary } from "./dev-runtime.mjs";

try {
  const vocabulary = await readDevWorkVocabulary();
  process.stdout.write(`${JSON.stringify(vocabulary, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`dev.bare-cedar-fog.emsenn.net read-work-vocabulary: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
