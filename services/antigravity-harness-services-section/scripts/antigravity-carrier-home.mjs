#!/usr/bin/env node
/**
 * Provision an Antigravity carrier home: the HOME one character's agy sessions run as.
 *
 *   antigravity-carrier-home.mjs --home <dir> --mcp-env <file> --bridge <bridge-mcp-server.mjs>
 *     [--server metroplat] [--login <the signed-in account's antigravity-oauth-token>]
 *
 * The home holds agy's own state for that character only:
 *
 *   login        the account's login, linked (not copied) from the signed-in user's home, so one
 *                Google AI Pro subscription carries every character and a refresh is seen by all;
 *   permissions  settings.json's allowlist: the commands engineering work runs, never network
 *                tools, `git push` or `--dangerously-skip-permissions`, and every tool of the house's
 *                MCP server (`mcp(<server>/*)`), whose own authorization of the character's client
 *                is what bounds those calls. What a session may write is decided not here but by its
 *                unit (the dialect's confinement);
 *   MetroPlat    agy's MCP configuration, naming the node through the stdio bridge as the machine
 *                client issued to the character (`--mcp-env`: MCP_ORIGIN, MCP_CLIENT_ID,
 *                MCP_CLIENT_SECRET, as metroplat-admit-principal issues them). The secret stays in
 *                that file; only its path is configured.
 *
 * Rerunning rewrites the settings and the MCP entry and keeps everything else.
 */
import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, readFileSync, renameSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

const READING = ["cat", "head", "tail", "ls", "find", "grep", "rg", "wc", "sort", "uniq", "diff", "jq", "pwd", "realpath", "stat", "file"];
const GIT = ["status", "diff", "log", "show", "rev-parse", "ls-files", "grep", "blame", "add", "commit", "restore", "mv", "rm", "switch", "worktree", "merge-base", "cat-file"];
const WORKING = ["node", "pnpm", "npx", "mkdir", "cp", "mv", "rm", "touch", "sed", "awk", "python3", "chmod", "ln"];

/** The allowlist settings.json carries, in agy's grant names (`command(<binary and subcommand>)`, `mcp(<server>/<tool>)`). */
export const antigravityPermissions = (server) => Object.freeze([
  ...READING.map((command) => `command(${command})`),
  ...GIT.map((subcommand) => `command(git ${subcommand})`),
  ...WORKING.map((command) => `command(${command})`),
  `mcp(${server}/*)`,
]);

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 2) {
    if (!argv[index].startsWith("--")) throw new TypeError(`unexpected argument ${argv[index]}`);
    args[argv[index].slice(2)] = argv[index + 1];
  }
  return args;
}

const writeAtomically = (file, text) => {
  const temporary = `${file}.${process.pid}.tmp`;
  writeFileSync(temporary, text, { mode: 0o600 });
  renameSync(temporary, file);
};

/** Make `home` a carrier home; returns what it configured. */
export function provisionAntigravityHome({ home, mcpEnv, bridge, server = "metroplat", login = path.join(homedir(), ".gemini", "antigravity-cli", "antigravity-oauth-token"), agy = "agy" }) {
  for (const [name, value] of Object.entries({ home, mcpEnv, bridge, login })) {
    if (typeof value !== "string" || !path.isAbsolute(value)) throw new TypeError(`--${name.replace(/[A-Z]/gu, (letter) => `-${letter.toLowerCase()}`)} must be an absolute path`);
  }
  if (!existsSync(login)) throw new TypeError(`no signed-in Antigravity login at ${login}`);
  if (!existsSync(mcpEnv) || !/^MCP_CLIENT_SECRET=/mu.test(readFileSync(mcpEnv, "utf8"))) throw new TypeError(`${mcpEnv} holds no machine client`);
  if (!existsSync(bridge)) throw new TypeError(`no MCP bridge at ${bridge}`);
  const state = path.join(home, ".gemini", "antigravity-cli");
  mkdirSync(state, { recursive: true, mode: 0o700 });
  const linked = path.join(state, "antigravity-oauth-token");
  if (existsSync(linked) || lstatSync(linked, { throwIfNoEntry: false }) !== undefined) unlinkSync(linked);
  symlinkSync(login, linked);
  writeAtomically(path.join(state, "settings.json"), `${JSON.stringify({ telemetryEnabled: false, permissions: { allow: antigravityPermissions(server) } }, null, 2)}\n`);
  const environment = { ...process.env, HOME: home };
  try { execFileSync(agy, ["mcp", "remove", server], { env: environment, stdio: "ignore" }); } catch { /* not configured yet */ }
  execFileSync(agy, ["mcp", "add", server, process.execPath, "--", `--env-file=${mcpEnv}`, bridge], { env: environment, stdio: ["ignore", "ignore", "inherit"] });
  return Object.freeze({ home, login: linked, permissions: antigravityPermissions(server).length, server });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = parseArgs(process.argv.slice(2));
  const done = provisionAntigravityHome({ home: args.home, mcpEnv: args["mcp-env"], bridge: args.bridge, server: args.server, login: args.login, agy: args.agy });
  process.stdout.write(`${JSON.stringify(done)}\n`);
}
