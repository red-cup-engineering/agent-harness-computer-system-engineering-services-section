#!/usr/bin/env node
import { observeNativeUsage } from "../src/native-usage.mjs";

const value = (name) => { const index = process.argv.indexOf(name); return index < 0 ? undefined : process.argv[index + 1]; };
process.stdout.write(`${JSON.stringify(observeNativeUsage({ sessionId: value("--session"), turnId: value("--turn"), includeWeekly: !process.argv.includes("--turn-only") }), null, 2)}\n`);
