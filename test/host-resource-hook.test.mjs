// host-resource-hook.test: the PreToolUse controller that denies runaway commands and places the rest
// in the work slice. Classification is a table over real fixture repositories (a `.git/index` of the
// size that makes a repository large); containment is shown by running the hook's own rewrite with a
// fake systemd-run.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import net from "node:net";
import { closeSync, constants, existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, truncateSync, writeFileSync } from "node:fs";
import { scratchRoot } from "./support/scratch.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { LIMITS, isMassDeletion, massDeletionMarker, CONTAINMENT_SLICE, WORK_SLICE, sessionLimits, classify, containedCommand, containmentLimits, decide, hookEntries, hostResourceControl, isContained, launcherScript, parseShell, run, shellQuote, sliceUnit } from "../src/host-resource-hook.mjs";

const HOOK = fileURLToPath(new URL("../src/host-resource-hook.mjs", import.meta.url));
const MiB = 1024 * 1024;

const root = realpathSync(mkdtempSync(path.join(scratchRoot(), "host-resource-hook-")));
const home = path.join(root, "home");
const dirs = {
  home,
  big: path.join(home, "big"),
  small: path.join(home, "small"),
  plain: path.join(home, "plain"),
  sub: path.join(home, "big", "lib"),
  linked: path.join(home, "linked"),
  many: path.join(home, "many"),
  few: path.join(home, "few"),
  super: path.join(home, "super"),
  srv: "/srv/work/proj",
  srvScratch: "/srv/work/scratchpad/harness",
};
function repository(dir, indexBytes) {
  mkdirSync(path.join(dir, ".git"), { recursive: true });
  writeFileSync(path.join(dir, ".git", "index"), "");
  truncateSync(path.join(dir, ".git", "index"), indexBytes);
}
repository(dirs.big, 6 * MiB);
repository(dirs.small, 4096);
// A real index header ("DIRC", version, entry count) is believed over the file's size.
function countedRepository(dir, entries, size) {
  mkdirSync(path.join(dir, ".git"), { recursive: true });
  const header = Buffer.alloc(12);
  header.write("DIRC", 0, "latin1");
  header.writeUInt32BE(2, 4);
  header.writeUInt32BE(entries, 8);
  writeFileSync(path.join(dir, ".git", "index"), header);
  truncateSync(path.join(dir, ".git", "index"), size);
}
countedRepository(dirs.many, 25_000, 1024);
countedRepository(dirs.few, 100, 6 * MiB);
// A superrepo of submodules: its own index is a handful of gitlinks, the checkouts under it are not.
countedRepository(dirs.super, 6, 1024);
writeFileSync(path.join(dirs.super, ".gitmodules"), '[submodule "a"]\n\tpath = sections/a\n[submodule "b"]\n\tpath = sections/b\n[submodule "outer"]\n\tpath = outer\n');
countedRepository(path.join(dirs.super, "sections", "a"), 12_000, 1024);
countedRepository(path.join(dirs.super, "sections", "b"), 12_000, 1024);
countedRepository(path.join(dirs.super, "outer"), 40, 1024);
writeFileSync(path.join(dirs.super, "outer", ".gitmodules"), '[submodule "inner"]\n\tpath = services/inner\n');
countedRepository(path.join(dirs.super, "outer", "services", "inner"), 25_000, 1024);
mkdirSync(path.join(dirs.super, "docs"), { recursive: true });
mkdirSync(dirs.plain, { recursive: true });
mkdirSync(dirs.sub, { recursive: true });
// A linked worktree keeps a `.git` file naming the git directory that holds its index.
mkdirSync(dirs.linked, { recursive: true });
mkdirSync(path.join(root, "gitdirs", "linked"), { recursive: true });
writeFileSync(path.join(root, "gitdirs", "linked", "index"), "");
truncateSync(path.join(root, "gitdirs", "linked", "index"), 6 * MiB);
writeFileSync(path.join(dirs.linked, ".git"), `gitdir: ${path.join(root, "gitdirs", "linked")}\n`);

const env = { HOME: home, PATH: process.env.PATH };
process.on("exit", () => rmSync(root, { recursive: true, force: true }));

const verdict = (command, cwd = "plain") => classify(command, { cwd: dirs[cwd] ?? cwd, env, home });

// [command, cwd, expected action, a piece of the denial reason when it is a deny]
// Nothing is queued (Leader, 2026-10-26: "fuck this heavy-command slot slop"; #38): what is not denied is allowed.
const TABLE = [
  // find: rooted at the disk, a home or a large tree, unbounded
  ["find / -name x", "plain", "deny", "walks the whole disk"],
  ["find ~ -name x", "plain", "deny"],
  ["find $HOME -name x", "plain", "deny"],
  ['find "$HOME" -name x', "plain", "deny"],
  ["find /home -name x", "plain", "deny"],
  [`find ${home} -maxdepth 9 -name x`, "plain", "deny"],
  [`find ${home} -maxdepth 4 -type f`, "plain", "deny"],
  ["find . -name x", "big", "deny"],
  [`find ${dirs.big} -type f`, "plain", "deny"],
  ["find /mnt/c -name x", "plain", "deny"],
  [`cd ${dirs.big} && find . -name x`, "plain", "deny"],
  ["(cd / && find . -name x)", "plain", "deny"],
  ["bfs -S dfs -regextype findutils-default / -name cast -type f", "plain", "deny"],
  ["bfs -S dfs -regextype findutils-default / -type d -name forge-std -not -path '*/proc/*'", "plain", "deny"],
  ["sudo find / -name x", "plain", "deny"],
  ["FOO=1 find / -name x", "plain", "deny"],
  ["time find / -name x", "plain", "deny"],
  ["timeout 60 find /home -name x", "plain", "deny"],
  ["bash -c 'find / -name x'", "plain", "deny"],
  ["echo $(find / -name x)", "plain", "deny"],
  ["for f in `find ~ -name x`; do echo $f; done", "plain", "deny"],
  ["ls && find / -name x | head", "plain", "deny"],
  [`find ${home} -maxdepth 3 -name x`, "plain", "allow"],
  ["find / -maxdepth 1", "plain", "allow"],
  ["find ~ -maxdepth 2 -name x", "plain", "allow"],
  [`find ${dirs.plain} -name x`, "plain", "allow"],
  ["find . -name x", "plain", "allow"],
  ["find . -name x", "small", "allow"],
  ["find lib -name x", "big", "allow"],
  // git worktree add
  ["git worktree add ../w", "plain", "deny", "own checkout inside the colony"],
  ["git worktree add -b topic ../w HEAD", "small", "deny"],
  ["git worktree list", "plain", "allow"],
  ["git worktree remove ../w", "plain", "allow"],
  // Raw clones never use the original shared source-object owner.
  ["git clone https://example.com/o/r.git", "plain", "deny", "another unreceived object database"],
  ["gh repo clone o/r", "plain", "deny"],
  ["git clone https://example.com/o/r.git", "srv", "deny", "outside the colony directory"],
  ["git clone https://example.com/o/r.git ./r", "srv", "deny"],
  ["gh repo clone o/r", "srv", "deny"],
  ["git clone --filter=blob:none --sparse --depth=50 https://example.com/o/r.git", "srvScratch", "deny"],
  ["git clone https://example.com/o/r.git /tmp/r", "plain", "deny", "outside the colony directory"],
  ["git clone --depth 1 -b main git@example.com:o/r.git /var/tmp/r", "plain", "deny"],
  ["git clone https://example.com/o/r.git scratch/r", "plain", "deny"],
  // an unscoped status / log --all / ls-files in a large repository
  ["git status", "big", "deny", "pathspec"],
  ["git status -s", "big", "deny"],
  ["git status --porcelain=v2 -b", "sub", "deny"],
  ["git status .", "big", "deny"],
  ["git status", "linked", "deny"],
  [`git -C ${dirs.big} status`, "plain", "deny"],
  [`cd ${dirs.big} && git status -sb`, "plain", "deny"],
  ["git log --all", "big", "deny"],
  ["git log --all --oneline", "sub", "deny"],
  ["git ls-files", "big", "deny"],
  ["git ls-files -o --exclude-standard", "big", "deny"],
  ["git status -- lib", "big", "allow"],
  ["git status lib/a.mjs", "sub", "allow"],
  ["git log --all -n 20", "big", "allow"],
  ["git log --all --max-count=5", "big", "allow"],
  ["git log -n 5", "big", "allow"],
  ["git ls-files -- lib", "big", "allow"],
  ["git status", "small", "allow"],
  ["git log --all", "small", "allow"],
  ["git ls-files", "small", "allow"],
  ["git status", "plain", "allow"],
  // the tracked-file count in the index header decides, not the file's size
  ["git status", "many", "deny", "25000 tracked files"],
  ["find . -name x", "many", "deny"],
  ["git status", "few", "allow"],
  ["find . -name x", "few", "allow"],
  ["git diff", "few", "allow"],
  // submodules: visiting all of them at the top of a large repository is denied unless a path is named
  ["git submodule update --init --recursive", "big", "deny", "submodule update"],
  ["git submodule update", "big", "deny"],
  ["git submodule foreach 'git status'", "big", "deny", "submodule foreach"],
  ["git submodule foreach --recursive git fetch", "many", "deny"],
  [`git -C ${dirs.big} submodule update --init`, "plain", "deny"],
  ["git submodule update --init --recursive -- deps/x", "big", "deny"],
  ["git submodule update --init", "sub", "deny"],
  ["git submodule update --init --recursive", "small", "deny"],
  ["git submodule update --init -- deps/x", "big", "allow"],
  ["git submodule sync", "big", "allow"],
  ["git submodule status", "big", "allow"],
  // transfers and whole-tree git in a large repository are not denied, and nothing queues them
  ["gh pr create --title t", "big", "allow"],
  ["gh pr merge 3 -R o/r", "big", "allow"],
  ["git fetch origin", "big", "allow"],
  ["git push origin main", "big", "allow"],
  ["git diff", "big", "allow"],
  ["git grep foo", "big", "allow"],
  ["git add -A", "big", "allow"],
  ["git commit -am wip", "big", "allow"],
  ["git checkout main", "big", "allow"],
  ["git stash", "big", "allow"],
  ["git log --all -- lib", "big", "allow"],
  ["git ls-files", "sub", "allow"],
  ["git diff --stat -- lib", "big", "allow"],
  ["git diff --cached", "big", "allow"],
  ["git grep foo -- lib", "big", "allow"],
  ["git show HEAD", "big", "allow"],
  ["git rev-parse HEAD", "big", "allow"],
  // recursive reads of a large tree are denied (rule no-whole-tree-scans)
  ["rg foo", "big", "deny"],
  ["rg --files", "big", "deny"],
  [`rg foo ${home}`, "plain", "deny"],
  ["rg -n -e foo -g '*.mjs'", "big", "deny"],
  ["grep -rn foo .", "big", "deny"],
  ["grep -r foo ~", "plain", "deny"],
  ["grep -R foo /", "plain", "deny"],
  ["fd mjs", "big", "deny"],
  [`ls -R ${home}`, "plain", "deny"],
  ["rg foo lib", "big", "allow"],
  ["rg foo", "small", "allow"],
  ["rg foo --max-depth 2", "big", "allow"],
  ["git log | rg foo", "big", "allow"],
  ["grep foo notes.txt", "big", "allow"],
  ["grep -rn foo lib", "big", "allow"],
  // a superrepo is as large as the checkouts beneath it, nested submodules included
  ["grep -rl -e foo sections outer", "super", "deny", "large working tree"],
  ["grep -rn foo .", "super", "deny"],
  ["rg foo sections", "super", "deny"],
  ["grep -r foo outer", "super", "deny"],
  ["timeout 60 grep -rl --include=*.json -e foo outer/services", "super", "deny"],
  ["grep -rn foo sections/a", "super", "allow"],
  ["grep -rn foo docs", "super", "allow"],
  ["find . -name x", "super", "deny"],
  ["ls -la", "big", "allow"],
  // installs and builds are not denied
  ["npm install", "plain", "deny", "direct dependency installation"],
  ["make -j4", "plain", "allow"],
  ["sudo du -sh /", "plain", "allow"],

  // everything else, and words that only look like commands
  ["ls", "plain", "allow"],
  ["cat README.md", "plain", "allow"],
  ["echo hi", "plain", "allow"],
  ["node --test test/a.test.mjs", "plain", "allow"],
  ['echo "find / -name x"', "plain", "allow"],
  ['grep "find /" notes.txt', "plain", "allow"],
  ["cat <<'EOF'\nfind / -name x\ntar czf a b\nEOF", "plain", "allow"],
  ['git commit -m "$(cat <<\'EOF\'\nfind / is unbounded, run tar with care\nEOF\n)"', "small", "allow"],
  ["# find / -name x\nls", "plain", "allow"],
  ["", "plain", "allow"],
];

for (const [command, cwd, action, reason] of TABLE) {
  test(`${action}: ${JSON.stringify(command)} in ${cwd}`, () => {
    const result = verdict(command, cwd);
    assert.equal(result.action, action, JSON.stringify(result));
    if (reason !== undefined) assert.match(result.reason, new RegExp(reason, "u"));
    if (action === "deny") assert.doesNotMatch(result.reason, /\n/u, "the reason is one line");
  });
}

test("raw clones are refused inside the colony as well as in scratch", () => {
  const user = { env: { ...env, HOME: "/home/someone" }, home: "/home/someone" };
  assert.equal(classify("git clone https://example.com/o/r.git $HOME/code/r", { cwd: "/srv/work/proj", ...user }).action, "deny", "inside a colony directory");
  assert.equal(classify("git clone https://example.com/o/r.git ~/code/r", { cwd: "/srv/work/proj", ...user }).action, "deny");
  assert.equal(classify("git clone https://example.com/o/r.git ../../../tmp/r", { cwd: "/srv/work/proj", ...user }).action, "deny");
  assert.equal(classify("git clone https://example.com/o/r.git ../r", { cwd: "/srv/work/scratchpad/harness", ...user }).action, "deny");
  assert.equal(classify("git clone https://example.com/o/r.git /home/someone/.cache/scratch/r", { cwd: "/srv/work/proj", ...user }).action, "deny");
});

test("clone custody refuses a missing cd and unresolved destinations before executing Git", () => {
  const missing = path.join(home, "scratch", "absent-clone-parent");
  const cases = [
    `cd ${shellQuote(missing)}; for r in owner/one owner/two; do git clone -q --depth 1 https://example.com/$r.git 2>&1 | tail -2; done; ls`,
    `cd ${shellQuote(missing)}; git clone https://example.com/o/r.git`,
    `pushd ${shellQuote(missing)}; gh repo clone o/r`,
    `cd ${shellQuote(missing)}; bash -c 'git clone https://example.com/o/r.git'`,
    `git -C ${shellQuote(missing)} clone https://example.com/o/r.git`,
    "git clone https://example.com/$repository.git",
    "git clone https://example.com/o/r.git $unknownDestination",
  ];
  for (const command of cases) {
    const result = hook(event(command));
    assert.equal(result.status, 0);
    const decision = JSON.parse(result.stdout).hookSpecificOutput;
    assert.equal(decision.permissionDecision, "deny", command);
    assert.match(decision.permissionDecisionReason, /destination cannot be established/u);
    assert.equal(decision.updatedInput, undefined, "the refusal contains no executable rewrite");
  }
  assert.equal(existsSync(missing), false, "admission does not create the intended directory");
});

test("raw clone denial has no native effect even at a resolved in-colony target", () => {
 const directory=path.join(home,'colony','clone-custody');mkdirSync(directory,{recursive:true});
 for(const command of [`cd ${shellQuote(directory)} && git clone https://example.com/o/r.git ./fixture`,`gh repo clone o/r ${shellQuote(path.join(directory,'alternate'))}`]){
  const result=hook(event(command));assert.equal(result.status,0);const decision=JSON.parse(result.stdout).hookSpecificOutput;assert.equal(decision.permissionDecision,'deny');assert.match(decision.permissionDecisionReason,/unreceived object database/);assert.equal(decision.updatedInput,undefined);
 }
 assert.equal(existsSync(path.join(directory,'fixture')),false);assert.equal(existsSync(path.join(directory,'alternate')),false);
 const recovery=`if ! cd ${shellQuote(path.join(directory,'missing'))}; then printf recovered; fi`;assert.equal(classify(recovery,{cwd:dirs.plain,env,home}).action,'allow');
});

test('raw dependency producers refuse while metadata and received execution remain usable',()=>{
 for(const command of ['npm ci','npm --prefix /tmp/job install','pnpm install','pnpm add package','pnpm dlx package','npx package','npx --offline package','npm exec --offline -- package','yarn','yarn add package','bun install','bunx package','git.exe clone https://example.com/o/r.git ./r','npm.cmd ci','PNPM.EXE install','bash -c "npm install"'])assert.equal(verdict(command).action,'deny',command);
 for(const command of ['npm test','npm pack --ignore-scripts','npm view package version','pnpm exec already-received','npm install --package-lock-only --ignore-scripts','pnpm install --lockfile-only --ignore-scripts --ignore-pnpmfile','pnpm install --lockfile-only --ignore-scripts','npx --no-install already-received'])assert.equal(verdict(command).action,'allow',command);
 assert.equal(verdict('pnpm install --lockfile-only --lockfile-only=false').action,'deny');
 assert.equal(verdict('pnpm install --lockfile-only').action,'deny','a resolution without --ignore-scripts may run lifecycle scripts');
});

test("a session confined to an allow-list is denied what is runaway but never rewritten", () => {
  const confined = (command) => decide({ tool_name: "Bash", cwd: dirs.big, permission_mode: "dontAsk", tool_input: { command } }, { env, home });
  assert.equal(confined("git status").permissionDecision, "deny");
  assert.equal(confined("git grep foo"), undefined);
  assert.equal(confined("git log -n 3"), undefined);
});

test("a deny still applies under flock", () => {
  assert.equal(verdict("flock /run/user/1000/agent-heavy.lock find / -name x").action, "deny");
  assert.equal(verdict("flock -w 5 -E 75 /run/user/1000/agent-heavy.lock bash -c 'find / -name x'").action, "deny");
  assert.equal(verdict("flock /run/user/1000/agent-heavy.lock -c 'find / -name x'").action, "deny");
});

test("the shell parser keeps quotes, substitutions, subshells and heredocs apart", () => {
  const { commands, scopes } = parseShell("cd /a && (cd /b; ls) | wc -l\n$(echo hi) x\ncat <<EOF > out\nfind /\nEOF\necho 'a;b' \"c d\" \\; e");
  assert.deepEqual(commands.map((command) => command.words.join(" ")), ["cd /a", "cd /b", "ls", "wc -l", "echo hi", "$(…) x", "cat > out", "echo a;b c d ; e"]);
  assert.equal(commands[3].piped, true);
  assert.equal(commands[2].scope, commands[1].scope);
  assert.equal(scopes[commands[1].scope].parent, 0);
});

// --- the hook as the harness runs it -----------------------------------------------------------

const hook = (stdin, hookEnv = env, args = []) => spawnSync(process.execPath, [HOOK, ...args], { input: stdin, env: hookEnv, encoding: "utf8" });
const event = (command, extra = {}, cwd = dirs.plain) => JSON.stringify({ hook_event_name: "PreToolUse", session_id: "s", cwd, tool_name: "Bash", tool_input: { command, ...extra }, tool_use_id: "t" });

test("a denied command leaves a one-line permissionDecisionReason on stdout and exits 0", () => {
  const result = hook(event("find /home/emsenn -maxdepth 9 -name x"), { ...env, HOME: "/home/emsenn" });
  assert.equal(result.status, 0);
  const output = JSON.parse(result.stdout).hookSpecificOutput;
  assert.equal(output.hookEventName, "PreToolUse");
  assert.equal(output.permissionDecision, "deny");
  assert.match(output.permissionDecisionReason, /^host-resource guard: find rooted at \/home\/emsenn walks the whole disk/u);
  assert.doesNotMatch(output.permissionDecisionReason, /\n/u);
});

test("AGENT_HOST_GUARD=off leaves even a runaway command untouched", () => {
  assert.equal(hook(event("find / -name x"), { ...env, AGENT_HOST_GUARD: "off" }).stdout, "");
});

test("an allowed command leaves no output at all", () => {
  for (const command of ["ls -la", "echo hi", "git status"]) {
    const result = hook(event(command));
    assert.equal(result.status, 0);
    assert.equal(result.stdout, "");
  }
});

test("the hook fails open: garbage, empty, partial and foreign events change nothing", () => {
  for (const stdin of ["", "not json{{", "{", "null", "[]", '{"tool_name":"Bash"}', '{"tool_name":"Bash","tool_input":{"command":42}}',
    '{"tool_name":"Bash","tool_input":null}', '{"tool_name":"Bash","tool_input":{"command":"   "}}',
    JSON.stringify({ tool_name: "Read", tool_input: { file_path: "/etc/passwd" } }),
    JSON.stringify({ tool_name: "Bash", tool_input: { command: `du -sh ${"x".repeat(300_000)}` } }),
    "\u0000\u0001\u0002", "x".repeat(300_000)]) {
    const result = hook(stdin);
    assert.equal(result.status, 0, stdin.slice(0, 40));
    assert.equal(result.stdout, "", stdin.slice(0, 40));
    assert.equal(result.stderr, "", stdin.slice(0, 40));
  }
  // A cwd that is not a path is simply unknown: the command is still judged by what it says.
  const odd = hook(JSON.stringify({ tool_name: "Bash", cwd: 7, tool_input: { command: "find / -name x" } }));
  assert.equal(JSON.parse(odd.stdout).hookSpecificOutput.permissionDecision, "deny");
});

// The hook is the one thing that may never be slow: its own time, over the time node needs to start,
// is bounded for every kind of stdin the harness or a broken one can give it.
const STDIN_KINDS = {
  empty: (args) => spawnSync(process.execPath, args, { input: "", encoding: "utf8" }),
  garbage: (args) => spawnSync(process.execPath, args, { input: "\u0000not json{{ [", encoding: "utf8" }),
  ignored: (args) => spawnSync(process.execPath, args, { stdio: ["ignore", "pipe", "pipe"], encoding: "utf8" }),
  closed: (args) => spawnSync("bash", ["-c", 'exec "$@" <&-', "bash", process.execPath, ...args], { encoding: "utf8" }),
};
const fastest = (launch, args, runs) => {
  let best = Infinity;
  for (let run = 0; run < runs; run += 1) {
    const started = process.hrtime.bigint();
    const result = launch(args);
    best = Math.min(best, Number(process.hrtime.bigint() - started) / 1e6);
    assert.equal(result.status, 0);
    assert.equal(result.stdout, "");
  }
  return best;
};

for (const [kind, launch] of Object.entries(STDIN_KINDS)) {
  test(`on ${kind} stdin the hook exits 0 with no output, within 50 ms (or one more node start-up, on a loaded host) of node's own start-up`, { timeout: 120_000 }, () => {
    const baseline = fastest(launch, ["-e", ""], 4);
    const hooked = fastest(launch, [HOOK], 4);
    process.stderr.write(`# ${kind} stdin: node alone ${baseline.toFixed(1)} ms, hook ${hooked.toFixed(1)} ms\n`);
    assert.ok(hooked - baseline < Math.max(50, baseline), `${kind}: the hook took ${(hooked - baseline).toFixed(1)} ms over node's ${baseline.toFixed(1)} ms start-up`);
  });
}

test("on a stdin that never closes the hook's own timer ends it, still exit 0 and silent", { timeout: 60_000 }, async () => {
  const started = Date.now();
  const child = spawn(process.execPath, [HOOK], { stdio: ["pipe", "pipe", "pipe"] });
  let stdout = "";
  child.stdout.on("data", (chunk) => { stdout += chunk; });
  const result = await Promise.race([exited(child), sleep(15_000).then(() => ({ code: "still running" }))]);
  const elapsed = Date.now() - started;
  child.kill("SIGKILL");
  assert.equal(result.code, 0, `the hook was still waiting after ${elapsed} ms`);
  assert.equal(stdout, "");
  assert.ok(elapsed < 10_000, `${elapsed} ms`);
});

test("unknown read coordinates remain fail-open while clone custody requires an established destination", () => {
  assert.equal(classify("find $NOPE -name x", { cwd: dirs.plain, env, home }).action, "allow");
  assert.equal(classify("find . -name x", { env, home }).action, "allow");
  assert.equal(classify("git clone https://example.com/o/r.git $DEST", { cwd: dirs.srv, env, home }).action, "deny");
  assert.equal(classify("cd - && find . -name x", { cwd: dirs.plain, env, home }).action, "allow");
});

test("the hook costs a few milliseconds of CPU per command", () => {
  const events = ["find / -name x", "git status", "du -sh .", "ls -la", "rg foo lib", "git clone https://example.com/o/r.git /tmp/r"]
    .map((command) => ({ tool_name: "Bash", cwd: dirs.big, tool_input: { command } }));
  const before = process.cpuUsage();
  const rounds = 100;
  for (let round = 0; round < rounds; round += 1) for (const input of events) decide(input, { env, home });
  const used = process.cpuUsage(before);
  const perCommand = (used.user + used.system) / 1000 / (rounds * events.length);
  assert.ok(perCommand < 2, `${perCommand.toFixed(3)} ms of CPU per command`);
});

// --- helpers -----------------------------------------------------------------------------------

const exited = (child) => new Promise((resolve) => {
  let stderr = "";
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  child.on("close", (code) => resolve({ code, stderr }));
});
const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
// Wait for a fact about another process rather than for a guessed time: a busy host starts processes late.
const until = async (predicate, timeout = 15_000) => {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) { if (predicate()) return true; await sleep(50); }
  return predicate();
};

test("rm of index.lock is denied only while a git process works in that repository", { skip: !existsSync("/proc/self/comm"), timeout: 60_000 }, async () => {
  const sleeper = spawnSync("sh", ["-c", "command -v sleep"], { encoding: "utf8" }).stdout.trim();
  mkdirSync(path.join(root, "bin"), { recursive: true });
  // The kernel names a process after the file it was started as, so a symlink called git is "git" to /proc.
  symlinkSync(sleeper, path.join(root, "bin", "git"));
  assert.equal(verdict("rm -f .git/index.lock", "small").action, "allow", "no git is running there: the lock is stale");
  const git = spawn(path.join(root, "bin", "git"), ["20"], { cwd: dirs.sub, stdio: "ignore" });
  try {
    assert.ok(await until(() => verdict("rm -f .git/index.lock", "big").action === "deny"), "the git process is seen");
    const inside = verdict("rm -f .git/index.lock", "big");
    assert.match(inside.reason, new RegExp(`git \\(pid ${git.pid}\\)`, "u"));
    assert.equal(verdict(`rm -f ${dirs.big}/.git/index.lock`, "plain").action, "deny", "a git working in a subdirectory counts");
    assert.equal(verdict(`rm -f ${dirs.small}/.git/index.lock`, "plain").action, "allow", "a git working in another repository does not");
    assert.equal(verdict("rm -f .git/index.lock", "small").action, "allow", "an unrelated owned fixture repository has no active writer");
    assert.equal(verdict("rm -f lib/a.mjs", "big").action, "allow");
  } finally { git.kill("SIGKILL"); }
  assert.ok(await until(() => verdict(`rm -f ${dirs.big}/.git/index.lock`, "plain").action === "allow"), "the git process has ended");
});

// --- what a harness projects -------------------------------------------------------------------

test("a node's projection references the owning source for Claude Code and Codex and copies no hook body", () => {
  const node = "/work/node dir";
  const control = hostResourceControl({ node });
  assert.deepEqual([...control.files.keys()], [".codex/hooks.json"], "only Codex's hooks.json is a projected file; no executable hook body is copied");
  assert.equal(control.source, fileURLToPath(new URL("../src/host-resource-hook.mjs", import.meta.url)));
  const [entry] = control.hooks.PreToolUse;
  assert.equal(entry.matcher, "Bash|Monitor");
  assert.equal(JSON.parse(control.files.get(".codex/hooks.json")).hooks.PreToolUse[0].matcher, "Bash");
  assert.deepEqual(entry.hooks.map((handler) => handler.type), ["command"]);
  assert.equal(entry.hooks[0].command, `${shellQuote(process.execPath)} ${shellQuote(control.source)}`);
  const codex = JSON.parse(control.files.get(".codex/hooks.json"));
  assert.equal(codex.hooks.PreToolUse[0].hooks[0].command, `${shellQuote(process.execPath)} ${shellQuote(control.source)} --provider codex`);
  assert.deepEqual([...hostResourceControl({ node, codex: false }).files.keys()], []);
  assert.deepEqual(hookEntries("/a b/it's.mjs", { node: "node" }).PreToolUse[0].hooks[0].command, "'node' '/a b/it'\\''s.mjs'");
});

test("run() answers a bare event the way the process does", () => {
  const direct = run(event("find / -name x"), { env });
  assert.equal(JSON.parse(direct).hookSpecificOutput.permissionDecision, "deny");
  assert.equal(run("nonsense", { env }), undefined);
});

// ---------------------------------------------------------------------------------------------
// Containment: a fake systemd-run records its arguments and runs what follows "--", and a real
// socket stands in for the user manager's bus, so the slice's placement is read without a systemd.
// ---------------------------------------------------------------------------------------------

const fakeBin = path.join(root, "fake-bin");
mkdirSync(fakeBin, { recursive: true });
writeFileSync(path.join(fakeBin, "systemd-run"), [
  "#!/bin/sh",
  '[ -z "$FAKE_SYSTEMD_RUN_LOG" ] || printf \'%s\\n\' "$*" >> "$FAKE_SYSTEMD_RUN_LOG"',
  // A user manager that has died behind its bus socket refuses the scope before running anything.
  '[ -z "$FAKE_SYSTEMD_RUN_FAIL" ] || { echo "Failed to start transient scope unit: Transport endpoint is not connected" >&2; exit 1; }',
  'while [ $# -gt 0 ] && [ "$1" != "--" ]; do shift; done',
  '[ $# -gt 0 ] || exit 0',
  "shift",
  'exec "$@"',
  "",
].join("\n"), { mode: 0o755 });
const OUTSIDE = "0::/non-systemd\n";
const INSIDE = `0::/user.slice/user-1000.slice/user@1000.service/agent.slice/${CONTAINMENT_SLICE}/run-r1.scope\n`;
const IN_WORK = `0::/user.slice/user-1000.slice/user@1000.service/agent.slice/${WORK_SLICE}/run-r2.scope\n`;
const shellEvent = (command, permission_mode, tool_name = "Bash") => ({ hook_event_name: "PreToolUse", cwd: dirs.plain, tool_name, permission_mode, tool_input: { command, description: "d" } });

async function withBus(work) {
  const runtime = mkdtempSync(path.join(root, "runtime-"));
  // AF_UNIX has a short address limit. Bind through the held descriptor of
  // this same owned fixture directory; the socket remains runtime/bus.
  const directory = openSync(runtime, constants.O_RDONLY | constants.O_DIRECTORY);
  const server = net.createServer();
  try {
    await new Promise((resolve, reject) => { server.once("error", reject); server.listen(`/proc/self/fd/${directory}/bus`, resolve); });
    try { return await work(runtime); } finally { await new Promise((resolve) => server.close(resolve)); }
  } finally { closeSync(directory); }
}

test("the work slice yields the CPU by weight and retains the 60% hard bound without a no-swap soft throttle; the sessions' slice is protected", () => {
  const limits = containmentLimits({ memory: 7748 * MiB });
  assert.deepEqual(limits, { CPUWeight: 20, MemoryMax: "4648M", MemorySwapMax: 0, TasksMax: 1024 });
  assert.deepEqual(sessionLimits({ memory: 7748 * MiB }), { CPUWeight: 50, MemoryLow: "774M" });
  assert.deepEqual(sessionLimits({ memory: 64 * 1024 * MiB }), { CPUWeight: 50, MemoryLow: "1536M" });
  const unit = sliceUnit(limits);
  assert.doesNotMatch(unit, /^MemoryHigh=/mu);
  assert.match(unit, /^\[Unit\]\nDescription=.+\n\n\[Slice\]\n/u);
  for (const [key, value] of Object.entries(limits)) assert.ok(unit.includes(`\n${key}=${value}\n`), key);
});

test("commands go to the work slice, from a session outside the slices or inside its own; a command already there is left alone", async () => {
  await withBus(async (runtime) => {
    const live = { ...env, XDG_RUNTIME_DIR: runtime, PATH: `${fakeBin}:${env.PATH}` };
    const slice = `--slice=${WORK_SLICE} --`;
    const answer = (input, cgroup = OUTSIDE, provider = "claude") => decide(input, { env: live, provider, cgroup })?.updatedInput?.command;
    // Without permission rules, every command is contained.
    assert.ok(answer(shellEvent("ls -la", "bypassPermissions")).includes(slice));
    // Except a line of removals only, which the harness's own removal check must read as written.
    const removal = ["r" + "m", "src/old.mjs"].join(" ");
    assert.equal(answer(shellEvent(removal, "bypassPermissions")), undefined);
    assert.equal(answer(shellEvent(`${"r" + "mdir"} a/b && ${"r" + "mdir"} a`, "bypassPermissions")), undefined);
    assert.ok(answer(shellEvent(`${removal}; ls -la`, "bypassPermissions")).includes(slice), "a removal beside other work is contained");
    // With them, only a watch, so no allow rule stops matching an ordinary command.
    assert.equal(answer(shellEvent("ls -la", "default")), undefined);
    assert.equal(answer(shellEvent("git fetch origin", "default")), undefined);
    assert.ok(answer(shellEvent("git fetch origin; sleep 60", "default", "Monitor")).includes(slice));
    // A session inside its own slice still sends its commands to the work slice, so a command's memory never counts against it.
    assert.ok(answer(shellEvent("git fetch origin", "bypassPermissions"), INSIDE).includes(slice));
    // Already inside the work slice: left alone.
    assert.equal(answer(shellEvent("ls -la", "bypassPermissions"), IN_WORK), undefined);
    assert.equal(answer(shellEvent("git fetch origin", "bypassPermissions"), IN_WORK), undefined);
    // Never for an allow-list session or for Codex; a denial still wins.
    assert.equal(answer(shellEvent("git fetch origin", "dontAsk")), undefined);
    assert.equal(answer(shellEvent("git fetch origin", "bypassPermissions"), OUTSIDE, "codex"), undefined);
    // The rewrite carries every other tool input field over and takes no permission decision.
    const carried = decide({ ...shellEvent("ls -la", "bypassPermissions"), tool_input: { command: "ls -la", description: "d", timeout: 300000, run_in_background: false } }, { env: live, cgroup: OUTSIDE });
    assert.equal(carried.permissionDecision, undefined);
    assert.deepEqual({ ...carried.updatedInput, command: undefined }, { command: undefined, description: "d", timeout: 300000, run_in_background: false });
    assert.ok(carried.updatedInput.command.includes("ls -la"), "the command is carried verbatim");
    assert.equal(decide(shellEvent("ls", "bypassPermissions", "Monitor"), { env: live, provider: "codex", cgroup: OUTSIDE }), undefined);
    assert.equal(decide(shellEvent("ls", "bypassPermissions"), { env: { ...live, AGENT_CONTAINMENT: "off" }, cgroup: OUTSIDE }), undefined);
    assert.equal(decide(shellEvent("find / -name x", "bypassPermissions"), { env: live, cgroup: OUTSIDE }).permissionDecision, "deny");
  });
  // No user manager to reach: the command is left as it was.
  assert.equal(decide(shellEvent("ls -la", "bypassPermissions"), { env: { ...env, XDG_RUNTIME_DIR: root, PATH: `${fakeBin}:${env.PATH}` }, cgroup: OUTSIDE }), undefined);
});

test("a contained command keeps its output, exit status and the directory it ends in", { timeout: 60_000 }, () => {
  const log = path.join(root, "systemd-run.log");
  const runtime = mkdtempSync(path.join(root, "contained-"));
  const script = `cd ${shellQuote(dirs.plain)}; ${containedCommand(`printf '%s\\n' "it's inside"; cd /; exit 3`)}; echo "rc=$? dir=$(pwd)"`;
  const result = spawnSync("bash", ["-c", script], { encoding: "utf8", env: { ...process.env, PATH: `${fakeBin}:${process.env.PATH}`, XDG_RUNTIME_DIR: runtime, FAKE_SYSTEMD_RUN_LOG: log } });
  assert.equal(result.stdout, "it's inside\nrc=3 dir=/\n", result.stderr);
  assert.match(readFileSync(log, "utf8"), new RegExp(`^--user --scope --quiet --collect --slice=${WORK_SLICE} -- bash -c `, "u"));
  assert.deepEqual(readdirSync(runtime), [], "the directory record is removed");
});

test("a scope the user manager cannot start still runs the command, once, uncontained", { timeout: 60_000 }, () => {
  const runtime = mkdtempSync(path.join(root, "contained-down-"));
  const script = `cd ${shellQuote(dirs.plain)}; ${containedCommand(`printf '%s\\n' "it ran"; cd /; exit 3`)}; echo "rc=$? dir=$(pwd)"`;
  const result = spawnSync("bash", ["-c", script], { encoding: "utf8", env: { ...process.env, PATH: `${fakeBin}:${process.env.PATH}`, XDG_RUNTIME_DIR: runtime, FAKE_SYSTEMD_RUN_FAIL: "1" } });
  assert.equal(result.stdout, "it ran\nrc=3 dir=/\n", result.stderr);
  assert.match(result.stderr, /Failed to start transient scope unit/u, "the refusal is still shown");
  assert.deepEqual(readdirSync(runtime), [], "the directory record and the start marker are removed");
});

test("a command killed inside its scope is not run a second time", { timeout: 60_000 }, () => {
  const runtime = mkdtempSync(path.join(root, "contained-killed-"));
  const script = `${containedCommand(`printf '%s\\n' once; kill -9 $$`)}; echo "rc=$?"`;
  const result = spawnSync("bash", ["-c", script], { encoding: "utf8", env: { ...process.env, PATH: `${fakeBin}:${process.env.PATH}`, XDG_RUNTIME_DIR: runtime } });
  assert.equal(result.stdout, "once\nrc=137\n", result.stderr);
  assert.deepEqual(readdirSync(runtime), []);
});

test("the launcher starts the executable it is handed inside the slice, or directly where it cannot", { skip: !existsSync("/proc/self/cgroup"), timeout: 60_000 }, async () => {
  const launcher = path.join(root, "claude-contained");
  writeFileSync(launcher, launcherScript(), { mode: 0o755 });
  const log = path.join(root, "launcher.log");
  const inside = isContained(readFileSync("/proc/self/cgroup", "utf8"));
  await withBus(async (runtime) => {
    const result = spawnSync(launcher, ["/bin/echo", "a", "b c"], { encoding: "utf8", env: { ...process.env, PATH: `${fakeBin}:${process.env.PATH}`, XDG_RUNTIME_DIR: runtime, FAKE_SYSTEMD_RUN_LOG: log } });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, "a b c\n");
    const calls = existsSync(log) ? readFileSync(log, "utf8") : "";
    if (inside) assert.equal(calls, "", "already inside the slice, so started directly");
    else assert.match(calls, new RegExp(`--slice=${CONTAINMENT_SLICE} -- /bin/echo a b c\\n$`, "u"));
  });
  const bare = spawnSync(launcher, ["/bin/echo", "ok"], { encoding: "utf8", env: { ...process.env, XDG_RUNTIME_DIR: path.join(root, "no-runtime") } });
  assert.equal(bare.stdout, "ok\n");
  if (!inside) assert.match(bare.stderr, /runs uncontained/u);
});

// ---------------------------------------------------------------------------------------------
// Mass deletion (2026-10-19): `gh pr merge` of a PR that removes most of a repository, and `git commit -a`
// in a partial working tree, are refused. Parameters: LIMITS.massDeletion, derived in
// content/requirements/the-agent-harness-refuses-mass-deletion.json.
// ---------------------------------------------------------------------------------------------

/** A fake `gh`: answers `pr view`, `api .../pulls/N/files` (statuses) and `api .../git/trees/...` from `pr`; records the calls. */
function fakeGh({ changedFiles = 3, removed = 0, baseFiles = 100, body = "", state = "OPEN", number = 7, slug = "example/repo", fail = false, garbage = false } = {}) {
  const calls = [];
  const run = (command, args) => {
    calls.push([command, ...args]);
    if (fail) return { status: null, stdout: "" };
    if (garbage) return { status: 0, stdout: "<<not json>>" };
    if (command !== "gh") return { status: 1, stdout: "" };
    if (args[0] === "pr" && args[1] === "view") return { status: 0, stdout: JSON.stringify({ number, url: `https://github.com/${slug}/pull/${number}`, state, baseRefName: "main", changedFiles, deletions: removed * 10, body }) };
    const files = /pulls\/\d+\/files\?per_page=100&page=(\d+)/u.exec(args[1] ?? "");
    if (files) {
      const page = Number(files[1]);
      const first = (page - 1) * 100;
      const statuses = Array.from({ length: Math.max(0, Math.min(100, changedFiles - first)) }, (_, k) => (first + k < removed ? "removed" : "modified"));
      return { status: 0, stdout: statuses.length ? `${statuses.join("\n")}\n` : "" };
    }
    if (/git\/trees\//u.test(args[1] ?? "")) return { status: 0, stdout: `${baseFiles}\tfalse\n` };
    return { status: 1, stdout: "" };
  };
  return { run, calls };
}
const merge = (command, gh, extraEnv = {}) => classify(command, { cwd: dirs.plain, env: { ...env, ...extraEnv }, home, run: gh.run });

test("the mass-deletion parameters are the measured ones, and the rule needs both a count and a share", () => {
  assert.deepEqual({ share: LIMITS.massDeletion.share, minFiles: LIMITS.massDeletion.minFiles }, { share: 0.5, minFiles: 10 });
  assert.equal(isMassDeletion(12, 13), true);   // the smallest incident: a 13-file repository
  assert.equal(isMassDeletion(2, 4), false);    // a legitimate tiny removal
  assert.equal(isMassDeletion(200, 3474), false); // a legitimate 6% retirement
  assert.equal(isMassDeletion(31084, 22421), true);
  assert.equal(massDeletionMarker("body\nmass-deletion-intended: extraction of the x subtree\n"), "extraction of the x subtree");
  assert.equal(massDeletionMarker("> **Mass-Deletion-Intended:** moved"), "moved");
  assert.equal(massDeletionMarker("mass-deletion-intended:   \n"), undefined);
  assert.equal(massDeletionMarker("- mass-deletion-intended: moved"), "moved");
});

test("gh pr merge of a PR that deletes most of its repository is denied, with the way out in the reason", () => {
  const gh = fakeGh({ changedFiles: 136, removed: 135, baseFiles: 136 });
  const verdict = merge("gh pr merge 8 --squash", gh);
  assert.equal(verdict.action, "deny");
  assert.match(verdict.reason, /example\/repo#7 removes 135 of the 136 files/u);
  assert.match(verdict.reason, /mass-deletion-intended: <reason>/u);
  assert.deepEqual(gh.calls[0].slice(0, 4), ["gh", "pr", "view", "8"]);
});

test("a very large PR is judged from a sample of its files, projected over changedFiles", () => {
  const gh = fakeGh({ changedFiles: 31_084, removed: 31_084, baseFiles: 22_421 });
  const verdict = merge("gh pr merge https://github.com/example/repo/pull/7", gh);
  assert.equal(verdict.action, "deny");
  assert.match(verdict.reason, /removes about 31084 of the 22421 files/u);
  assert.equal(gh.calls.filter((call) => /\/files\?/u.test(call[2] ?? "")).length, 3, "300 files are read, not 31,084");
});

test("an ordinary PR is allowed after one gh call; a PR changing few files is never read further", () => {
  const small = fakeGh({ changedFiles: 9, removed: 9, baseFiles: 9 });
  assert.equal(merge("gh pr merge 7", small).action, "allow");
  assert.equal(small.calls.length, 1);
  const ordinary = fakeGh({ changedFiles: 400, removed: 20, baseFiles: 5_000 });
  assert.equal(merge("gh pr merge 7 --squash --delete-branch", ordinary).action, "allow");
  const big = fakeGh({ changedFiles: 400, removed: 20, baseFiles: 30 });
  assert.equal(merge("gh pr merge 7", big).action, "deny", "20 of 30 files is a mass of the repository however few files it is");
});

test("a mass-deletion-intended marker with a reason in the PR body allows the merge without reading the files", () => {
  const gh = fakeGh({ changedFiles: 500, removed: 500, baseFiles: 500, body: "Extracts the subtree.\n\nmass-deletion-intended: the subtree moved to its own repository (extract-submodule --land)\n" });
  assert.equal(merge("gh pr merge 7 --squash", gh).action, "allow");
  assert.equal(gh.calls.length, 1);
  assert.equal(merge("gh pr merge 7", fakeGh({ changedFiles: 500, removed: 500, baseFiles: 500, body: "mass-deletion-intended:" })).action, "deny");
});

test("the merge guard fails open: no gh, a timeout, garbage, a closed PR, an unknown selector, or switched off", () => {
  assert.equal(merge("gh pr merge 7", fakeGh({ fail: true })).action, "allow");
  assert.equal(merge("gh pr merge 7", fakeGh({ garbage: true })).action, "allow");
  assert.equal(merge("gh pr merge 7", fakeGh({ changedFiles: 500, removed: 500, baseFiles: 500, state: "MERGED" })).action, "allow");
  const dynamic = fakeGh({ changedFiles: 500, removed: 500, baseFiles: 500 });
  assert.equal(merge('gh pr merge "$url"', dynamic).action, "allow");
  assert.equal(dynamic.calls.length, 0);
  assert.equal(merge("gh pr merge 7", fakeGh({ changedFiles: 500, removed: 500, baseFiles: 500 }), { AGENT_MERGE_GUARD: "off" }).action, "allow");
  // the real runner with no gh on PATH
  assert.equal(classify("gh pr merge 7", { cwd: dirs.plain, env: { ...env, PATH: "/nonexistent" }, home }).action, "allow");
});

test("repository and selector forms are read as gh reads them: -R, a URL, flags with values, gh api PUT .../merge", () => {
  const withRepo = fakeGh({ changedFiles: 50, removed: 50, baseFiles: 50 });
  assert.equal(merge("gh pr merge -R example/repo --squash --subject 'Fix a thing' 7", withRepo).action, "deny");
  assert.deepEqual(withRepo.calls[0].slice(0, 6), ["gh", "pr", "view", "7", "-R", "example/repo"]);
  const viaApi = fakeGh({ changedFiles: 50, removed: 50, baseFiles: 50, number: 7 });
  assert.equal(merge("gh api -X PUT repos/example/repo/pulls/7/merge -f merge_method=squash", viaApi).action, "deny");
  assert.equal(merge("gh api repos/example/repo/pulls/7", fakeGh({ changedFiles: 50, removed: 50, baseFiles: 50 })).action, "allow");
  assert.equal(merge("cd /tmp && gh pr merge 7 && echo done", fakeGh({ changedFiles: 50, removed: 50, baseFiles: 50 })).action, "deny");
});

test("the real runner reads the answer through gh within the hook's budget", { skip: spawnSync("sh", ["-c", "command -v gh"]).status !== 0 }, () => {
  const bin = path.join(root, "bin-gh");
  mkdirSync(bin, { recursive: true });
  writeFileSync(path.join(bin, "gh"), `#!/bin/sh
case "$1 $2" in
  "pr view") echo '{"number":7,"url":"https://github.com/example/repo/pull/7","state":"OPEN","baseRefName":"main","changedFiles":40,"deletions":900,"body":""}' ;;
  "api repos/example/repo/pulls/7/files?per_page=100&page=1") i=0; while [ $i -lt 40 ]; do echo removed; i=$((i+1)); done ;;
  api*) case "$2" in *git/trees*) printf '40\\tfalse\\n' ;; *) exit 1 ;; esac ;;
esac
`, { mode: 0o755 });
  const started = Date.now();
  const output = run(JSON.stringify({ tool_name: "Bash", tool_input: { command: "gh pr merge 7" }, cwd: dirs.plain }), { env: { ...env, PATH: `${bin}:${env.PATH}` } });
  assert.match(JSON.parse(output).hookSpecificOutput.permissionDecisionReason, /removes 40 of the 40 files/u);
  assert.ok(Date.now() - started < LIMITS.massDeletion.budgetMilliseconds);
});

// A real repository for the partial-working-tree cases.
const gitIdentity = { ...process.env, GIT_AUTHOR_NAME: "Fixture", GIT_AUTHOR_EMAIL: "f@example.invalid", GIT_COMMITTER_NAME: "Fixture", GIT_COMMITTER_EMAIL: "f@example.invalid", GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null" };
const sh = (cwd, ...args) => { const r = spawnSync("git", args, { cwd, encoding: "utf8", env: gitIdentity }); assert.equal(r.status, 0, r.stderr); return r.stdout; };
function sourceRepository(name, files = 20) {
  const dir = path.join(root, "partial", name);
  mkdirSync(dir, { recursive: true });
  sh(dir, "init", "-q", "--initial-branch=main");
  for (let i = 0; i < files; i += 1) { mkdirSync(path.join(dir, "src"), { recursive: true }); writeFileSync(path.join(dir, "src", `m${i}.mjs`), `export const n = ${i};\n`); }
  writeFileSync(path.join(dir, "package.json"), "{}\n");
  sh(dir, "add", "--all"); sh(dir, "commit", "-qm", "base");
  return dir;
}
const partial = (command, dir) => classify(command, { cwd: dir, env, home });

test("git commit -a and git add -A|-u are denied in a --no-checkout clone where tracked files are absent", () => {
  const origin = sourceRepository("origin");
  const dir = path.join(root, "partial", "clone");
  sh(root, "clone", "-q", "--no-checkout", origin, dir);
  sh(dir, "read-tree", "HEAD");
  sh(dir, "checkout-index", "-f", "--", "package.json");
  for (const command of ["git commit -am wip", "git commit -qam 'repair'", "git commit --all -m x", "git add -A", "git add -u", "git add --all", "git add -u .", "git -C . commit -a -m x"]) {
    const verdict = partial(command, dir);
    assert.equal(verdict.action, "deny", command);
    assert.match(verdict.reason, /20 of 21 tracked files are missing/u);
    assert.match(verdict.reason, /git add -- <path>/u);
  }
  // what the incident should have done, and anything that does not stage absences
  for (const command of ["git add -- package.json", "git add package.json", "git commit -m wip", "git commit -qm 'fix a thing'", "git add -u -- src", "git status -- package.json", "git commit -m'-a'"]) {
    assert.equal(partial(command, dir).action, "allow", command);
  }
});

test("git commit -a is denied when core.sparseCheckout is set, and allowed in a complete working tree, even after a deletion", () => {
  const sparse = sourceRepository("sparse");
  sh(sparse, "config", "core.sparseCheckout", "true");
  const verdict = partial("git commit -am wip", sparse);
  assert.equal(verdict.action, "deny");
  assert.match(verdict.reason, /core\.sparseCheckout is set/u);
  const whole = sourceRepository("whole");
  assert.equal(partial("git commit -am wip", whole).action, "allow");
  assert.equal(partial("git add -A", whole).action, "allow");
  rmSync(path.join(whole, "src", "m0.mjs"));
  assert.equal(partial("git commit -am 'remove one file'", whole).action, "allow", "one deleted file is not a mass");
  for (let i = 0; i < 12; i += 1) rmSync(path.join(whole, "src", `m${i + 1}.mjs`));
  assert.equal(partial("git commit -am 'remove thirteen files'", whole).action, "deny", "13 of 21 tracked files absent is more than half of the repository");
});

test("the partial-worktree check is bounded: where git cannot answer in time the commit is allowed", () => {
  const dir = sourceRepository("slow");
  const calls = [];
  const never = (command, args) => { calls.push([command, ...args]); return { status: null, stdout: "", truncated: false }; };
  assert.equal(classify("git commit -am wip", { cwd: dir, env, home, run: never }).action, "allow");
  assert.ok(calls.length >= 1 && calls.every((call) => call[0] === "git"));
  // a deleted list longer than the buffer is a mass whatever its length
  const overflow = (command, args) => (args.includes("config") ? { status: 1, stdout: "" } : { status: null, stdout: "a\0b\0", truncated: true });
  assert.equal(classify("git commit -am wip", { cwd: dir, env, home, run: overflow }).action, "deny");
  assert.ok(LIMITS.massDeletion.worktreeMilliseconds + LIMITS.massDeletion.worktreeMilliseconds < 15_000);
});
