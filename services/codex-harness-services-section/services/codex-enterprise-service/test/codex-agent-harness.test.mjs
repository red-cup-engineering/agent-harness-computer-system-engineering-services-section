import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { assertMcpReachability, checkInstalledHarnessStatic, colleagueIds, installHarness, loadPolicy, renderConfig } from "../scripts/project-codex-agent-harness.mjs";

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
// Root is identified by the workspace root package.json's own name, not by a
// hand-authored doc's presence (AGENTS.md was removed as unowned prose).
function isRepoRootDirectory(dir) {
  const path = join(dir, "package.json");
  if (!existsSync(path)) return false;
  try { return JSON.parse(readFileSync(path, "utf8")).name === "@bare-cedar-fog/machine-workspace"; }
  catch { return false; }
}
function repositoryRootFromPackage() {
  let current = PACKAGE_ROOT;
  while (true) {
    if (isRepoRootDirectory(current) && existsSync(join(current, "lib/emsenn"))) return current;
    const parent = dirname(current);
    if (parent === current) throw new Error("cannot resolve repository root (package.json name @bare-cedar-fog/machine-workspace with lib/emsenn)");
    current = parent;
  }
}
const REPO_ROOT = repositoryRootFromPackage();

test("the default harness exposes only bounded procurement and repertoire tools", () => {
  const policy = loadPolicy();
  const enabled = Object.entries(policy.mcpServers).filter(([, server]) => server.enabled).map(([name]) => name).sort();
  assert.deepEqual(enabled, ["inference_work_market", "officer_repertoire_market"]);
  assert.equal(enabled.reduce((count, name) => count + policy.mcpServers[name].enabledTools.length, 0), 4);
  assert.equal(policy.features.hooks, false);
});

test("a clean node receives the exact cheaper Union colleague harness", { skip: process.env.CODEX_FULL_HARNESS_ASSAY !== "1" && "full office regeneration belongs to the explicit harness assay" }, () => {
  const target = mkdtempSync(join(tmpdir(), "bare-cedar-fog-codex-harness-"));
  try {
    const result = installHarness({ repoRoot: REPO_ROOT, target });
    assert.equal(result.actor, "urn:ame:bare-cedar-fog-codex");
    assert.deepEqual(JSON.parse(readFileSync(join(target, ".codex/actor.json"), "utf8")), loadPolicy().actorRecord);
    assert.deepEqual(JSON.parse(readFileSync(join(target, ".codex/incumbencies.json"), "utf8")).offices, loadPolicy().incumbencies);
    assert.deepEqual(result.colleagues, colleagueIds(loadPolicy()));
    assert.equal(result.colleagues.includes("executive-officer-to-the-leader"), false);
    const config = readFileSync(join(target, ".codex/config.toml"), "utf8");
    assert.match(config, /^approval_policy = "never"/mu);
    assert.match(config, /^sandbox_mode = "danger-full-access"/mu);
    assert.doesNotMatch(config, /^model_reasoning_effort\s*=/mu);
    assert.match(config, /\[agents\][\s\S]*enabled = true/u);
    assert.doesNotMatch(config, /default_subagent_model|default_subagent_reasoning_effort/u);
    assert.match(config, /max_concurrent_threads_per_session = 3/u);
    assert.match(config, /\[features\][\s\S]*hooks = false/u);
    assert.match(config, /\[mcp_servers\.codex_enterprise\][\s\S]*enabled = false/u);
    assert.match(config, /\[mcp_servers\.inference_work_market\][\s\S]*enabled = true/u);
    assert.match(config, /\[mcp_servers\.codex_mape_office\]/u);
    assert.match(config, /\[mcp_servers\.codex_mape_office\][\s\S]*enabled = false/u);
    assert.match(config, /compile_codex_mape_cycle/u);
    assert.match(config, /observe_github_software_induction_readiness/u);
    assert.match(config, /github_software_induction/u);
    assert.match(config, /\[mcp_servers\.notebooklm_workspace_market\]/u);
    assert.match(config, /\[mcp_servers\.notebooklm_workspace_market\][\s\S]*enabled = false/u);
    assert.match(config, /ask_notebooklm_workspace/u);
    assert.match(config, /\[mcp_servers\.notebooklm_knowledge_library\][\s\S]*enabled = false/u);
    assert.match(config, /ask_live_notebooklm_notebook/u);
    assert.match(config, /\[mcp_servers\.officer_repertoire_market\][\s\S]*enabled = true/u);
    assert.match(config, /shop_office_repertoire/u);
    assert.match(config, /\[mcp_servers\.semioverse\][\s\S]*enabled = false/u);
    assert.match(config, /observe_uftn_entry/u);
    assert.match(config, /observe_uftn_cloud_run_actuator/u);
    assert.match(config, /exchange_with_union_actor/u);
    assert.match(config, /GCLOUD_CLOUD_RUN_ACTUATOR_TOKEN_FILE/u);
    assert.match(config, /\[mcp_servers\.codex_private_mud\][\s\S]*enabled = false/u);
    assert.match(config, /discover_modeled_union_network/u);
    assert.match(config, /observe_active_codex_goal/u);
    assert.match(config, /admit_codex_goal_observation/u);
    assert.match(config, /induce_repository_normalization_moves/u);
    assert.match(config, /\[mcp_servers\.union_reaction_network\][\s\S]*enabled = false/u);
    assert.match(config, /observe_union_reaction_network/u);
    assert.match(config, /discover_public_sources/u);
    assert.doesNotMatch(config, /route_codex_work/u);
    // Root AGENTS.md is gone (removed as unowned prose, no generator behind
    // it); it used to be where assertProjectInstructions checked for
    // policy.spawnContract. That check (project-codex-agent-harness.mjs,
    // assertProjectInstructions) is unresolved, not deleted here: it now
    // deterministically throws "AGENTS.md is missing the native spawn
    // contract" whenever installHarness/checkInstalledHarnessStatic runs,
    // because the spawn contract has no documented home any more. Needs an
    // owner call on where (if anywhere) that policy text should live before
    // this assertion can be restored.
    for (const id of result.colleagues) {
      const agent = readFileSync(join(target, ".codex/agents", `${id}.toml`), "utf8");
      assert.match(agent, new RegExp(`name = "${id}"`, "u"));
      assert.doesNotMatch(agent, /^model(?:_reasoning_effort)?\s*=/mu);
      assert.match(agent, /discover_modeled_union_network/u);
      assert.match(agent, /observe_active_codex_goal/u);
      assert.match(agent, /measured fallback/u);
    }
    assert.equal(existsSync(join(target, ".codex/agents/executive-officer-to-the-leader.toml")), false);
    assert.equal(existsSync(join(target, ".codex/agents/white-army.toml")), true);
    assert.equal(checkInstalledHarnessStatic({ repoRoot: REPO_ROOT, target }).disposition, "static-projection-current");
  } finally {
    rmSync(target, { recursive: true, force: true });
  }
});

test("the harness refuses an enabled MCP boundary that does not advertise its promised tool", () => {
  const root = mkdtempSync(join(tmpdir(), "bare-cedar-fog-codex-dead-mcp-"));
  try {
    writeFileSync(join(root, "dead.mjs"), `process.stdin.resume(); process.stdin.on("end", () => process.stdout.write('{"jsonrpc":"2.0","id":1,"result":{"tools":[]}}\\n'));\n`);
    assert.throws(() => assertMcpReachability(root, {
      mcpServers: {
        dead: { enabled: true, script: "dead.mjs", cwd: ".", startupTimeoutSeconds: 1, enabledTools: ["promised_tool"] },
      },
    }), /does not advertise enabled tools: promised_tool/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});


test("server-specific arguments survive config projection and live MCP reachability", () => {
  const policy = loadPolicy();
  const config = renderConfig(REPO_ROOT, policy, "/exact/node");
  assert.match(
    config,
    /args = \["[^"]+\/network-mcp\.mjs", "--actor", "codex", "--actor-urn", "urn:ame:bare-cedar-fog-codex"\]/u,
  );

  const root = mkdtempSync(join(tmpdir(), "bare-cedar-fog-codex-argument-mcp-"));
  try {
    writeFileSync(join(root, "argument.mjs"), `if (process.argv.slice(2).join(" ") !== "--actor codex --actor-urn urn:ame:bare-cedar-fog-codex") process.exit(9);
process.stdin.resume();
process.stdin.on("end", () => process.stdout.write('{"jsonrpc":"2.0","id":1,"result":{"tools":[{"name":"observe_actor"}]}}\\n'));
`);
    assert.doesNotThrow(() => assertMcpReachability(root, {
      mcpServers: {
        argument: {
          enabled: true,
          script: "argument.mjs",
          arguments: ["--actor", "codex", "--actor-urn", "urn:ame:bare-cedar-fog-codex"],
          cwd: ".",
          startupTimeoutSeconds: 1,
          enabledTools: ["observe_actor"],
        },
      },
    }));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
