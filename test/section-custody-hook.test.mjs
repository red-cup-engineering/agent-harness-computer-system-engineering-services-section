import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { scratchRoot } from "./support/scratch.mjs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { custodyHookEntries, decide, isSectionCode, ownerOf, writtenPaths } from "../src/section-custody-hook.mjs";

const OPS = "/house/lib/phezi-ochage/services/561-group/services/operations-services-section";

/** A working tree whose origin is github.com/<owner>/<name>, as a plain repository. */
function repo(root, relative, owner) {
  const dir = path.join(root, relative);
  mkdirSync(path.join(dir, ".git"), { recursive: true });
  writeFileSync(path.join(dir, ".git", "config"), `[core]\n\tbare = false\n[remote "origin"]\n\turl = https://github.com/${owner}/x.git\n\tfetch = +refs/heads/*:refs/remotes/origin/*\n`);
  return dir;
}

test("executable source in any Operations-named directory is refused, legacy included; data is not", () => {
  assert.equal(isSectionCode(`${OPS}/lib/fleet.mjs`), true);
  assert.equal(isSectionCode(`${OPS}/services/channels-services-section/src/x.js`), true, "child sections of Operations");
  assert.equal(isSectionCode("/h/services/computer-operations-services-section/scripts/run.rkt"), true);
  assert.equal(isSectionCode(`${OPS}/lib/agency/skills/x/SKILL.md`), false);
  assert.equal(isSectionCode(`${OPS}/data/records/policy.json`), false);
  assert.equal(isSectionCode(`${OPS}/lib/legacy/old/thing.mjs`), true, "legacy is no place to park code");
  assert.equal(isSectionCode(`${OPS}/node_modules/pkg/index.js`), false);
  assert.equal(isSectionCode(`${OPS}/public/pagefind/pagefind.js`), false, "generated search bundle");
  assert.equal(isSectionCode("src/x.mjs", `${OPS}/services/a-services-section`), true, "relative paths resolve against cwd");
});

test("the owning repository's org decides, through submodule and worktree .git files", () => {
  const root = mkdtempSync(path.join(scratchRoot(), "custody-"));
  const science = repo(root, "science/public-misnamed-dir", "lenticule-science");
  const engine = repo(root, "house/public-media-services-section", "red-cup-engineering");
  assert.equal(ownerOf(science), "lenticule-science");
  assert.equal(isSectionCode(path.join(science, "src/new.mjs")), true, "Science repository");
  assert.equal(isSectionCode(path.join(science, "content/note.md")), false);
  assert.equal(isSectionCode(path.join(engine, "src/engine.mjs")), false, "a Red Cup checkout passes whatever its directory is named");

  const sub = path.join(root, "super/lib/group-section");
  mkdirSync(sub, { recursive: true });
  mkdirSync(path.join(root, "super/.git/modules/group-section"), { recursive: true });
  writeFileSync(path.join(root, "super/.git/modules/group-section/config"), `[remote "origin"]\n\turl = git@github.com:561-group/561-group-x-services-section.git\n`);
  writeFileSync(path.join(sub, ".git"), "gitdir: ../../.git/modules/group-section\n");
  assert.equal(isSectionCode(path.join(sub, "tools/a.py")), true, "submodule .git file");

  const common = repo(root, "main-checkout", "red-cup-engineering");
  mkdirSync(path.join(common, ".git/worktrees/w"), { recursive: true });
  writeFileSync(path.join(common, ".git/worktrees/w/commondir"), "../..\n");
  const worktree = path.join(root, "wt");
  mkdirSync(worktree, { recursive: true });
  writeFileSync(path.join(worktree, ".git"), `gitdir: ${path.join(common, ".git/worktrees/w")}\n`);
  assert.equal(isSectionCode(path.join(worktree, "src/b.ts")), false, "worktree of a Red Cup repository");
  assert.equal(isSectionCode(path.join(root, "outside/c.mjs")), false, "outside any repository");
  assert.equal(isSectionCode(path.join(science, ".codex/release-state/r.mjs")), false, "the repository's own harness state");
  const nested = repo(science, ".codex/worktrees/w", "coesite-operations");
  assert.equal(isSectionCode(path.join(nested, "src/c.mjs")), true, "a worktree under harness state is judged by its owner");
});

test("Claude edit tools and Codex apply_patch envelopes are both read", () => {
  assert.deepEqual(writtenPaths({ tool_name: "Write", tool_input: { file_path: "/a/b.mjs" } }), ["/a/b.mjs"]);
  assert.deepEqual(writtenPaths({ tool_name: "NotebookEdit", tool_input: { notebook_path: "/a/n.ipynb" } }), ["/a/n.ipynb"]);
  const patch = "apply_patch <<'EOF'\n*** Begin Patch\n*** Add File: lib/new.mjs\n+x\n*** Update File: README.md\n*** End Patch\nEOF";
  assert.deepEqual(writtenPaths({ tool_name: "Bash", tool_input: { command: patch } }), ["lib/new.mjs", "README.md"]);
  assert.deepEqual(writtenPaths({ tool_name: "Bash", tool_input: { command: "ls" } }), []);
});

test("a refusal names the rule and the Engineering destination; an allowed call prints nothing", () => {
  const denied = decide({ tool_name: "Edit", tool_input: { file_path: `${OPS}/lib/evidence.mjs` } });
  assert.equal(denied.permissionDecision, "deny");
  assert.match(denied.permissionDecisionReason, /science-engineering-operations-parameterize-in-order/u);
  assert.match(denied.permissionDecisionReason, /engineering-services-section/u);
  assert.equal(decide({ tool_name: "Write", tool_input: { file_path: `${OPS}/data/records/x.json` } }), undefined);
  const hook = fileURLToPath(new URL("../src/section-custody-hook.mjs", import.meta.url));
  const run = (event) => spawnSync(process.execPath, [hook], { input: JSON.stringify(event), encoding: "utf8" });
  assert.equal(JSON.parse(run({ tool_name: "Write", tool_input: { file_path: `${OPS}/src/a.ts` } }).stdout).hookSpecificOutput.permissionDecision, "deny");
  assert.equal(run({ tool_name: "Write", tool_input: { file_path: `${OPS}/content/a.md` } }).stdout, "");
  assert.equal(run("not json").stdout, "");
});

test("hook entries target edit tools for Claude and the shell tool for Codex", () => {
  assert.equal(custodyHookEntries("/h.mjs").PreToolUse[0].matcher, "Write|Edit|MultiEdit|NotebookEdit");
  assert.equal(custodyHookEntries("/h.mjs", { provider: "codex" }).PreToolUse[0].matcher, "Bash");
});
