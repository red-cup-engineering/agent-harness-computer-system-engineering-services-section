import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { decide, run, hookEntries, hostResourceControl, writeHostResourceControl, launcherScript, sliceUnit, isContained, mergeHostResourceHooks } from "../src/host-resource-hook.mjs";

const source = fileURLToPath(new URL("../src/host-resource-hook.mjs", import.meta.url));
const scratch = t => {
  const root = mkdtempSync(join(dirname(fileURLToPath(import.meta.url)), ".host-resource-control-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
};

test("both actual provider registrations use one owning executable and retain unrelated settings", t => {
  const root = scratch(t);
  mkdirSync(join(root, ".claude")); mkdirSync(join(root, ".codex"));
  const unrelated = { matcher: "Read", hooks: [{ type: "command", command: "echo independent" }] };
  writeFileSync(join(root, ".claude/settings.local.json"), JSON.stringify({ env: { KEEP: "yes" }, permissions: { allow: ["Read"] }, hooks: { Stop: [unrelated], PreToolUse: [unrelated, ...hookEntries(join(root, ".claude/hooks/host-resource-hook.mjs")).PreToolUse] } }));
  writeFileSync(join(root, ".codex/hooks.json"), JSON.stringify({ description: "keep", hooks: { Stop: [unrelated], ...hookEntries(join(root, ".codex/hooks/host-resource-hook.mjs"), { provider: "codex" }) } }));
  const prior = 'model = "owner-model"\n[features]\nhooks = false # keep comment\nmemories = false\n[other]\nvalue = "keep"\n';
  writeFileSync(join(root, ".codex/config.toml"), prior);
  const result = writeHostResourceControl({ node: root });
  assert.equal(result.codexTrustRequired, true); assert.equal(result.activeSessionGuarded, false);
  const claude = JSON.parse(readFileSync(join(root, ".claude/settings.local.json")));
  const codex = JSON.parse(readFileSync(join(root, ".codex/hooks.json")));
  assert.deepEqual(claude.env, { KEEP: "yes" }); assert.deepEqual(claude.permissions, { allow: ["Read"] });
  assert.deepEqual(claude.hooks.Stop, [unrelated]); assert.deepEqual(claude.hooks.PreToolUse[0], unrelated);
  assert.equal(codex.description, "keep"); assert.deepEqual(codex.hooks.Stop, [unrelated]);
  for (const value of [claude, codex]) assert.ok(value.hooks.PreToolUse.at(-1).hooks[0].command.includes(source));
  assert.match(codex.hooks.PreToolUse.at(-1).hooks[0].command, /--provider codex$/);
  assert.equal(readFileSync(join(root, ".codex/config.toml"), "utf8"), prior.replace("hooks = false", "hooks = true"));
  assert.equal(writeHostResourceControl({ node: root }).written.length, 0);
  assert.equal(existsSync(join(root, ".claude/hooks/host-resource-hook.mjs")), false);
  assert.equal(existsSync(join(root, ".codex/hooks/host-resource-hook.mjs")), false);
  const planned = hostResourceControl({ node: root });
  assert.equal(planned.source, source); assert.deepEqual([...planned.files.keys()], [".codex/hooks.json"]);
});

test("copies of the guard from other installs collapse to the one projected entry", () => {
  const unrelated = { matcher: "Bash", hooks: [{ type: "command", command: "node /x/host-resource-hook-audit.mjs" }] };
  const elsewhere = ["/home/a/agent-harness-source/src/host-resource-hook.mjs", "/srv/app/node_modules/.pnpm/h@0.1.2/node_modules/h/src/host-resource-hook.mjs"]
    .flatMap(path => hookEntries(path).PreToolUse);
  const merged = mergeHostResourceHooks({ PreToolUse: [unrelated, ...elsewhere] }, hookEntries(source), "/node");
  assert.deepEqual(merged.PreToolUse, [unrelated, ...hookEntries(source).PreToolUse]);
  assert.deepEqual(mergeHostResourceHooks(merged, hookEntries(source), "/node"), merged);
});

test("invalid configuration refuses projection before any write; no trust is manufactured", t => {
  const root = scratch(t); mkdirSync(join(root, ".codex"));
  const prior = '{"hooks":{}}\n'; writeFileSync(join(root, ".codex/hooks.json"), prior);
  writeFileSync(join(root, ".codex/config.toml"), "[features]\nhooks = false\nhooks = true\n");
  assert.throws(() => writeHostResourceControl({ node: root, providers: ["codex"] }), /duplicate/);
  assert.equal(readFileSync(join(root, ".codex/hooks.json"), "utf8"), prior);
  assert.equal(existsSync(join(root, ".codex/hook-trust.json")), false);
});

test("original deny, provider rewrite, malformed event and containment contracts survive source recovery", t => {
  const root = scratch(t), env = { ...process.env, AGENT_CONTAINMENT: "off" };
  const event = { tool_name: "Bash", cwd: root, tool_input: { command: "find /home" } };
  assert.equal(decide(event, { env }).permissionDecision, "deny");
  assert.equal(decide(event, { env, provider: "codex" }).permissionDecision, "deny");
  assert.equal(decide({ ...event, tool_input: { command: "npm install", description: "keep" } }, { env, provider: "codex" }), undefined);
  assert.equal(run("malformed", { env }), undefined);
  assert.equal(decide({ ...event, tool_input: { command: "echo small" } }, { env }), undefined);
  assert.match(launcherScript(), /--slice=agent-claude.slice/); assert.match(sliceUnit(), /MemorySwapMax=0/);
  assert.equal(isContained("0::/user.slice/agent-claude.slice/agent.scope"), true);
});

test("actual Claude projection keeps the local guard without erasing other hooks", async t => {
  const { projectClaudeHarness, writeClaudeHarness, checkClaudeHarness } = await import("../services/claude-code-harness-services-section/src/claude-harness-projection.mjs");
  const root = scratch(t); const agencyRoot = join(root, "agency"); mkdirSync(agencyRoot); mkdirSync(join(root, ".claude"));
  const independent = { matcher: "Read", hooks: [{ type: "command", command: "echo independent" }] };
  writeFileSync(join(root, ".claude/settings.local.json"), JSON.stringify({ hooks: { Stop: [independent], PreToolUse: [independent] }, custom: "keep" }));
  const projection = projectClaudeHarness({ node: root, agencyRoot, settlementRoot: root });
  assert.equal(projection.counts.events, 1); assert.ok(projection.hooks.PreToolUse[0].hooks[0].command.includes(source));
  writeClaudeHarness(projection);
  const received = JSON.parse(readFileSync(join(root, ".claude/settings.local.json")));
  assert.equal(received.custom, "keep"); assert.deepEqual(received.hooks.Stop, [independent]);
  assert.deepEqual(received.hooks.PreToolUse[0], independent); assert.equal(checkClaudeHarness(projection).current, true);
});


test("actual Codex office CLI projects the configured resource consumer without trusting it", t => {
  const root = scratch(t), agency = join(root, "agency");
  mkdirSync(join(agency, "offices"), { recursive: true }); mkdirSync(join(root, ".codex"));
  writeFileSync(join(agency, "offices/fixture.json"), JSON.stringify({ id: "fixture", name: "Source-only fixture" }));
  const binding = join(root, ".codex/office.json");
  writeFileSync(binding, JSON.stringify({ type: "SourceOfficeContextProjection", authority: "source-context-only", agencyRoot: agency, office: "fixture", target: "../office-context.md", hostResources: { node: "..", providers: ["codex"] } }));
  const script = fileURLToPath(new URL("../services/codex-harness-services-section/services/codex-harness-projection-service/scripts/project-office-context.mjs", import.meta.url));
  const received = spawnSync(process.execPath, [script, binding], { encoding: "utf8", timeout: 5000 });
  assert.equal(received.status, 0, received.stderr);
  const result = JSON.parse(received.stdout);
  assert.equal(result.resources.codexTrustRequired, true); assert.equal(result.resources.activeSessionGuarded, false);
  const hook = JSON.parse(readFileSync(join(root, ".codex/hooks.json"))).hooks.PreToolUse[0].hooks[0];
  // The projection names the guard its script resolves (this source in a linked checkout, the installed package elsewhere): a real hook file, run by node.
  const named = /'([^']*\/src\/host-resource-hook\.mjs)'/u.exec(hook.command)?.[1];
  assert.ok(named !== undefined && existsSync(named), hook.command); assert.match(readFileSync(join(root, ".codex/config.toml"), "utf8"), /hooks = true/);
  const denied = spawnSync("bash", ["-c", hook.command], { input: JSON.stringify({ tool_name: "Bash", cwd: root, tool_input: { command: "find /home" } }), encoding: "utf8", timeout: 3000 });
  assert.equal(denied.status, 0); assert.equal(JSON.parse(denied.stdout).hookSpecificOutput.permissionDecision, "deny");
});

test("headless Claude carries the same source hook despite disabled setting sources", async t => {
  const { claudeCodeDialect } = await import("../services/claude-code-harness-services-section/src/claude-code-session.mjs");
  const args = claudeCodeDialect.startArguments({ cwd: "/tmp", artifactDir: "/tmp/fixture", taskId: "fixture", effects: "read-only" });
  assert.equal(args[args.indexOf("--setting-sources") + 1], "");
  assert.equal(args[args.indexOf("--permission-mode") + 1], "dontAsk");
  const settings = JSON.parse(args[args.indexOf("--settings") + 1]);
  assert.ok(settings.hooks.PreToolUse[0].hooks[0].command.includes(source));
  assert.match(settings.hooks.PreToolUse[0].matcher, /Monitor/);
});

test("actual shared carrier admission selects the existing resource slice", async t => {
  const { launchHarnessSession } = await import("../src/carrier/session.mjs");
  const root = scratch(t), input = join(root, "prompt.txt"); writeFileSync(input, "bounded source fixture");
  const dialect = { name: "fixture", label: "fixture", unit: "fixture-task", environment: [], readSession: () => ({ thread: "fixture", message: "fixture", errors: [] }) };
  let observed = false;
  const result = await launchHarnessSession(dialect, { directory: root, input, args: [], cwd: root, unit: "fixture", timeoutMs: 1000, pollIntervalMs: 1,
    systemRunner: async (command, args) => {
      assert.equal(command, "systemd-run"); assert.ok(args.includes("--slice=agent-claude.slice")); observed = true;
      writeFileSync(join(root, "exit-code"), "0\n"); return { exitCode: 0, stdout: "", stderr: "" };
    } });
  assert.equal(observed, true); assert.equal(result.ok, true);
});


test("dry-run detects a retired source without writing and reconciliation preserves unrelated hooks", t => {
  const root = scratch(t); mkdirSync(join(root, ".codex"));
  const retired = "/retired/owner/src/host-resource-hook.mjs";
  const file = join(root, ".codex/hooks.json");
  const independent = { matcher: "Read", hooks: [{ type: "command", command: "echo independent" }] };
  const prior = JSON.stringify({ hooks: { PreToolUse: [independent, ...hookEntries(retired, { provider: "codex" }).PreToolUse] } });
  writeFileSync(file, prior);
  const options = { node: root, providers: ["codex"], retiredSources: [retired] };
  assert.ok(writeHostResourceControl({ ...options, dryRun: true }).written.includes(".codex/hooks.json"));
  assert.equal(readFileSync(file, "utf8"), prior);
  writeHostResourceControl(options);
  const groups = JSON.parse(readFileSync(file)).hooks.PreToolUse;
  assert.equal(groups.length, 2); assert.deepEqual(groups[0], independent);
  assert.ok(groups[1].hooks[0].command.includes(source));
  assert.deepEqual(writeHostResourceControl({ ...options, dryRun: true }).written, []);
});
