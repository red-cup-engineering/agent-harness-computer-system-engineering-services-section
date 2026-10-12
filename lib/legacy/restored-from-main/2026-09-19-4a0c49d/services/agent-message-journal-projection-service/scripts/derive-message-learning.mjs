#!/usr/bin/env node
import { readFileSync } from "node:fs"; import { deriveMessageLearning } from "../src/message-learning.mjs"; export { deriveMessageLearning };
if (import.meta.main) { const input = JSON.parse(readFileSync(0, "utf8")); process.stdout.write(`${JSON.stringify(deriveMessageLearning(input.reading, input.params, { generatedAt: input.generatedAt }))}\n`); }
