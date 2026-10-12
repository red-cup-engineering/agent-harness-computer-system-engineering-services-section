// host-resource-hook.test: the PreToolUse controller that denies runaway commands and runs the heavy
// ones one at a time under a host-wide kernel lock. Classification is a table over real fixture
// repositories (a `.git/index` of the size that makes a repository large); serialization is shown by
// running the hook's own rewrite concurrently and reading the order it admitted them in.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import net from "node:net";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, truncateSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { BUSY_EXIT_CODE, CONTAINMENT_SLICE, classify, containedCommand, containmentLimits, decide, hookEntries, hostResourceControl, hookSource, isContained, launcherScript, lockPath, parseShell, run, shellQuote, sliceUnit, waitSeconds } from "../src/host-resource-hook.mjs";

const HOOK = fileURLToPath(new URL("../src/host-resource-hook.mjs", import.meta.url));
const MiB = 1024 * 1024;
const haveFlock = spawnSync("flock", ["--version"]).status === 0;

const root = realpathSync(mkdtempSync(path.join(tmpdir(), "host-resource-hook-")));
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
mkdirSync(dirs.plain, { recursive: true });
mkdirSync(dirs.sub, { recursive: true });
// A linked worktree keeps a `.git` file naming the git directory that holds its index.
mkdirSync(dirs.linked, { recursive: true });
mkdirSync(path.join(root, "gitdirs", "linked"), { recursive: true });
writeFileSync(path.join(root, "gitdirs", "linked", "index"), "");
truncateSync(path.join(root, "gitdirs", "linked", "index"), 6 * MiB);
writeFileSync(path.join(dirs.linked, ".git"), `gitdir: ${path.join(root, "gitdirs", "linked")}\n`);

const lock = path.join(root, "run", "agent-heavy.lock");
const env = { HOME: home, PATH: process.env.PATH, AGENT_HEAVY_LOCK: lock };
process.on("exit", () => rmSync(root, { recursive: true, force: true }));

const verdict = (command, cwd = "plain") => classify(command, { cwd: dirs[cwd] ?? cwd, env, home });

// [command, cwd, expected action, a piece of the denial reason when it is a deny]
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
  ["git worktree add ../w", "plain", "deny", "blobless sparse clone"],
  ["git worktree add -b topic ../w HEAD", "small", "deny"],
  ["git worktree list", "plain", "allow"],
  ["git worktree remove ../w", "plain", "allow"],
  // git clone: only into a scratchpad/tmp directory, and then under the lock
  ["git clone https://example.com/o/r.git", "srv", "deny", "outside a scratchpad/tmp"],
  ["git clone https://example.com/o/r.git ./r", "srv", "deny"],
  ["git clone -b main --depth 1 https://example.com/o/r.git /srv/work/x", "srv", "deny"],
  ["gh repo clone o/r", "srv", "deny"],
  ["git clone --filter=blob:none --sparse --depth=50 https://example.com/o/r.git", "srvScratch", "serialize"],
  ["git clone https://example.com/o/r.git /tmp/r", "srv", "serialize"],
  ["git clone --depth 1 -b main git@example.com:o/r.git /var/tmp/r", "srv", "serialize"],
  ["gh repo clone o/r", "srvScratch", "serialize"],
  ["gh repo clone o/r -- --depth=1", "srvScratch", "serialize"],
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
  ["git submodule update --init --recursive -- deps/x", "big", "serialize"],
  ["git submodule update --init", "sub", "serialize"],
  ["git submodule update --init --recursive", "small", "serialize"],
  ["git submodule sync", "big", "serialize"],
  ["git submodule status", "big", "allow"],
  // gh commands that read the local checkout run an implicit git status of it
  ["gh pr create --title t --body b", "big", "serialize"],
  ["gh pr checkout 12", "big", "serialize"],
  ["gh pr status", "sub", "serialize"],
  ["gh pr diff 3", "big", "serialize"],
  ["gh repo sync", "big", "serialize"],
  ["gh pr create --title t -R o/r", "big", "allow"],
  ["gh pr create --repo=o/r --title t", "big", "allow"],
  ["gh pr create -Ro/r", "big", "allow"],
  ["gh pr create --title t", "small", "allow"],
  ["gh pr create --title t", "plain", "allow"],
  ["gh pr view 3", "big", "allow"],
  ["gh pr list", "big", "allow"],
  ["gh api repos/o/r/pulls", "big", "allow"],
  ["gh pr merge 3 -R o/r", "big", "allow"],
  // heavy git: always under the lock; a large repository's whole-tree work too
  ["git fetch origin", "small", "serialize"],
  ["git push origin main", "small", "serialize"],
  ["git pull --ff-only", "small", "serialize"],
  ["git gc --aggressive", "small", "serialize"],
  ["git repack -ad", "small", "serialize"],
  ["git archive HEAD -o /tmp/x.tar", "small", "serialize"],
  ["git ls-tree -r HEAD", "small", "serialize"],
  ["git ls-tree -rl HEAD lib", "small", "serialize"],
  ["git cat-file --batch-check", "small", "serialize"],
  ["git rev-list --all --objects", "small", "serialize"],
  ["git -c core.x=1 -C . fetch --all", "small", "serialize"],
  ["git diff", "big", "serialize"],
  ["git grep foo", "big", "serialize"],
  ["git add -A", "big", "serialize"],
  ["git add .", "big", "serialize"],
  ["git commit -am wip", "big", "serialize"],
  ["git checkout main", "big", "serialize"],
  ["git stash", "big", "serialize"],
  ["git reset --hard", "big", "serialize"],
  ["git log --all -- lib", "big", "serialize"],
  ["git ls-files", "sub", "serialize"],
  ["git diff --stat -- lib", "big", "allow"],
  ["git diff HEAD~1 HEAD", "big", "allow"],
  ["git diff main..topic", "big", "allow"],
  ["git diff --cached", "big", "allow"],
  ["git grep foo -- lib", "big", "allow"],
  ["git add lib/a.mjs", "big", "allow"],
  ["git commit -m wip", "big", "allow"],
  ["git diff", "small", "allow"],
  ["git grep foo", "small", "allow"],
  ["git ls-tree HEAD lib", "big", "allow"],
  ["git cat-file -p HEAD", "big", "allow"],
  ["git log -n 5", "plain", "allow"],
  ["git show HEAD", "big", "allow"],
  ["git branch --show-current", "big", "allow"],
  ["git rev-parse HEAD", "big", "allow"],
  // recursive reads of a large tree
  ["rg foo", "big", "serialize"],
  ["rg --files", "big", "serialize"],
  [`rg foo ${home}`, "plain", "serialize"],
  ["rg -n -e foo -g '*.mjs'", "big", "serialize"],
  ["grep -rn foo .", "big", "serialize"],
  ["grep -r foo ~", "plain", "serialize"],
  ["grep -R foo /", "plain", "serialize"],
  ["fd mjs", "big", "serialize"],
  [`ls -R ${home}`, "plain", "serialize"],
  ["rg foo lib", "big", "allow"],
  ["rg foo", "small", "allow"],
  ["rg foo --max-depth 2", "big", "allow"],
  ["git log | rg foo", "big", "allow"],
  ["grep foo notes.txt", "big", "allow"],
  ["grep -rn foo lib", "big", "allow"],
  ["ls -la", "big", "allow"],
  // disk- and CPU-heavy tools
  ["du -sh .", "plain", "serialize"],
  ["tar czf a.tgz b", "plain", "serialize"],
  ["rsync -a a/ b/", "plain", "serialize"],
  ["npm install", "plain", "serialize"],
  ["npm i left-pad", "plain", "serialize"],
  ["pnpm install --frozen-lockfile", "plain", "serialize"],
  ["pnpm --filter x install", "plain", "serialize"],
  ["pnpm -r add y", "plain", "serialize"],
  ["yarn", "plain", "serialize"],
  ["pip install x", "plain", "serialize"],
  ["uv sync", "plain", "serialize"],
  ["guix build hello", "plain", "serialize"],
  ["guix pull", "plain", "serialize"],
  ["guix shell hello -- hello", "plain", "serialize"],
  ["lake build", "plain", "serialize"],
  ["cargo build --release", "plain", "serialize"],
  ["cargo +nightly test", "plain", "serialize"],
  ["make -j4", "plain", "serialize"],
  ["docker build .", "plain", "serialize"],
  ["bash -c 'tar xf a.tar'", "plain", "serialize"],
  ["ls && tar tf x.tar", "plain", "serialize"],
  ["nice -n 5 tar xf a.tar", "plain", "serialize"],
  ["sudo du -sh /", "plain", "serialize"],
  ["time cargo check", "plain", "serialize"],
  ["npm test", "plain", "allow"],
  ["npm run build", "plain", "allow"],
  ["pnpm run test", "plain", "allow"],
  ["cargo --version", "plain", "allow"],
  ["lake --version", "plain", "allow"],
  ["guix --version", "plain", "allow"],
  ["make --version", "plain", "allow"],
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

test("a command already under the heavy lock, or run inside it, is not wrapped again", () => {
  assert.equal(verdict(`flock ${lock} du -sh .`).locked, true);
  assert.equal(decide({ tool_name: "Bash", cwd: dirs.plain, tool_input: { command: `flock -w 5 ${lock} tar xf a.tar` } }, { env, home }), undefined);
  assert.equal(decide({ tool_name: "Bash", cwd: dirs.plain, tool_input: { command: "tar xf a.tar" } }, { env: { ...env, AGENT_HEAVY_LOCK_HELD: "1" }, home }), undefined);
});

test("a clone into the user's home, or the tmp-named directory of a working tree, is judged by its resolved path", () => {
  const user = { env: { ...env, HOME: "/home/someone" }, home: "/home/someone" };
  assert.equal(classify("git clone https://example.com/o/r.git $HOME/code/r", { cwd: "/srv/work/proj", ...user }).action, "deny");
  assert.equal(classify("git clone https://example.com/o/r.git ~/code/r", { cwd: "/srv/work/proj", ...user }).action, "deny");
  assert.equal(classify("git clone https://example.com/o/r.git ../../../tmp/r", { cwd: "/srv/work/proj", ...user }).action, "serialize");
  assert.equal(classify("git clone https://example.com/o/r.git ../r", { cwd: "/srv/work/scratchpad/harness", ...user }).action, "serialize");
  assert.equal(classify("git clone https://example.com/o/r.git /home/someone/.cache/scratch/r", { cwd: "/srv/work/proj", ...user }).action, "serialize");
});

test("a session confined to an allow-list is denied what is runaway but never rewritten", () => {
  const confined = (command) => decide({ tool_name: "Bash", cwd: dirs.big, permission_mode: "dontAsk", tool_input: { command } }, { env, home });
  assert.equal(confined("git status").permissionDecision, "deny");
  assert.equal(confined("git grep foo"), undefined);
  assert.equal(confined("git log -n 3"), undefined);
});

test("a deny still applies under the lock", () => {
  assert.equal(verdict(`flock ${lock} find / -name x`).action, "deny");
  assert.equal(verdict(`flock -w 5 -E 75 ${lock} bash -c 'find / -name x'`).action, "deny");
  assert.equal(verdict(`flock ${lock} -c 'find / -name x'`).action, "deny");
});

test("gh on a large checkout is serialized with the way around it in the reason", () => {
  const result = verdict("gh pr create --title t", "big");
  assert.equal(result.action, "serialize");
  assert.match(result.heavy[0], /implicit git status/u);
  assert.match(result.heavy[0], /gh api, or -R owner\/repo, avoids/u);
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

test("a heavy command is rewritten with every other tool input field carried over", { skip: !haveFlock }, () => {
  const result = hook(event("du -sh .", { description: "size", timeout: 300000, run_in_background: false }));
  assert.equal(result.status, 0);
  const { updatedInput, permissionDecision } = JSON.parse(result.stdout).hookSpecificOutput;
  assert.equal(permissionDecision, undefined, "Claude Code applies updatedInput without taking over the permission decision");
  assert.deepEqual({ ...updatedInput, command: undefined }, { command: undefined, description: "size", timeout: 300000, run_in_background: false });
  assert.match(updatedInput.command, /flock -w 290 -E 75 /u);
  assert.match(updatedInput.command, /nice -n 10 \$_ah_io flock /u);
  assert.match(updatedInput.command, /_ah_io='ionice -c3'/u);
  assert.ok(updatedInput.command.includes(shellQuote("du -sh .")));
  assert.ok(existsSync(lock), "the hook created the lock file");
});

test("for Codex the rewrite carries the explicit allow its contract requires", { skip: !haveFlock }, () => {
  const result = hook(event("du -sh ."), env, ["--provider", "codex"]);
  const output = JSON.parse(result.stdout).hookSpecificOutput;
  assert.equal(output.permissionDecision, "allow");
  assert.equal(typeof output.updatedInput.command, "string");
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

test("the hook fails open without flock, with an unwritable lock, and when switched off", () => {
  assert.equal(hook(event("du -sh ."), { ...env, PATH: "/nonexistent" }).stdout, "");
  assert.equal(hook(event("find / -name x"), { ...env, AGENT_HOST_GUARD: "off" }).stdout, "");
  // A lock under /proc once sent node's recursive mkdir into an endless loop at full CPU.
  for (const unwritable of ["/proc/no-such-dir/agent-heavy.lock", "/proc/self/no/such/dir/agent-heavy.lock", "/sys/no-such-dir/agent-heavy.lock", "/dev/null/agent-heavy.lock"]) {
    const started = Date.now();
    const result = spawnSync(process.execPath, [HOOK], { input: event("du -sh ."), env: { ...env, AGENT_HEAVY_LOCK: unwritable }, encoding: "utf8", timeout: 20_000 });
    assert.equal(result.signal, null, `${unwritable} hung the hook for ${Date.now() - started} ms`);
    assert.equal(result.status, 0);
    assert.equal(result.stdout, "");
  }
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
  test(`on ${kind} stdin the hook exits 0 with no output, within 50 ms of node's own start-up`, { timeout: 120_000 }, () => {
    const baseline = fastest(launch, ["-e", ""], 4);
    const hooked = fastest(launch, [HOOK], 4);
    process.stderr.write(`# ${kind} stdin: node alone ${baseline.toFixed(1)} ms, hook ${hooked.toFixed(1)} ms\n`);
    assert.ok(hooked - baseline < 50, `${kind}: the hook took ${(hooked - baseline).toFixed(1)} ms over node's ${baseline.toFixed(1)} ms start-up`);
    if (baseline < 40) assert.ok(hooked < 50, `${kind}: ${hooked.toFixed(1)} ms in all`);
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

test("a harness's other settings do not change the command language: unknown variables and unknown cwd never deny", () => {
  assert.equal(classify("find $NOPE -name x", { cwd: dirs.plain, env, home }).action, "allow");
  assert.equal(classify("find . -name x", { env, home }).action, "allow");
  assert.equal(classify("git clone https://example.com/o/r.git $DEST", { cwd: dirs.srv, env, home }).action, "serialize");
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

test("a lock path is the user's runtime directory, else the state directory, unless named", () => {
  assert.equal(lockPath({ AGENT_HEAVY_LOCK: "/x/y.lock" }), "/x/y.lock");
  assert.equal(lockPath({ XDG_RUNTIME_DIR: root }), path.join(root, "agent-heavy.lock"));
  assert.equal(lockPath({ XDG_RUNTIME_DIR: "/nonexistent", XDG_STATE_HOME: "/s" }, -1), "/s/agent-harness/agent-heavy.lock");
  assert.equal(waitSeconds({ timeout: 600000 }, {}), 590);
  assert.equal(waitSeconds({}, {}), 110);
  assert.equal(waitSeconds({ timeout: 1000 }, {}), 20);
  assert.equal(waitSeconds({ timeout: 600000 }, { AGENT_HEAVY_WAIT_SECONDS: "3" }), 3);
});

// --- the lock itself ---------------------------------------------------------------------------

const rewritten = (command, hookEnv = env) => {
  const result = hook(event(command), hookEnv);
  const output = JSON.parse(result.stdout).hookSpecificOutput;
  return output.updatedInput.command;
};
const exited = (child) => new Promise((resolve) => {
  let stderr = "";
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  child.on("close", (code) => resolve({ code, stderr }));
});
const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
// `flock lock sleep N` forks sleep, which inherits the lock: the holder is the pair, so it is killed as a group.
const holdLock = (seconds) => spawn("flock", [lock, "sleep", String(seconds)], { stdio: "ignore", detached: true });
const killGroup = (child) => { try { process.kill(-child.pid, "SIGKILL"); } catch { /* already gone */ } };
const lockHeld = () => spawnSync("flock", ["-n", lock, "true"]).status !== 0;
// Wait for a fact about another process rather than for a guessed time: a busy host starts processes late.
const until = async (predicate, timeout = 15_000) => {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) { if (predicate()) return true; await sleep(50); }
  return predicate();
};

test("three heavy commands started together run one after another under the hook's lock", { skip: !haveFlock, timeout: 120_000 }, async () => {
  const log = path.join(root, "serial.log");
  writeFileSync(log, "");
  const original = `du -s /dev/null >/dev/null; echo "start $$" >> ${shellQuote(log)}; sleep 0.4; echo "end $$" >> ${shellQuote(log)}`;
  const wrapped = rewritten(original, { ...env, AGENT_HEAVY_WAIT_SECONDS: "60" });
  const children = [1, 2, 3].map(() => spawn("bash", ["-c", wrapped], { env, stdio: ["ignore", "ignore", "pipe"] }));
  const results = await Promise.all(children.map(exited));
  assert.deepEqual(results.map((result) => result.code), [0, 0, 0], results.map((result) => result.stderr).join());
  const lines = readFileSync(log, "utf8").trim().split("\n");
  assert.equal(lines.length, 6);
  for (let pair = 0; pair < 3; pair += 1) {
    const [start, pid] = lines[2 * pair].split(" ");
    assert.equal(start, "start");
    assert.equal(lines[2 * pair + 1], `end ${pid}`, `run ${pair} ended before the next began: ${lines.join(" | ")}`);
  }
  assert.equal(new Set(lines.map((line) => line.split(" ")[1])).size, 3);
});

test("the same three commands without the lock overlap, so the test can see overlap", { skip: !haveFlock, timeout: 120_000 }, async () => {
  const log = path.join(root, "free.log");
  writeFileSync(log, "");
  const original = `echo "start $$" >> ${shellQuote(log)}; sleep 0.4; echo "end $$" >> ${shellQuote(log)}`;
  const results = await Promise.all([1, 2, 3].map(() => exited(spawn("bash", ["-c", original], { env, stdio: ["ignore", "ignore", "pipe"] }))));
  assert.deepEqual(results.map((result) => result.code), [0, 0, 0]);
  const lines = readFileSync(log, "utf8").trim().split("\n");
  assert.ok(lines[1].startsWith("start"), `no overlap seen: ${lines.join(" | ")}`);
});

test("a command keeps its exit status, output and working directory under the lock", { skip: !haveFlock, timeout: 60_000 }, async () => {
  const wrapped = rewritten("du -s /dev/null >/dev/null; pwd; echo out; echo err >&2; exit 7");
  const child = spawn("bash", ["-c", wrapped], { env, cwd: dirs.plain, stdio: ["ignore", "pipe", "pipe"] });
  let stdout = "";
  child.stdout.on("data", (chunk) => { stdout += chunk; });
  const { code, stderr } = await exited(child);
  assert.equal(code, 7);
  assert.equal(stdout, `${dirs.plain}\nout\n`);
  assert.equal(stderr, "err\n");
});

test("a busy slot ends the waiting command with exit 75 and says why, and it does not run", { skip: !haveFlock, timeout: 60_000 }, async () => {
  const log = path.join(root, "busy.log");
  const wrapped = rewritten(`du -s /dev/null >/dev/null; echo ran >> ${shellQuote(log)}`, { ...env, AGENT_HEAVY_WAIT_SECONDS: "1" });
  assert.match(wrapped, /flock -w 1 -E 75 /u);
  const holder = holdLock(5);
  try {
    assert.ok(await until(lockHeld), "the holder took the lock");
    const { code, stderr } = await exited(spawn("bash", ["-c", wrapped], { env, stdio: ["ignore", "ignore", "pipe"] }));
    assert.equal(code, BUSY_EXIT_CODE);
    assert.match(stderr, /^agent-heavy: waited 1s for the host's single heavy-command slot/u);
    assert.equal(existsSync(log), false);
  } finally { killGroup(holder); }
});

test("the lock dies with its holder: a killed holder frees the slot at once", { skip: !haveFlock, timeout: 60_000 }, async () => {
  const holder = holdLock(30);
  assert.ok(await until(lockHeld), "held");
  killGroup(holder);
  assert.ok(await until(() => !lockHeld()), "freed");
});

test("a lock file the command cannot read leaves the command to run unlocked, not to fail", { skip: !haveFlock, timeout: 60_000 }, async () => {
  const gone = path.join(root, "gone", "agent-heavy.lock");
  const log = path.join(root, "unlocked.log");
  const wrapped = rewritten(`du -s /dev/null >/dev/null; echo ran >> ${shellQuote(log)}`, { ...env, AGENT_HEAVY_LOCK: gone });
  rmSync(path.dirname(gone), { recursive: true });
  const { code } = await exited(spawn("bash", ["-c", wrapped], { env, stdio: ["ignore", "ignore", "pipe"] }));
  assert.equal(code, 0);
  assert.equal(readFileSync(log, "utf8"), "ran\n");
});

test("the original survives quoting whatever it contains", { skip: !haveFlock, timeout: 60_000 }, async () => {
  const nasty = `du -s /dev/null >/dev/null; printf '%s|' "it's" 'a"b' '$HOME' "$(echo sub)" \`echo tick\`; cat <<'EOF'\nline with 'quotes' and $VARS\nEOF\n# trailing comment`;
  const wrapped = rewritten(nasty);
  const direct = spawnSync("bash", ["-c", nasty], { env, encoding: "utf8" });
  const locked = spawnSync("bash", ["-c", wrapped], { env, encoding: "utf8" });
  assert.equal(locked.status, 0, locked.stderr);
  assert.equal(locked.stdout, direct.stdout);
  assert.ok(locked.stdout.includes("it's|a\"b|$HOME|sub|tick|"));
});

test("a heavy command under the lock sees the lock is held, so a nested hook does not wait on its parent", { skip: !haveFlock, timeout: 60_000 }, async () => {
  const wrapped = rewritten('du -s /dev/null >/dev/null; printf "%s" "$AGENT_HEAVY_LOCK_HELD"');
  const result = spawnSync("bash", ["-c", wrapped], { env, encoding: "utf8" });
  assert.equal(result.stdout, "1");
  assert.equal(decide({ tool_name: "Bash", cwd: dirs.plain, tool_input: { command: "tar xf a.tar" } }, { env: { ...env, AGENT_HEAVY_LOCK_HELD: result.stdout }, home }), undefined);
});

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
    assert.equal(verdict("rm -f .git/index.lock", "plain").action, "allow", "no repository there");
    assert.equal(verdict("rm -f lib/a.mjs", "big").action, "allow");
  } finally { git.kill("SIGKILL"); }
  assert.ok(await until(() => verdict(`rm -f ${dirs.big}/.git/index.lock`, "plain").action === "allow"), "the git process has ended");
});

// --- what a harness projects -------------------------------------------------------------------

test("a node's projection carries the hook file and settings that name it, for Claude Code and Codex", () => {
  const node = "/work/node dir";
  const control = hostResourceControl({ node });
  assert.deepEqual([...control.files.keys()].sort(), [".claude/hooks/host-resource-hook.mjs", ".codex/hooks.json", ".codex/hooks/host-resource-hook.mjs"]);
  assert.equal(control.files.get(".claude/hooks/host-resource-hook.mjs"), hookSource());
  const [entry] = control.hooks.PreToolUse;
  assert.equal(entry.matcher, "Bash|Monitor");
  assert.equal(JSON.parse(hostResourceControl({ node }).files.get(".codex/hooks.json")).hooks.PreToolUse[0].matcher, "Bash");
  assert.deepEqual(entry.hooks.map((handler) => handler.type), ["command"]);
  assert.equal(entry.hooks[0].command, "node '/work/node dir/.claude/hooks/host-resource-hook.mjs'");
  const codex = JSON.parse(control.files.get(".codex/hooks.json"));
  assert.equal(codex.hooks.PreToolUse[0].hooks[0].command, "node '/work/node dir/.codex/hooks/host-resource-hook.mjs' --provider codex");
  assert.deepEqual([...hostResourceControl({ node, codex: false }).files.keys()], [".claude/hooks/host-resource-hook.mjs"]);
  assert.deepEqual(hookEntries("/a b/it's.mjs").PreToolUse[0].hooks[0].command, "node '/a b/it'\\''s.mjs'");
});

test("run() answers a bare event the way the process does", { skip: !haveFlock }, () => {
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
  'while [ $# -gt 0 ] && [ "$1" != "--" ]; do shift; done',
  '[ $# -gt 0 ] || exit 0',
  "shift",
  'exec "$@"',
  "",
].join("\n"), { mode: 0o755 });
const OUTSIDE = "0::/non-systemd\n";
const INSIDE = `0::/user.slice/user-1000.slice/user@1000.service/agent.slice/${CONTAINMENT_SLICE}/run-r1.scope\n`;
const shellEvent = (command, permission_mode, tool_name = "Bash") => ({ hook_event_name: "PreToolUse", cwd: dirs.plain, tool_name, permission_mode, tool_input: { command, description: "d" } });

async function withBus(work) {
  const runtime = mkdtempSync(path.join(root, "runtime-"));
  const server = net.createServer();
  await new Promise((resolve) => server.listen(path.join(runtime, "bus"), resolve));
  try { return await work(runtime); } finally { await new Promise((resolve) => server.close(resolve)); }
}

test("the slice takes a quarter of the processors and at most 40% of memory, with no swap", () => {
  const limits = containmentLimits({ cpus: 16, memory: 7748 * MiB });
  assert.deepEqual(limits, { CPUQuota: "400%", CPUWeight: 20, MemoryHigh: "2324M", MemoryMax: "3099M", MemorySwapMax: 0, TasksMax: 768 });
  assert.equal(containmentLimits({ cpus: 2, memory: 1024 * MiB }).CPUQuota, "100%");
  const unit = sliceUnit(limits);
  assert.match(unit, /^\[Unit\]\nDescription=.+\n\n\[Slice\]\n/u);
  for (const [key, value] of Object.entries(limits)) assert.ok(unit.includes(`\n${key}=${value}\n`), key);
});

test("a session outside the slice has its commands placed in it; one inside is left alone", { skip: !haveFlock }, async () => {
  await withBus(async (runtime) => {
    const live = { ...env, XDG_RUNTIME_DIR: runtime, PATH: `${fakeBin}:${env.PATH}` };
    const slice = `--slice=${CONTAINMENT_SLICE} --`;
    const answer = (input, cgroup = OUTSIDE, provider = "claude") => decide(input, { env: live, provider, cgroup })?.updatedInput?.command;
    // Without permission rules, every command is contained.
    assert.ok(answer(shellEvent("ls -la", "bypassPermissions")).includes(slice));
    // With them, only what is already rewritten, so no allow rule stops matching a light command.
    assert.equal(answer(shellEvent("ls -la", "default")), undefined);
    const heavy = answer(shellEvent("git fetch origin", "default"));
    assert.ok(heavy.includes(slice) && heavy.includes("flock"), "a heavy command is serialized and contained");
    // A watch is contained but never takes the heavy slot.
    const watch = answer(shellEvent("git fetch origin; sleep 60", "default", "Monitor"));
    assert.ok(watch.includes(slice) && !watch.includes("flock"));
    // Already inside the slice: serialization only.
    assert.equal(answer(shellEvent("ls -la", "bypassPermissions"), INSIDE), undefined);
    assert.ok(!answer(shellEvent("git fetch origin", "bypassPermissions"), INSIDE).includes("systemd-run"));
    // Never for an allow-list session, for Codex, or when switched off; a denial still wins.
    assert.equal(answer(shellEvent("git fetch origin", "dontAsk")), undefined);
    assert.ok(!answer(shellEvent("git fetch origin", "bypassPermissions"), OUTSIDE, "codex").includes("systemd-run"));
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
  assert.match(readFileSync(log, "utf8"), new RegExp(`^--user --scope --quiet --collect --slice=${CONTAINMENT_SLICE} -- bash -c `, "u"));
  assert.deepEqual(readdirSync(runtime), [], "the directory record is removed");
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
