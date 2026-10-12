import test from "node:test";
import assert from "node:assert/strict";
import { BYPASS_ENV_VAR, checkGitScaleSafety, findGitScaleSafetyViolation, findSearchScaleSafetyViolation } from "../scripts/check-git-scale-safety-hook.mjs";
import { lifecycleEvent, responseOf, textReader } from "./lifecycle-event.mjs";

const environment = {};
const transcript = "/transcripts/s.jsonl";
const userTurn = (text) => `${JSON.stringify({ message: { role: "user", content: text } })}\n`;
const bash = (command) => lifecycleEvent({ event: "PreToolUse", tool: "Bash", toolInput: { command }, transcriptPath: transcript });

async function rule(command, files = {}) {
  return responseOf(await checkGitScaleSafety(bash(command), { environment, readText: textReader(files) }));
}

test("wildcard staging and committing are refused, naming the operator that stages by exact path", async () => {
  for (const command of ["git add -A", "git add .", "git add -u", "git commit -a -m x", "git commit -am x", "git commit --all"]) {
    const response = await rule(command);
    assert.equal(response.disposition, "block", command);
    assert.match(response.reason, /commit-git-paths\.mjs by exact path/);
  }
});

test("unscoped tree and history walks, and a linked worktree, are refused", async () => {
  assert.match((await rule("git grep foo")).reason, /walks the whole working tree/);
  assert.match((await rule("git log -p")).reason, /add `-- <path>`/);
  assert.match((await rule("git log --all")).reason, /add `-- <path>`/);
  assert.match((await rule("git worktree add ../copy")).reason, /materializes another full checkout/);
  assert.equal((await rule("git log -p -- lib/a.mjs")).disposition, "continue");
  assert.equal((await rule("git log --oneline -5")).disposition, "continue");
});

test("a recursive grep and an unbounded find are refused unless they exclude node_modules", async () => {
  assert.match((await rule("grep -r foo .")).reason, /use `rg` instead/);
  assert.match((await rule("grep -rn foo .")).reason, /use `rg` instead/);
  assert.match((await rule("find . -name '*.mjs'")).reason, /add `-maxdepth <n>`/);
  assert.equal((await rule("grep -r foo . --exclude-dir=node_modules")).disposition, "continue");
  assert.equal((await rule("find . -maxdepth 2 -name '*.mjs'")).disposition, "continue");
  assert.equal((await rule("rg foo lib")).disposition, "continue");
});

test("a quoted argument that merely mentions an unsafe command is not one", async () => {
  assert.equal((await rule('commit-git-paths.mjs --message "stop using git add -A everywhere"')).disposition, "continue");
  assert.equal((await rule('grep -i "a|b" lib/a.mjs')).disposition, "continue");
});

test("wildcard staging is allowed only when the owner asked for a bulk commit in their own words", async () => {
  const files = { [transcript]: userTurn("just do a bulk commit of everything") };
  assert.equal((await rule("git add -A", files)).disposition, "continue");
  assert.equal((await rule("git grep foo", files)).disposition, "block", "an opt-in does not license an unscoped walk");
  assert.equal((await rule("git add -A", { [transcript]: userTurn("tidy up the tree") })).disposition, "block");
});

test("a non-Bash call, a safe command, and the explicit bypass all continue", async () => {
  assert.equal(responseOf(await checkGitScaleSafety(lifecycleEvent({ event: "PreToolUse", tool: "Write", toolInput: { file_path: "a.mjs" } }), { environment })).disposition, "continue");
  assert.equal((await rule("git status")).disposition, "continue");
  assert.equal(responseOf(await checkGitScaleSafety(bash("git add -A"), { environment: { [BYPASS_ENV_VAR]: "1" } })).disposition, "continue");
});

test("the violation readers are pure over command text", () => {
  assert.equal(findGitScaleSafetyViolation("ls -la"), null);
  assert.equal(findGitScaleSafetyViolation(undefined), null);
  assert.equal(findSearchScaleSafetyViolation(undefined), null);
});
