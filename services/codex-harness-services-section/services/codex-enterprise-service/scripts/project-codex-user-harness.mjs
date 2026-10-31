#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REQUIRED_MCP = ["codex_enterprise", "codex_mape_office", "inference_work_market", "notebooklm_workspace_market", "notebooklm_knowledge_library", "semioverse", "codex_private_mud"];
const REQUIRED_CODEX_ENTERPRISE_TOOLS = ["observe_github_software_induction_readiness", "github_software_induction"];
const STARTUP_MCP = new Set(["inference_work_market", "officer_repertoire_market"]);

// AGENTS.md is no longer projected here: it was hand-authored prose with no
// generator behind it, and its "standing authority" framing was the exact
// shape of a prompt-injection self-authorization grant (see the removed
// `authorityContract` field this file used to assert against). The Leader
// removed the source doc rather than keep curating a policy document this
// projector could silently restore. Only .codex/hooks.json is projected now.
function projections(target) {
  const projected = new Map([
    [join(target, ".codex/hooks.json"), `${JSON.stringify({ description: "Lifecycle receipt hooks are opt-in; skills provide task-local process.", hooks: {} }, null, 2)}\n`],
  ]);
  return projected;
}

function table(config, name) {
  return config.match(new RegExp(`(?:^|\\n)\\[mcp_servers\\.${name}\\]\\n([\\s\\S]*?)(?=\\n\\[|$)`, "u"))?.[1] ?? "";
}

function validateConfig(target) {
  const path = join(target, ".codex/config.toml");
  if (!existsSync(path)) throw new Error(`Codex user config is missing: ${path}`);
  const config = readFileSync(path, "utf8");
  for (const name of REQUIRED_MCP) if (!new RegExp(`^\\[mcp_servers\\.${name}\\]$`, "mu").test(config)) throw new Error(`Codex user config does not expose ${name}`);
  for (const name of [...REQUIRED_MCP, "officer_repertoire_market"]) {
    const expected = STARTUP_MCP.has(name);
    if (!new RegExp(`^enabled\\s*=\\s*${expected}$`, "mu").test(table(config, name))) throw new Error(`Codex user config must set ${name} enabled = ${expected}`);
  }
  const enterprise = table(config, "codex_enterprise");
  for (const tool of REQUIRED_CODEX_ENTERPRISE_TOOLS) if (!new RegExp(`enabled_tools\\s*=\\s*\\[[^\\]]*${tool}`, "u").test(enterprise)) throw new Error(`Codex enterprise config does not enable ${tool}`);
  const market = table(config, "inference_work_market");
  if (!/EXPECTED_RESOLUTION_PRICE_URL\s*=\s*"http:\/\/127\.0\.0\.1:8800\/"/u.test(market)) throw new Error("Codex inference market does not use the live expected-resolution observer on 127.0.0.1:8800");
  if (!/WITNESS_JOURNAL_RDF_AGENT\s*=\s*"https:\/\/witness-journal-rdf-services-a2d7mjqbfa-uc\.a\.run\.app\/\.well-known\/agent-card\.json"/u.test(market)) throw new Error("Codex inference market does not use the reachable admitted WitnessJournal RDF Services Agent Card");
  return path;
}

export function projectCodexUserHarness({ target, configRoot, check = false } = {}) {
  if (typeof target !== "string" || target.length === 0) throw new TypeError("target path is required");
  target = resolve(target);
  configRoot = resolve(configRoot ?? target);
  const expected = projections(target);
  if (check) {
    const stale = [...expected].filter(([path, content]) => !existsSync(path) || readFileSync(path, "utf8") !== content).map(([path]) => path);
    if (stale.length) throw new Error(`Codex user harness is stale or missing: ${stale.join(", ")}`);
    const config = validateConfig(configRoot);
    return Object.freeze({ actor: "urn:ame:bare-cedar-fog-codex", disposition: "user-harness-current", target, files: [...expected.keys()], config });
  }
  for (const [path, content] of expected) {
    mkdirSync(dirname(path), { recursive: true });
    if (existsSync(path) && readFileSync(path, "utf8") === content) continue;
    const temporary = `${path}.${process.pid}.tmp`;
    writeFileSync(temporary, content, { mode: 0o600 });
    renameSync(temporary, path);
  }
  return Object.freeze({ actor: "urn:ame:bare-cedar-fog-codex", disposition: "user-harness-projected", target, files: [...expected.keys()] });
}

function parse(argv) {
  let target, configRoot, check = false;
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--check") check = true;
    else if (argv[index] === "--config-root") {
      if (!argv[index + 1]) throw new TypeError("--config-root requires one directory");
      configRoot = argv[index += 1];
    }
    else if (argv[index] === "--target") {
      if (!argv[index + 1]) throw new TypeError("--target requires one destination path");
      target = argv[index += 1];
    }
    else throw new TypeError(`unknown argument ${argv[index]}`);
  }
  if (target === undefined) throw new TypeError("--target requires one destination path");
  return { target, configRoot, check };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try { process.stdout.write(`${JSON.stringify(projectCodexUserHarness(parse(process.argv.slice(2))), null, 2)}\n`); }
  catch (error) { process.stderr.write(`project-codex-user-harness: ${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 1; }
}
