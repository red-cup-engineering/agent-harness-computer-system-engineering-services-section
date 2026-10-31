import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import { installHooks, projectHooks } from "../scripts/project-codex-hooks.mjs";

const fixture = () => mkdtempSync(join(tmpdir(), "codex-hooks-projection-"));
const handlers = (hooks, event) => hooks[event].map((group) => group.hooks[0].command);

test("the API and CLI refuse to infer a user home destination", () => {
  assert.throws(() => installHooks(), /root path is required/u);
  const script = new URL("../scripts/project-codex-hooks.mjs", import.meta.url);
  const result = spawnSync(process.execPath, [script.pathname], { encoding: "utf8" });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /--root requires one destination path/u);
});

test("package installer projects only non-interactive lifecycle hooks", () => {
  const root = fixture();
  const installed = installHooks({ root });
  assert.equal(installed.changed, true);
  const projection = JSON.parse(readFileSync(join(root, ".codex/hooks.json"), "utf8"));
  assert.deepEqual(Object.keys(projection.hooks), ["PreToolUse", "SubagentStart", "SubagentStop", "Stop"]);
  for (const groups of Object.values(projection.hooks)) for (const group of groups) {
    assert.ok(existsSync(group.hooks[0].command.slice(process.execPath.length + 1)), "projected command names an existing source");
  }
  for (const event of ["SubagentStart"]) {
    assert.equal(projection.hooks[event][0].hooks[0].additionalContextLimit, 512, event);
  }
  assert.equal(projection.hooks.SubagentStop[0].hooks[0].additionalContextLimit, undefined);
  assert.equal(projection.hooks.PreToolUse[0].hooks[0].timeout, 10);
  assert.equal(installHooks({ root, check: true }).checked, true);
});

test("package check detects projection drift without overwriting it", () => {
  const root = fixture();
  installHooks({ root });
  const target = join(root, ".codex/hooks.json");
  writeFileSync(target, "{}\n");
  assert.throws(() => installHooks({ root, check: true }), /stale or missing/u);
  assert.equal(readFileSync(target, "utf8"), "{}\n");
});

test("installation preserves lifecycle hooks outside the manifest", () => {
  const root = mkdtempSync(join(tmpdir(), "codex-hooks-merge-"));
  mkdirSync(join(root, ".codex"), { recursive: true });
  writeFileSync(join(root, ".codex/hooks.json"), `${JSON.stringify({ description: "local lifecycle hooks", hooks: { PostToolUse: [{ hooks: [{ type: "command", command: "local-post" }] }] } }, null, 2)}\n`);
  installHooks({ root });
  const installed = JSON.parse(readFileSync(join(root, ".codex/hooks.json"), "utf8"));
  assert.equal(installed.description, "local lifecycle hooks");
  assert.equal(installed.hooks.PostToolUse[0].hooks[0].command, "local-post");
  assert.ok(installed.hooks.PreToolUse);
});

test("CLI projects and checks a scratch project", () => {
  const root = fixture();
  const script = new URL("../scripts/project-codex-hooks.mjs", import.meta.url);
  const projected = spawnSync(process.execPath, [script.pathname, "--root", root], { encoding: "utf8" });
  assert.equal(projected.status, 0, projected.stderr);
  assert.match(projected.stdout, /^projected /u);
  const checked = spawnSync(process.execPath, [script.pathname, "--root", root, "--check"], { encoding: "utf8" });
  assert.equal(checked.status, 0, checked.stderr);
  assert.match(checked.stdout, /^checked /u);
});

test("standalone import does not discover a workspace or read section data", () => {
  const cwd = fixture();
  const script = new URL("../scripts/project-codex-hooks.mjs", import.meta.url);
  const result = spawnSync(process.execPath, ["--input-type=module", "--eval", "await import(" + JSON.stringify(script.href) + ")"], {
    cwd, encoding: "utf8", env: { ...process.env, CODEX_ENTERPRISE_DATA_ROOT: join(cwd, "absent-data") },
  });
  assert.equal(result.status, 0, result.stderr);
});

test("explicit sourceRoot resolves a standalone declared handler", () => {
  const sourceRoot = fixture();
  writeFileSync(join(sourceRoot, "owned-hook.mjs"), "// declared test source\n");
  const manifest = { version: 1, handlers: { enterprise: "owned-hook.mjs" }, events: { Stop: [{ handler: "enterprise" }] }, projections: {} };
  const projected = projectHooks({ sourceRoot, manifest });
  assert.equal(handlers(projected.hooks, "Stop")[0], process.execPath + " " + join(sourceRoot, "owned-hook.mjs"));
});

test("a declared package source fallback names the existing package file", () => {
  const sourceRoot = fixture();
  const manifest = { version: 1, handlers: { enterprise: "projected-hook" }, events: { Stop: [{ handler: "enterprise" }] }, projections: { "projected-hook": "src/codex-enterprise-hook.mjs" } };
  const projected = projectHooks({ sourceRoot, manifest });
  const actual = new URL("../src/codex-enterprise-hook.mjs", import.meta.url).pathname;
  assert.equal(handlers(projected.hooks, "Stop")[0], process.execPath + " " + actual);
  const root = fixture();
  installHooks({ root, sourceRoot, manifest });
  const copied = join(root, "projected-hook");
  assert.equal(readFileSync(copied, "utf8"), readFileSync(actual, "utf8"));
  assert.equal(installHooks({ root, sourceRoot, manifest, check: true }).checked, true);
  writeFileSync(copied, "// local drift\\n");
  assert.throws(() => installHooks({ root, sourceRoot, manifest, check: true }), /stale or missing/u);
  assert.equal(readFileSync(copied, "utf8"), "// local drift\\n");
});

test("an absent declared handler refuses before destination writes", () => {
  const root = fixture(), sourceRoot = fixture();
  const manifest = { version: 1, handlers: { enterprise: "absent-hook.mjs" }, events: { Stop: [{ handler: "enterprise" }] }, projections: {} };
  assert.throws(() => installHooks({ root, sourceRoot, manifest }), /missing hook handler/u);
  assert.equal(existsSync(join(root, ".codex")), false);
});
