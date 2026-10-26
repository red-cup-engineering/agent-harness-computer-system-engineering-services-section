#!/usr/bin/env node
/**
 * House instrument: project (read) or write the Claude harness of a node from the agency records
 * with the harness section's own projector (claude-harness-projection.mjs). It authors nothing:
 * every projected file comes from projectClaudeHarness, and the write is writeClaudeHarness.
 *
 *   node project-info-claude-harness.mjs --projector <file> [--node <dir>] [--agency-root <dir>]
 *        [--settlement-root <dir>] [--mcp-servers <json file>] [--show <relative path>] [--write]
 *
 * Without --write it only reads: it prints the files map (paths and sizes), counts, obstructions,
 * the check against the node, and with --show the text of one projected file. The projector is
 * imported by absolute file URL so its own imports resolve where it lives. The deny list is the
 * union of the node's existing permissions.deny and the module's SHARED_CHECKOUT_DENY.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const args = process.argv.slice(2);
const opt = (name, fallback) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : fallback; };
const projectorFile = opt("projector");
if (!projectorFile) { console.error("--projector <absolute file> is required"); process.exit(2); }
const node = path.resolve(opt("node", "/home/emsenn/info"));
const agencyRoot = path.resolve(opt("agency-root", path.join(node, "lib")));
const settlementRoot = path.resolve(opt("settlement-root", process.env.METROPLAT_DATA_ROOT ?? ""));

const mod = await import(pathToFileURL(projectorFile).href);
const settingsFile = path.join(node, ".claude/settings.local.json");
const existing = existsSync(settingsFile) ? (JSON.parse(readFileSync(settingsFile, "utf8")).permissions?.deny ?? []) : [];
const deny = [...new Set([...existing, ...mod.SHARED_CHECKOUT_DENY])];

// The projector removes every server it is not given, so an empty list would blank the node's `.mcp.json`.
// The servers are the host's: pass the MetroPlat host's `mcpServers()` as JSON; a write without them is refused.
const serversFile = opt("mcp-servers");
const mcpServers = serversFile ? JSON.parse(readFileSync(serversFile, "utf8")) : {};
if (args.includes("--write") && Object.keys(mcpServers).length === 0) {
  console.error("--write needs --mcp-servers <json file> (the host's mcpServers()): the projector would otherwise delete every server in .mcp.json");
  process.exit(2);
}

const projection = mod.projectClaudeHarness({ node, agencyRoot, settlementRoot, mcpServers, deny });
console.log(JSON.stringify({ node, agencyRoot, settlementRoot, projector: projectorFile, counts: projection.counts, env: projection.env, denyCount: deny.length, obstructions: projection.obstructions }, null, 2));
for (const [file, text] of projection.files) console.log(`${String(text.length).padStart(8)}  ${file}`);
const show = opt("show");
if (show) console.log(`----- ${show}\n${projection.files.get(show)}`);
console.log(JSON.stringify(mod.checkClaudeHarness(projection), null, 2));
if (args.includes("--write")) console.log(JSON.stringify(mod.writeClaudeHarness(projection), null, 2));
