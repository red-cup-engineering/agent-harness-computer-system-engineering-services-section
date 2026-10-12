#!/usr/bin/env node
// character-store-mcp [STORE] [--items DIR]   serve a character store's tools over MCP stdio (the house server)
import { basename, resolve } from "node:path";
import { createMcpServer } from "@red-cup-engineering/mcp-engineering-services-section/server";
import { characterStoreTools, logEntry } from "../src/character-store-tools.mjs";

const args = process.argv.slice(2); const at = args.indexOf("--items"); const items = at >= 0 ? args.splice(at, 2)[1] : undefined;
const store = resolve(args[0] ?? ".");
const session = `session:${Date.now()}`;
logEntry(store, session, "server_start", { store });
createMcpServer({ name: `character-store:${basename(store)}`, version: "0.1.0", tools: characterStoreTools(store, { session, ...(items ? { items } : {}) }) }).serveStdio();
