#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { admitSessionFinding } from "../src/finding-events.mjs";
export { admitSessionFinding };
if (import.meta.main) { const input = JSON.parse(readFileSync(0, "utf8")); process.stdout.write(`${JSON.stringify(admitSessionFinding(input, { at: input.at }))}\n`); }
