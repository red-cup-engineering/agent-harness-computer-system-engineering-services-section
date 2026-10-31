import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { projectCodexUserHarness } from "../scripts/project-codex-user-harness.mjs";

function scratch() {
  const target = mkdtempSync(join(tmpdir(), "codex-user-harness-"));
  mkdirSync(join(target, ".codex"), { recursive: true });
  writeFileSync(join(target, ".codex/config.toml"), ["[mcp_servers.codex_enterprise]", "enabled = false", "enabled_tools = [\"observe_github_software_induction_readiness\", \"github_software_induction\"]", "[mcp_servers.codex_mape_office]", "enabled = false", "[mcp_servers.inference_work_market]", "enabled = true", "env = { EXPECTED_RESOLUTION_PRICE_URL = \"http://127.0.0.1:8800/\", WITNESS_JOURNAL_RDF_AGENT = \"https://witness-journal-rdf-services-a2d7mjqbfa-uc.a.run.app/.well-known/agent-card.json\" }", "[mcp_servers.notebooklm_workspace_market]", "enabled = false", "[mcp_servers.notebooklm_knowledge_library]", "enabled = false", "[mcp_servers.officer_repertoire_market]", "enabled = true", "[mcp_servers.semioverse]", "enabled = false", "[mcp_servers.codex_private_mud]", "enabled = false", ""].join("\n"));
  return target;
}

test("a separate project config root verifies the layered user harness", () => {
  const target = scratch();
  const configRoot = scratch();
  projectCodexUserHarness({ target });
  writeFileSync(join(target, ".codex/config.toml"), "user_only = true\n");
  const checked = projectCodexUserHarness({ target, configRoot, check: true });
  assert.equal(checked.disposition, "user-harness-current");
  assert.equal(checked.config, join(configRoot, ".codex/config.toml"));
});

test("the API and CLI refuse to infer a user home destination", () => {
  assert.throws(() => projectCodexUserHarness(), /target path is required/u);
  const script = new URL("../scripts/project-codex-user-harness.mjs", import.meta.url);
  const result = spawnSync(process.execPath, [script.pathname], { encoding: "utf8" });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /--target requires one destination path/u);
});

test("an explicit scratch destination receives the harness", () => {
  const target = scratch();
  projectCodexUserHarness({ target });
  assert.equal(projectCodexUserHarness({ target, check: true }).disposition, "user-harness-current");
  // AGENTS.md is no longer projected: it was hand-authored policy prose with
  // no generator behind it, and carried the self-authorization language this
  // harness now refuses to restore. Confirm this projector no longer writes it.
  assert.equal(existsSync(join(target, ".codex/AGENTS.md")), false);
  assert.equal(existsSync(join(target, ".codex/skills")), false);
  assert.deepEqual(JSON.parse(readFileSync(join(target, ".codex/hooks.json"), "utf8")).hooks, {});
  writeFileSync(join(target, ".codex/hooks.json"), "drift\n");
  assert.throws(() => projectCodexUserHarness({ target, check: true }), /stale or missing/u);
});
