#!/usr/bin/env node
// character-store-log STORE E A [V-JSON]   append one {ts, e, a, v} row to the store's session log
// character-store-log [STORE]              PostToolUse hook: log the tool call read from stdin; never blocks
import { resolve } from "node:path";
import { logEntry } from "../src/character-store-tools.mjs";

const args = process.argv.slice(2);
if (args.length >= 3) {
  const [store, e, a, v = "null"] = args;
  let value; try { value = JSON.parse(v); } catch { value = v; }
  logEntry(store, e, a, value);
} else {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  let payload; try { payload = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { process.exit(0); }
  try { logEntry(resolve(args[0] ?? "."), `tool:${payload?.tool_name ?? "unknown"}`, "tool_use", { tool: payload?.tool_name, input: payload?.tool_input, output: payload?.tool_response }); } catch {}
}
