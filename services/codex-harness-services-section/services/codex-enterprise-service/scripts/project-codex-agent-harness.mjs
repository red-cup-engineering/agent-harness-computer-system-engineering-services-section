#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const DATA_ROOT = resolve(process.env.CODEX_ENTERPRISE_DATA_ROOT ?? process.cwd()); // section data repo checkout (agents/, data/)

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const POLICY_PATH = join(DATA_ROOT, "agents/harness/codex-agent-harness.json");
const PROJECTOR_RELATIVE = "lib/emsenn/services/561-group/services/board-of-directors/services/executive-office/lib/management/skills/install-codex-as-an-agent.js";
const REQUIRED_CODEX_ENTERPRISE_TOOLS = ["observe_github_software_induction_readiness", "github_software_induction"];
const STARTUP_MCP_SERVERS = new Set(["inference_work_market", "officer_repertoire_market"]);

function quote(value) { return JSON.stringify(value); }
function requireDirectory(path, label) {
  if (!existsSync(path) || !statSync(path).isDirectory()) throw new Error(`${label} is not a directory: ${path}`);
}
function arg(name) {
  const at = process.argv.indexOf(name);
  return at === -1 ? undefined : process.argv[at + 1];
}
function repoRootFromPackage() {
  let current = PACKAGE_ROOT;
  while (true) {
    if (existsSync(join(current, PROJECTOR_RELATIVE))) return current;
    const parent = dirname(current);
    if (parent === current) throw new Error(`cannot resolve repository root containing ${PROJECTOR_RELATIVE}`);
    current = parent;
  }
}

export function loadPolicy() {
  const policy = JSON.parse(readFileSync(POLICY_PATH, "utf8"));
  if (policy.actor !== "urn:ame:bare-cedar-fog-codex") throw new Error("harness policy must belong to the stable Bare Cedar Fog Codex Actor");
  if (policy.actorRecord?.id !== policy.actor || policy.actorRecord?.kind !== "union.civilian-actor") throw new Error("harness policy must project the stable Bare Cedar Fog Codex Actor record");
  if (!Array.isArray(policy.incumbencies) || !["executive-officer-to-the-leader", "white-army"].every((office) => policy.incumbencies.some((item) => item.office === office && item.status === "active"))) throw new Error("harness policy must project the Executive Officer and white-army incumbencies");
  if (policy.rootOffice !== "executive-officer-to-the-leader") throw new Error("harness policy must retain the recognized Executive Officer as root");
  if (!Array.isArray(policy.colleagueOffices) || policy.colleagueOffices.length === 0) throw new Error("harness policy requires an exact nonempty colleague roster");
  if (typeof policy.spawnContract !== "string" || policy.spawnContract.length === 0) throw new Error("harness policy requires the native spawn contract");
  if (policy.features?.hooks !== false) throw new Error("the cheap harness must leave lifecycle receipt hooks disabled by default");
  if (!Number.isSafeInteger(policy.agents?.maximumConcurrentThreadsPerSession) || policy.agents.maximumConcurrentThreadsPerSession < 1) throw new Error("harness policy requires a bounded positive subagent concurrency");
  if (policy.agents?.selection !== "live-signed-offers-through-route-decision" || policy.agents?.defaultForkTurns !== "none" || policy.agents?.reuseStableEndpoints !== true) throw new Error("harness policy requires endpoint-neutral offer selection, prompt-only forks, and stable endpoint reuse");
  for (const name of ["codex_enterprise", "inference_work_market", "codex_mape_office", "notebooklm_workspace_market", "notebooklm_knowledge_library", "officer_repertoire_market", "semioverse", "codex_private_mud", "union_reaction_network"]) {
    const server = policy.mcpServers?.[name];
    if (typeof server?.enabled !== "boolean") throw new Error(`harness policy must state whether ${name} loads at startup`);
    if (!server.script || !server.cwd || !Array.isArray(server.enabledTools) || server.enabledTools.length === 0) throw new Error(`harness policy has an incomplete ${name} boundary`);
    if (server.enabled !== STARTUP_MCP_SERVERS.has(name)) throw new Error(`harness policy has the wrong startup disposition for ${name}`);
  }
  for (const tool of REQUIRED_CODEX_ENTERPRISE_TOOLS) if (!policy.mcpServers.codex_enterprise.enabledTools.includes(tool)) throw new Error(`harness policy must enable ${tool}`);
  return Object.freeze(policy);
}

function assertExecutableBoundaries(repoRoot, policy) {
  for (const [name, server] of Object.entries(policy.mcpServers)) {
    const script = join(repoRoot, server.script);
    const cwd = join(repoRoot, server.cwd);
    if (!existsSync(script) || !statSync(script).isFile()) throw new Error(`MCP server ${name} script is missing: ${script}`);
    requireDirectory(cwd, `MCP server ${name} cwd`);
  }
}

export function assertMcpReachability(repoRoot, policy) {
  const request = `${JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} })}\n`;
  for (const [name, server] of Object.entries(policy.mcpServers)) {
    if (server.enabled !== true) continue;
    const result = spawnSync(process.execPath, [join(repoRoot, server.script), ...(server.arguments ?? [])], {
      cwd: join(repoRoot, server.cwd),
      input: request,
      encoding: "utf8",
      env: { ...process.env, ...(server.environment ?? {}) },
      timeout: (server.startupTimeoutSeconds ?? 10) * 1000,
    });
    if (result.status !== 0) throw new Error(`MCP server ${name} failed its tools/list handshake: ${result.stderr || result.stdout || `exit ${result.status}`}`);
    let response;
    try { response = JSON.parse(result.stdout); }
    catch { throw new Error(`MCP server ${name} returned a non-JSON tools/list response`); }
    const tools = response.result?.tools ?? response.result?.structuredContent?.tools;
    if (!Array.isArray(tools)) throw new Error(`MCP server ${name} returned no tools list`);
    const observed = new Set(tools.map((tool) => tool.name));
    const missing = server.enabledTools.filter((tool) => !observed.has(tool));
    if (missing.length) throw new Error(`MCP server ${name} does not advertise enabled tools: ${missing.join(", ")}`);
  }
}

function assertProjectInstructions(repoRoot, policy) {
  const instructions = join(repoRoot, "AGENTS.md");
  const normalizedInstructions = existsSync(instructions) ? readFileSync(instructions, "utf8").replace(/\s+/gu, " ").trim() : "";
  const normalizedContract = policy.spawnContract.replace(/\s+/gu, " ").trim();
  if (!normalizedInstructions.includes(normalizedContract)) {
    throw new Error(`AGENTS.md is missing the native spawn contract: ${policy.spawnContract}`);
  }
}

export function colleagueIds(policy = loadPolicy()) {
  return policy.colleagueOffices.map((office) => office.split("/").at(-1).replace(/\.json$/u, ""));
}

export function renderConfig(repoRoot, policy = loadPolicy(), nodeExecutable = process.execPath) {
  const lines = [
    `approval_policy = "never"`,
    `sandbox_mode = "danger-full-access"`,
    `web_search = "disabled"`,
    "",
    "[features]",
    ...Object.entries(policy.features).map(([name, enabled]) => `${name} = ${enabled}`),
    "",
    "[agents]",
    `enabled = ${policy.agents.enabled}`,
    `max_concurrent_threads_per_session = ${policy.agents.maximumConcurrentThreadsPerSession}`,
    `interrupt_message = ${policy.agents.interruptMessage}`,
  ];
  for (const [name, server] of Object.entries(policy.mcpServers)) {
    lines.push(
      "",
      `[mcp_servers.${name}]`,
      `command = ${quote(nodeExecutable)}`,
      `args = [${[join(repoRoot, server.script), ...(server.arguments ?? [])].map(quote).join(", ")}]`,
      `cwd = ${quote(join(repoRoot, server.cwd))}`,
      `enabled = ${server.enabled === true}`,
      "required = false",
    );
    if (server.startupTimeoutSeconds !== undefined) lines.push(`startup_timeout_sec = ${server.startupTimeoutSeconds}`);
    if (server.toolTimeoutSeconds !== undefined) lines.push(`tool_timeout_sec = ${server.toolTimeoutSeconds}`);
    if (server.environment) lines.push(`env = { ${Object.entries(server.environment).map(([key, value]) => `${key} = ${quote(value)}`).join(", ")} }`);
    lines.push(`enabled_tools = [${server.enabledTools.map(quote).join(", ")}]`);
  }
  return `${lines.join("\n")}\n`;
}

function runOfficeProjector(repoRoot, target, office) {
  const result = spawnSync(process.execPath, [join(repoRoot, PROJECTOR_RELATIVE), join(repoRoot, office), target, "--root", repoRoot], { cwd: repoRoot, encoding: "utf8" });
  if (result.status !== 0) throw new Error(`office projection failed for ${office}: ${result.stderr || result.stdout}`);
  return result.stdout.trim();
}

function assertExactRoster(target, policy) {
  const expected = [...colleagueIds(policy)].sort();
  const manifest = join(target, ".codex/.codex-agent-manifest");
  if (!existsSync(manifest)) throw new Error(`missing canonical agent manifest ${manifest}`);
  const observed = readFileSync(manifest, "utf8").split("\n").filter(Boolean).sort();
  if (JSON.stringify(observed) !== JSON.stringify(expected)) throw new Error(`projected colleague roster differs: expected ${expected.join(", ")}; observed ${observed.join(", ")}`);
  const agentDirectory = join(target, ".codex/agents");
  const files = readdirSync(agentDirectory).filter((name) => name.endsWith(".toml")).map((name) => name.replace(/\.toml$/u, "")).sort();
  if (JSON.stringify(files) !== JSON.stringify(expected)) throw new Error(`projected agent files differ from exact roster: ${files.join(", ")}`);
  if (files.includes(policy.rootOffice)) throw new Error("the root Executive Officer must not be projected as a subordinate colleague");
}

function removeFixedAgentEndpoints(target, policy) {
  for (const id of colleagueIds(policy)) {
    const path = join(target, ".codex/agents", `${id}.toml`);
    const source = readFileSync(path, "utf8");
    const projected = source.replace(/^model(?:_reasoning_effort)?\s*=.*\n/gmu, "");
    writeFileSync(path, projected);
  }
}

export function installHarness({ repoRoot = repoRootFromPackage(), target = repoRoot, live = false } = {}) {
  repoRoot = resolve(repoRoot); target = resolve(target);
  requireDirectory(repoRoot, "repository root"); requireDirectory(target, "target node");
  const policy = loadPolicy();
  assertProjectInstructions(repoRoot, policy);
  assertExecutableBoundaries(repoRoot, policy);
  if (live) assertMcpReachability(repoRoot, policy);
  const codex = join(target, ".codex"); mkdirSync(codex, { recursive: true });
  writeFileSync(join(codex, "config.toml"), renderConfig(repoRoot, policy));
  writeFileSync(join(codex, "actor.json"), `${JSON.stringify(policy.actorRecord, null, 2)}\n`);
  writeFileSync(join(codex, "incumbencies.json"), `${JSON.stringify({ actor: policy.actor, offices: policy.incumbencies }, null, 2)}\n`);
  const receipts = policy.colleagueOffices.map((office) => runOfficeProjector(repoRoot, target, office));
  removeFixedAgentEndpoints(target, policy);
  assertExactRoster(target, policy);
  return Object.freeze({ actor: policy.actor, target, config: join(codex, "config.toml"), colleagues: colleagueIds(policy), receipts });
}

export function checkHarness({ repoRoot = repoRootFromPackage(), target = repoRoot, live = false } = {}) {
  repoRoot = resolve(repoRoot); target = resolve(target);
  requireDirectory(repoRoot, "repository root"); requireDirectory(target, "target node");
  assertProjectInstructions(repoRoot, loadPolicy());
  const scratch = mkdtempSync(join(tmpdir(), "bare-cedar-fog-codex-harness-check-"));
  try {
    const expected = installHarness({ repoRoot, target: scratch, live });
    const relativeFiles = [
      ".codex/config.toml",
      ".codex/actor.json",
      ".codex/incumbencies.json",
      ".codex/.codex-agent-manifest",
      ...expected.colleagues.map((id) => `.codex/agents/${id}.toml`),
    ];
    for (const file of relativeFiles) {
      const actual = join(target, file), projection = join(scratch, file);
      if (!existsSync(actual)) throw new Error(`installed harness output is missing ${actual}`);
      if (readFileSync(actual, "utf8") !== readFileSync(projection, "utf8")) throw new Error(`installed harness output is stale: ${actual}`);
    }
    assertExactRoster(target, loadPolicy());
    return Object.freeze({ actor: expected.actor, target, disposition: "projection-current", files: relativeFiles });
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

export function checkInstalledHarnessStatic({ repoRoot = repoRootFromPackage(), target = repoRoot } = {}) {
  repoRoot = resolve(repoRoot); target = resolve(target);
  requireDirectory(repoRoot, "repository root"); requireDirectory(target, "target node");
  const policy = loadPolicy();
  assertProjectInstructions(repoRoot, policy);
  assertExecutableBoundaries(repoRoot, policy);
  const expected = {
    ".codex/config.toml": renderConfig(repoRoot, policy),
    ".codex/actor.json": `${JSON.stringify(policy.actorRecord, null, 2)}\n`,
    ".codex/incumbencies.json": `${JSON.stringify({ actor: policy.actor, offices: policy.incumbencies }, null, 2)}\n`,
  };
  for (const [file, content] of Object.entries(expected)) {
    const path = join(target, file);
    if (!existsSync(path) || readFileSync(path, "utf8") !== content) throw new Error(`installed harness output is stale: ${path}`);
  }
  assertExactRoster(target, policy);
  for (const id of colleagueIds(policy)) {
    const path = join(target, ".codex/agents", `${id}.toml`), content = readFileSync(path, "utf8");
    if (!content.includes(`name = "${id}"`) || /^model(?:_reasoning_effort)?\s*=/mu.test(content)) throw new Error(`installed agent projection has a fixed endpoint: ${path}`);
  }
  return Object.freeze({ actor: policy.actor, target, disposition: "static-projection-current", files: [...Object.keys(expected), ".codex/.codex-agent-manifest", ...colleagueIds(policy).map((id) => `.codex/agents/${id}.toml`)] });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    const options = { repoRoot: arg("--repo-root"), target: arg("--target"), live: process.argv.includes("--live") };
    const result = process.argv.includes("--static") ? checkInstalledHarnessStatic(options) : process.argv.includes("--check") ? checkHarness(options) : installHarness(options);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`project-codex-agent-harness: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
