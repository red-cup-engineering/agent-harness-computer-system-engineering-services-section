#!/usr/bin/env node
import { readFileSync } from "node:fs"; import { foldMessageEvents, projectMessages } from "../src/message-snapshot.mjs"; export { foldMessageEvents, projectMessages };
if (import.meta.main) { const input = JSON.parse(readFileSync(0, "utf8")); process.stdout.write(`${JSON.stringify(projectMessages(foldMessageEvents(input.events, { generatedAt: input.generatedAt }), input))}\n`); }
