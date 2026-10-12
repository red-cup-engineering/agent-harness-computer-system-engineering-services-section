#!/usr/bin/env node
import { readFileSync } from "node:fs"; import { admitChannelMessage } from "../src/message-events.mjs"; export { admitChannelMessage };
if (import.meta.main) { const input = JSON.parse(readFileSync(0, "utf8")); process.stdout.write(`${JSON.stringify(admitChannelMessage(input, { at: input.at }))}\n`); }
