import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { decodeToml } from "@red-cup-engineering/toml-codec-service";
import { admitAgentHarnessPolicy, driftOfAgentHarness, projectAgentHarness, referencedSources } from "../src/index.mjs";
import { observeAgentHarnessSources } from "../scripts/observe-agent-harness-sources.mjs";
import { observeAgentHarnessSurface } from "../scripts/observe-agent-harness-surface.mjs";
import { writeAgentHarnessProjection } from "../scripts/write-agent-harness-projection.mjs";
import { projectAgentHarnessFromPolicyFile } from "../apps/project-agent-harness.mjs";

const ACTOR = "actor:test-harness-actor";

function repository() {
  const root = mkdtempSync(join(tmpdir(), "agent-harness-"));
  const write = (path, text) => { mkdirSync(join(root, path, ".."), { recursive: true }); writeFileSync(join(root, path), text); };
  write("content/root-instructions.md", "# Root instructions\n\nWork from the core outward.\n");
  write("hooks/observe.mjs", "export {};\n");
  write("servers/serve.mjs", "export {};\n");
  write("skills/use-git/SKILL.md", "---\nname: use-git\n---\n\nRoute git through the house operator.\n");
  write("skills/use-git/scripts/observe.mjs", "export {};\n");
  write("offices/steward.json", JSON.stringify({ id: "steward", name: "steward", kind: "office", "normative-structure": "The steward keeps the shelves. It answers to the Founder.", "deontic-profile": { "keeping-shelves": "duty" }, "bears-duty": ["emsenn/duty/keeping-shelves"], "provides-skill": ["use-git"] }));
  write("characters/steward-session.json", JSON.stringify({ id: "steward-session", kind: "session", name: "Steward session" }));
  write("incumbencies/steward-session-as-steward.json", JSON.stringify({ id: "steward-session-as-steward", office: "steward", holder: "steward-session", recognition: "t", induction: "t" }));
  return root;
}

function policy(runtime, overrides = {}) {
  return {
    kind: "agent-harness-policy",
    version: 1,
    actor: ACTOR,
    runtime,
    instructions: { source: "content/root-instructions.md" },
    settings: runtime === "codex" ? { model: "gpt-5.6-sol", approval_policy: "on-request" } : { model: "sonnet" },
    features: runtime === "codex" ? { hooks: true } : {},
    mcpServers: {
      local_server: { transport: "stdio", script: "servers/serve.mjs", arguments: ["mcp"], environment: { K: "v", ROOTED: "{{root}}/data" }, enabledTools: ["search"], startupTimeoutSeconds: 10 },
      remote_server: { transport: "http", url: "http://127.0.0.1:18808/mcp" },
    },
    hooks: [
      { id: "observe-start", event: "SessionStart", matcher: "startup|resume", handler: "hooks/observe.mjs", timeout: 5 },
      { id: "observe-stop", event: "Stop", handler: "hooks/observe.mjs", timeout: 5, statusMessage: "Observing" },
    ],
    environment: { AGENT_HARNESS_POLICY: "{{root}}/policy.json" },
    skills: ["skills/use-git"],
    rootRole: { id: "steward", office: "offices/steward.json", character: "characters/steward-session.json", incumbency: "incumbencies/steward-session-as-steward.json" },
    roles: [{ id: "steward", office: "offices/steward.json", character: "characters/steward-session.json", incumbency: "incumbencies/steward-session-as-steward.json" }],
    ...overrides,
  };
}

test("policy admission is the schema: a well-formed policy is admitted and a path that escapes the repository is refused", () => {
  assert.equal(admitAgentHarnessPolicy(policy("codex")).ok, true);
  const escaped = admitAgentHarnessPolicy(policy("codex", { instructions: { source: "../outside.md" } }));
  assert.equal(escaped.ok, false);
  assert.equal(escaped.refusal.code, "policy-not-admitted");
  const machinePath = admitAgentHarnessPolicy(policy("codex", { hooks: [{ id: "x", event: "Stop", handler: "/home/someone/hook.mjs", timeout: 5 }] }));
  assert.equal(machinePath.ok, false);
});

test("referenced sources are exactly the paths the policy names, with the kind and need each requires", () => {
  const references = referencedSources(policy("codex"));
  assert.deepEqual(references.map((entry) => [entry.path, entry.kind, entry.need]), [
    ["characters/steward-session.json", "file", "text"],
    ["content/root-instructions.md", "file", "text"],
    ["hooks/observe.mjs", "file", "presence"],
    ["incumbencies/steward-session-as-steward.json", "file", "text"],
    ["offices/steward.json", "file", "text"],
    ["servers/serve.mjs", "file", "presence"],
    ["skills/use-git", "directory", "tree"],
  ]);
});

test("the Codex projection is deterministic, writes only Codex's surface, and its config decodes as the declared tables", async () => {
  const root = repository();
  const sources = await observeAgentHarnessSources({ policy: policy("codex"), root });
  assert.equal(sources.ok, true, JSON.stringify(sources));
  const first = projectAgentHarness({ policy: policy("codex"), sources: sources.value });
  const second = projectAgentHarness({ policy: policy("codex"), sources: sources.value });
  assert.equal(first.ok, true, JSON.stringify(first));
  assert.equal(first.value.identity, second.value.identity);
  assert.deepEqual(first.value.files.map((file) => file.path), [
    ".agents/skills/use-git/SKILL.md",
    ".agents/skills/use-git/scripts/observe.mjs",
    ".codex/agent-harness-manifest.json",
    ".codex/agents/steward.toml",
    ".codex/config.toml",
    ".codex/hooks.json",
    "AGENTS.md",
  ]);
  const config = decodeToml(first.value.files.find((file) => file.path === ".codex/config.toml").text);
  assert.equal(config.model, "gpt-5.6-sol");
  assert.deepEqual(config.shell_environment_policy, { set: { AGENT_HARNESS_POLICY: `${root}/policy.json` } });
  assert.deepEqual(config.features, { hooks: true });
  assert.deepEqual(config.mcp_servers.local_server.args, [`${root}/servers/serve.mjs`, "mcp"]);
  assert.deepEqual(config.mcp_servers.local_server.env, { K: "v", ROOTED: `${root}/data` });
  assert.equal(config.mcp_servers.remote_server.url, "http://127.0.0.1:18808/mcp");
  const hooks = JSON.parse(first.value.files.find((file) => file.path === ".codex/hooks.json").text);
  assert.equal(hooks.hooks.SessionStart[0].matcher, "startup|resume");
  assert.equal(hooks.hooks.SessionStart[0].hooks[0].command, `node ${root}/hooks/observe.mjs --expected-event SessionStart`);
  assert.equal(hooks.hooks.Stop[0].hooks[0].statusMessage, "Observing");
  const role = decodeToml(first.value.files.find((file) => file.path === ".codex/agents/steward.toml").text);
  assert.equal(role.name, "steward");
  assert.match(role.developer_instructions, /### use-git/u);
  assert.equal(first.value.files.find((file) => file.path === "AGENTS.md").text, "# Root instructions\n\nWork from the core outward.\n");
});

test("the Claude projection renders the same policy onto Claude's surface", async () => {
  const root = repository();
  const sources = await observeAgentHarnessSources({ policy: policy("claude"), root });
  const projection = projectAgentHarness({ policy: policy("claude"), sources: sources.value });
  assert.equal(projection.ok, true, JSON.stringify(projection));
  assert.deepEqual(projection.value.files.map((file) => file.path), [
    ".claude/agent-harness-manifest.json",
    ".claude/agents/steward.md",
    ".claude/settings.json",
    ".claude/skills/use-git/SKILL.md",
    ".claude/skills/use-git/scripts/observe.mjs",
    ".mcp.json",
    "CLAUDE.md",
  ]);
  const settings = JSON.parse(projection.value.files.find((file) => file.path === ".claude/settings.json").text);
  assert.equal(settings.model, "sonnet");
  assert.deepEqual(settings.env, { AGENT_HARNESS_POLICY: `${root}/policy.json` });
  assert.equal(settings.hooks.Stop[0].hooks[0].command, 'node "$CLAUDE_PROJECT_DIR"/hooks/observe.mjs --expected-event Stop');
  const mcp = JSON.parse(projection.value.files.find((file) => file.path === ".mcp.json").text);
  assert.equal(mcp.mcpServers.local_server.type, "stdio");
  assert.equal(mcp.mcpServers.remote_server.type, "http");
  assert.match(projection.value.files.find((file) => file.path === ".claude/agents/steward.md").text, /^---\nname: steward\n/u);
});

test("a runtime refuses settings it does not read", async () => {
  const root = repository();
  const wrong = policy("claude", { settings: { approval_policy: "never" } });
  const sources = await observeAgentHarnessSources({ policy: wrong, root });
  const projection = projectAgentHarness({ policy: wrong, sources: sources.value });
  assert.equal(projection.ok, false);
  assert.equal(projection.refusal.code, "setting-unsupported");
});

test("a hook handler or MCP script that does not exist refuses the projection before any file is rendered", async () => {
  const root = repository();
  const missing = policy("codex", { hooks: [{ id: "gone", event: "Stop", handler: "hooks/gone.mjs", timeout: 5 }] });
  const sources = await observeAgentHarnessSources({ policy: missing, root });
  assert.equal(sources.ok, true);
  const projection = projectAgentHarness({ policy: missing, sources: sources.value });
  assert.equal(projection.ok, false);
  assert.equal(projection.refusal.code, "source-absent");
  assert.equal(projection.refusal.details.path, "hooks/gone.mjs");
});

test("a role whose incumbency is not doubly settled, or whose character is not the holder, is refused; the root role is verified the same way and never projected", async () => {
  const root = repository();
  const rootOnly = policy("codex", { roles: [] });
  const sources = await observeAgentHarnessSources({ policy: rootOnly, root });
  const projection = projectAgentHarness({ policy: rootOnly, sources: sources.value });
  assert.equal(projection.ok, true, JSON.stringify(projection));
  assert.equal(projection.value.files.some((file) => file.path.startsWith(".codex/agents/")), false);
  writeFileSync(join(root, "incumbencies/steward-session-as-steward.json"), JSON.stringify({ id: "x", office: "steward", holder: "steward-session", recognition: "t", induction: "bottom" }));
  const broken = await observeAgentHarnessSources({ policy: rootOnly, root });
  const refused = projectAgentHarness({ policy: rootOnly, sources: broken.value });
  assert.equal(refused.ok, false);
  assert.equal(refused.refusal.code, "role-seating-refused");
});

test("writing returns the engine's receipt, the surface then agrees, an edit is drift, and a re-projection prunes what it no longer owns", async () => {
  const root = repository();
  const sources = await observeAgentHarnessSources({ policy: policy("codex"), root });
  const projection = projectAgentHarness({ policy: policy("codex"), sources: sources.value });
  const receipt = await writeAgentHarnessProjection({ projection: projection.value, now: "2026-09-12T00:00:00.000Z" });
  assert.equal(receipt.ok, true, JSON.stringify(receipt));
  assert.equal(receipt.value.kind, "receipt");
  assert.equal(receipt.value.receiver, ACTOR);
  assert.equal(receipt.value.evidence.content.written.length, 7);
  assert.equal(existsSync(join(root, ".codex/config.toml")), true);
  const paths = projection.value.files.map((file) => file.path);
  const agreeing = driftOfAgentHarness({ projection: projection.value, observation: (await observeAgentHarnessSurface({ root, paths })).value });
  assert.equal(agreeing.ok, true, JSON.stringify(agreeing));
  writeFileSync(join(root, ".codex/config.toml"), "model = \"edited\"\n");
  const drifted = driftOfAgentHarness({ projection: projection.value, observation: (await observeAgentHarnessSurface({ root, paths })).value });
  assert.equal(drifted.ok, false);
  assert.deepEqual(drifted.refusal.details, { missing: [], differing: [".codex/config.toml"] });
  const smaller = policy("codex", { roles: [] });
  const smallerSources = await observeAgentHarnessSources({ policy: smaller, root });
  const smallerProjection = projectAgentHarness({ policy: smaller, sources: smallerSources.value });
  const manifest = JSON.parse(readFileSync(join(root, ".codex/agent-harness-manifest.json"), "utf8"));
  const pruned = await writeAgentHarnessProjection({ projection: smallerProjection.value, previousManifest: manifest });
  assert.equal(pruned.ok, true);
  assert.deepEqual(pruned.value.evidence.content.removed, [".codex/agents/steward.toml"]);
  assert.equal(existsSync(join(root, ".codex/agents/steward.toml")), false);
});

test("the composition app projects from a policy file and then checks it clean", async () => {
  const root = repository();
  writeFileSync(join(root, "policy.json"), JSON.stringify(policy("claude")));
  const written = await projectAgentHarnessFromPolicyFile({ policyPath: join(root, "policy.json"), root });
  assert.equal(written.ok, true, JSON.stringify(written));
  const checked = await projectAgentHarnessFromPolicyFile({ policyPath: join(root, "policy.json"), root, check: true });
  assert.equal(checked.ok, true, JSON.stringify(checked));
  assert.equal(checked.value.kind, "agent-harness-agreement");
});

test("MCP-only projection loads environment files and preserves user settings, hooks, instructions and unrelated servers", async () => {
  for (const runtime of ["codex", "claude"]) {
    const root = repository();
    const candidate = policy(runtime, { mcpServers: { inference: { transport: "stdio", script: "servers/serve.mjs", environmentFile: ".env", environment: { OWNER: "{{root}}" } } } });
    writeFileSync(join(root, ".env"), "SECRET=fixture-only\n");
    writeFileSync(join(root, "policy.json"), JSON.stringify(candidate));
    const configPath = runtime === "codex" ? ".codex/config.toml" : ".mcp.json";
    mkdirSync(join(root, ".codex"), { recursive: true });
    writeFileSync(join(root, configPath), runtime === "codex" ? 'model = "user-model"\n[mcp_servers.unrelated]\nurl = "http://localhost/other"\n[features]\nhooks = false\n' : JSON.stringify({ custom: true, mcpServers: { unrelated: { type: "http", url: "http://localhost/other" } } }));
    const instruction = runtime === "codex" ? "AGENTS.md" : "CLAUDE.md";
    writeFileSync(join(root, instruction), "User instructions remain.\n");
    const outcome = await projectAgentHarnessFromPolicyFile({ root, policyPath: join(root, "policy.json"), component: "mcp" });
    assert.equal(outcome.ok, true, JSON.stringify(outcome));
    const text = readFileSync(join(root, configPath), "utf8");
    assert.doesNotMatch(text, /fixture-only/);
    const data = runtime === "codex" ? decodeToml(text) : JSON.parse(text);
    const servers = data[runtime === "codex" ? "mcp_servers" : "mcpServers"];
    assert.equal(servers.unrelated.url, "http://localhost/other");
    assert.deepEqual(servers.inference.args, [`--env-file=${root}/.env`, `${root}/servers/serve.mjs`]);
    assert.equal(servers.inference.env.OWNER, root);
    if (runtime === "codex") { assert.equal(data.model, "user-model"); assert.equal(data.features.hooks, false); }
    else assert.equal(data.custom, true);
    assert.equal(readFileSync(join(root, instruction), "utf8"), "User instructions remain.\n");
    assert.equal((await projectAgentHarnessFromPolicyFile({ root, policyPath: join(root, "policy.json"), component: "mcp", check: true })).ok, true);
    candidate.mcpServers.inference.environmentFile = "servers";
    writeFileSync(join(root, "policy.json"), JSON.stringify(candidate));
    assert.equal((await projectAgentHarnessFromPolicyFile({ root, policyPath: join(root, "policy.json"), component: "mcp" })).ok, false);
    assert.equal(readFileSync(join(root, configPath), "utf8"), text);
  }
});
