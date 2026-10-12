#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { foldFindingEvents, projectFindings } from "../src/finding-snapshot.mjs";
export { foldFindingEvents, projectFindings };
if (import.meta.main) { const input = JSON.parse(readFileSync(0, "utf8")); process.stdout.write(`${JSON.stringify(projectFindings(foldFindingEvents(input.events, { generatedAt: input.generatedAt }), input))}\n`); }
