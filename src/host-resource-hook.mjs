#!/usr/bin/env node
/**
 * The host-resource controller: one PreToolUse hook that mediates the Bash commands of every agent
 * session on a machine, to refuse known wasteful producer paths before they run. Native producer
 * owners receive physical allocation and lifecycle state; this hook is not a disk quota. The control is software in the harness and not an instruction an agent
 * is trusted to follow: the harness hands the hook each command before it runs, and the hook either
 * denies it or lets it run, placed in the work slice. Beneath it sits a kernel cap (see "Containment"
 * below): every process a Claude Code session runs lives in one user-manager slice,
 * `agent-claude.slice`, whose cgroup limits bind the sum of all of it to a share of the host, however
 * many sessions and subagents there are. A session started by the launcher `launcherScript` writes is
 * inside the slice from its first instruction; for one that is not, the hook places its commands in
 * the work slice itself.
 *
 *   deny    the command reads or writes far more than it can be worth (`find`, or a recursive
 *           `grep`/`rg`/`ag`/`ack`/`fd`/`tree`, over the disk, a home or a large working tree, `git worktree add`,
 *           raw `git clone`/`gh repo clone`, direct dependency installs and fetch-on-exec, an unscoped `git status`/`git log --all`/
 *           `git ls-files` and `git submodule update|foreach` in a large repository, `git commit -a` in a
 *           partial working tree, a `gh pr merge` that deletes most of a repository, `rm .git/index.lock`
 *           while a git process works there); the reason, shown to the agent, names the safe alternative;
 *   allow   everything else. In a Claude Code session that is not already in the work slice, every
 *           command of a `bypassPermissions` session (except the removals the harness checks itself) and
 *           every `Monitor` watch is rewritten (`updatedInput.command`) to run in a transient scope of
 *           `agent-work.slice`, keeping its exit status and working directory; any other command is
 *           untouched (no output). Nothing is queued: no command waits on another.
 *
 * Contract (Claude Code and Codex share it): the event arrives as JSON on stdin (`tool_name`,
 * `tool_input.command`, `cwd`); a decision leaves as `hookSpecificOutput` on stdout with exit 0. A
 * deny is `permissionDecision: "deny"` plus `permissionDecisionReason`; a rewrite is `updatedInput`
 * (it replaces the whole input, so unchanged fields are carried over). The hook FAILS OPEN: on any
 * internal error, malformed input or a missing `systemd-run` it prints nothing and exits 0, and the
 * command runs as if the hook were absent. A hook is a guardrail on a cooperative agent, not a
 * security boundary, and original producers remain responsible for resource admission. It never waits on anything: a 200 ms
 * timer ends the process if stdin never closes. The one exception is the mass-deletion guard (`gh pr
 * merge`, `git commit -a`): it asks gh and git, within a ten-second budget, and allows the command when
 * it cannot find out.
 *
 * Zero dependencies: projections reference this one owning source file and the verified Node
 * executable that runs the projecting harness. It reads a handful of stat results and no repository state, so it adds only node's
 * own start-up time. Settings are read from the hook's own process environment (the harness's, which
 * an agent's command cannot change): AGENT_HOST_GUARD=off disables it; AGENT_CONTAINMENT=off leaves
 * commands outside the slice; AGENT_HEAVY_LARGE_REPO_FILES and AGENT_HEAVY_LARGE_REPO_INDEX_BYTES tune
 * what counts as a large repository.
 */
import { spawnSync } from "node:child_process";
import { accessSync, closeSync, constants, existsSync, lstatSync, mkdirSync, openSync, readFileSync, readSync, readdirSync, readlinkSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { homedir, tmpdir, totalmem } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

// GNU timeout otherwise sends TERM once and can wait forever for a process
// that ignores it. Keep each caller's requested deadline, finish termination
// after ten seconds, and let an explicit later --kill-after option win.
// Export the shell function so nested bash carriers keep the same operation.
const requestedTimeoutPrelude = 'if ! declare -F timeout >/dev/null; then timeout() { command timeout --kill-after=10s "$@"; }; export -f timeout; fi';
export const LIMITS = Object.freeze({
  /** A repository tracking more files than this is large; the count is read from the header of its `.git/index`. */
  largeRepoFiles: 20_000,
  /** Where the header cannot be read, an index larger than this is large: its size is the proxy for the count (about 100 bytes a path). */
  largeRepoIndexBytes: 5 * 1024 * 1024,
  /** `find` rooted at a broad directory must be bounded to this depth. */
  findMaxDepth: 3,
  maxCommandLength: 200_000,
  maxShellDepth: 3,
  /** The parser gives up (and the hook allows the command) after this many milliseconds, and the whole process after `guardMilliseconds`. */
  parseMilliseconds: 100,
  guardMilliseconds: 200,
  /**
   * Mass deletion: what makes a merge, or a `commit -a`, remove too much of a repository to proceed unseen.
   * Derived from a measurement, not chosen: see content/requirements/the-agent-harness-refuses-mass-deletion.json
   * (the sample, the distribution and the derivation). A change is a mass deletion when it removes at least
   * `minFiles` files AND at least `share` of the files its base holds.
   */
  massDeletion: Object.freeze({
    share: 0.5,
    minFiles: 10,
    /** Files of a PR read to estimate its removals (pages of 100): the removed fraction of these is projected over `changedFiles`. */
    sampleFiles: 300,
    /** The whole merge check, and one gh call, are bounded well inside the hook's 15 s timeout; past either the merge is allowed (fail open). */
    budgetMilliseconds: 10_000,
    callMilliseconds: 4_000,
    /** `git config` and `git ls-files --deleted` over the working tree are bounded the same way. */
    worktreeMilliseconds: 2_500,
    /** The PR-body line that states a mass deletion is intended, with a reason. */
    marker: "mass-deletion-intended",
  }),
});

// ---------------------------------------------------------------------------------------------
// Shell parsing: enough of bash to find the simple commands of a command line, quotes removed.
// ---------------------------------------------------------------------------------------------

/**
 * The simple commands of `source` in order, `{ words, quoted, scope, piped }`, with the scopes they
 * run in (`scopes[i].parent`; 0 is the line itself). Command and process substitutions and subshells
 * are flattened in, each its own scope, so a `cd` inside one does not leak out; heredoc bodies are
 * data and are skipped; `piped` says the command reads its stdin from a pipe.
 */
export function parseShell(source) {
  const commands = [];
  const scopes = [{ parent: -1 }];
  const pending = [];
  let index = 0;
  // A parser bug must never become a hung hook: every pass of the scan is counted and timed.
  let steps = 0;
  const budget = source.length * 4 + 1000;
  const deadline = Date.now() + LIMITS.parseMilliseconds;

  const skipHeredocBodies = () => {
    while (pending.length > 0) {
      const { delimiter, strip } = pending.shift();
      while (index < source.length) {
        let end = source.indexOf("\n", index);
        if (end < 0) end = source.length;
        const line = source.slice(index, end);
        index = Math.min(end + 1, source.length);
        if ((strip ? line.replace(/^\t+/u, "") : line) === delimiter) break;
      }
    }
  };
  // `index` is just after "$(" and source[index] is the second "(" of an arithmetic expansion.
  const skipArithmetic = () => {
    let depth = 0;
    while (index < source.length) {
      const c = source[index++];
      if (c === "(") depth += 1;
      else if (c === ")" && --depth === 0) break;
    }
    if (source[index] === ")") index += 1;
  };

  function scan(terminator, scope) {
    let words = [];
    let quoted = [];
    let word = "";
    let inWord = false;
    let wasQuoted = false;
    let piped = false;
    const endWord = () => {
      if (!inWord) return;
      words.push(word);
      quoted.push(wasQuoted);
      word = "";
      inWord = false;
      wasQuoted = false;
    };
    const endCommand = (pipeAfter = false) => {
      endWord();
      if (words.length > 0) commands.push({ words, quoted, scope, piped });
      words = [];
      quoted = [];
      piped = pipeAfter;
    };
    const nest = (closer) => {
      scopes.push({ parent: scope });
      scan(closer, scopes.length - 1);
    };
    const substitution = (closer) => {
      nest(closer);
      word += "$(…)";
      inWord = true;
    };

    while (index < source.length) {
      steps += 1;
      if (steps > budget || ((steps & 255) === 0 && Date.now() > deadline)) throw new Error("the command is too involved to read in time");
      const ch = source[index];
      if (terminator !== undefined && ch === terminator) { index += 1; endCommand(); return; }
      if (ch === " " || ch === "\t" || ch === "\r") { endWord(); index += 1; continue; }
      if (ch === "\n") { endCommand(); index += 1; skipHeredocBodies(); continue; }
      if (ch === "\\") {
        if (source[index + 1] === "\n") { index += 2; continue; }
        word += source[index + 1] ?? "";
        inWord = true;
        wasQuoted = true;
        index += 2;
        continue;
      }
      if (ch === "#" && !inWord) {
        while (index < source.length && source[index] !== "\n") index += 1;
        continue;
      }
      if (ch === "'") {
        const end = source.indexOf("'", index + 1);
        const stop = end < 0 ? source.length : end;
        word += source.slice(index + 1, stop);
        inWord = true;
        wasQuoted = true;
        index = stop + 1;
        continue;
      }
      if (ch === '"') {
        index += 1;
        inWord = true;
        wasQuoted = true;
        while (index < source.length && source[index] !== '"') {
          const c = source[index];
          if (c === "\\") {
            const next = source[index + 1];
            if (next === '"' || next === "\\" || next === "$" || next === "`") word += next;
            else if (next !== "\n") word += c + (next ?? "");
            index += 2;
          } else if (c === "$" && source[index + 1] === "(") {
            index += 2;
            if (source[index] === "(") { skipArithmetic(); word += "$(…)"; } else substitution(")");
          } else if (c === "`") {
            index += 1;
            substitution("`");
          } else {
            word += c;
            index += 1;
          }
        }
        index += 1;
        continue;
      }
      if (ch === "$" && source[index + 1] === "(") {
        index += 2;
        if (source[index] === "(") { skipArithmetic(); word += "$(…)"; inWord = true; } else substitution(")");
        continue;
      }
      if (ch === "`") { index += 1; substitution("`"); continue; }
      if ((ch === "<" || ch === ">") && source[index + 1] === "(") { index += 2; substitution(")"); continue; }
      if (ch === "<" && source[index + 1] === "<" && source[index + 2] !== "<") {
        let at = index + 2;
        let strip = false;
        if (source[at] === "-") { strip = true; at += 1; }
        while (source[at] === " " || source[at] === "\t") at += 1;
        let delimiter = "";
        const quote = source[at];
        if (quote === "'" || quote === '"') {
          const end = source.indexOf(quote, at + 1);
          const stop = end < 0 ? source.length : end;
          delimiter = source.slice(at + 1, stop);
          at = stop + 1;
        } else {
          while (at < source.length && !/[\s;&|()<>]/u.test(source[at])) {
            if (source[at] === "\\") at += 1;
            delimiter += source[at] ?? "";
            at += 1;
          }
        }
        if (delimiter !== "") pending.push({ delimiter, strip });
        index = at;
        continue;
      }
      if (ch === "(") { endCommand(); index += 1; nest(")"); continue; }
      if (ch === ")") { endCommand(); index += 1; continue; }
      if (ch === ";") { endCommand(); index += 1; if (source[index] === ";") index += 1; continue; }
      if (ch === "|") {
        index += 1;
        if (source[index] === "|") { index += 1; endCommand(); } else { if (source[index] === "&") index += 1; endCommand(true); }
        continue;
      }
      if (ch === "&") {
        if (source[index + 1] === ">" || source[index - 1] === ">" || source[index - 1] === "<") { word += ch; inWord = true; index += 1; continue; }
        index += 1;
        if (source[index] === "&") index += 1;
        endCommand();
        continue;
      }
      word += ch;
      inWord = true;
      index += 1;
    }
    endCommand();
  }

  scan(undefined, 0);
  return { commands, scopes };
}

/** A command's words without its redirections (`2>&1`, `> file`). */
function withoutRedirections(words, quoted) {
  const out = [];
  for (let i = 0; i < words.length; i += 1) {
    const m = quoted[i] ? null : /^(\d*|&)(>>?|<<?<?|>&|<&|&>>?)(.*)$/u.exec(words[i]);
    if (m === null) { out.push(words[i]); continue; }
    if (m[3] === "") i += 1;
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Where a command acts: working directory, repository, "broad" trees.
// ---------------------------------------------------------------------------------------------

function makeContext(input, env, options = {}) {
  const home = path.resolve(options.home ?? env.HOME ?? homedir());
  const positive = (value, fallback) => (Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : fallback);
  return {
    env: { ...env, HOME: home },
    home,
    cwd: typeof input?.cwd === "string" && path.isAbsolute(input.cwd) ? path.resolve(input.cwd) : undefined,
    scratchpad: typeof input?.scratchpad_dir === "string" ? input.scratchpad_dir : undefined,
    largeRepoFiles: positive(env.AGENT_HEAVY_LARGE_REPO_FILES, LIMITS.largeRepoFiles),
    largeRepoIndexBytes: positive(env.AGENT_HEAVY_LARGE_REPO_INDEX_BYTES, LIMITS.largeRepoIndexBytes),
    repos: new Map(),
    run: options.run ?? boundedRun,
  };
}

/** One bounded child process: `{ status, stdout, truncated }`; status is null when it could not run, timed out or was killed. Never throws. */
function boundedRun(command, args, { cwd, timeout, maxBuffer = 16 * 1024 * 1024, env = process.env } = {}) {
  try {
    const result = spawnSync(command, args, { cwd, timeout, maxBuffer, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], env: { ...env, GIT_OPTIONAL_LOCKS: "0", GH_PROMPT_DISABLED: "1", GIT_TERMINAL_PROMPT: "0" } });
    return { status: result.status, stdout: result.stdout ?? "", truncated: result.error?.code === "ENOBUFS" };
  } catch { return { status: null, stdout: "", truncated: false }; }
}

/** The number of entries a git index records (its header: "DIRC", a version, then the count), or undefined when it cannot be read. */
function indexEntries(file) {
  let fd;
  try {
    fd = openSync(file, "r");
    const head = Buffer.alloc(12);
    if (readSync(fd, head, 0, 12, 0) === 12 && head.toString("latin1", 0, 4) === "DIRC") return head.readUInt32BE(8);
  } catch { /* unreadable: the size stands in */ } finally {
    if (fd !== undefined) { try { closeSync(fd); } catch { /* nothing to do */ } }
  }
  return undefined;
}

/** How a repository is described to an agent: its tracked-file count when known, else its index size. */
const describe = (repo) => (repo.entries === undefined ? `${Math.round(repo.indexBytes / 1048576)} MB index` : `${repo.entries} tracked files`);

/**
 * The repository holding `dir`: its top, git directory, index size and tracked-file count, or
 * undefined. The count is read from the index's own 12-byte header, which is exact and needs no git
 * process; the file's size stands in when the header cannot be read. Both are cheap: the kernel
 * already holds the file.
 */
function repoOf(dir, ctx) {
  if (ctx.repos.has(dir)) return ctx.repos.get(dir);
  let found;
  let at = dir;
  for (let depth = 0; depth < 64 && found === undefined; depth += 1) {
    const dotGit = path.join(at, ".git");
    let stat;
    try { stat = lstatSync(dotGit); } catch { stat = undefined; }
    if (stat !== undefined) {
      let gitDir;
      try {
        gitDir = dotGit;
        if (stat.isFile()) {
          const pointer = /^gitdir:\s*(.+?)\s*$/mu.exec(readFileSync(dotGit, "utf8"));
          gitDir = pointer === null ? undefined : path.resolve(at, pointer[1]);
        }
      } catch { gitDir = undefined; }
      let bytes = 0;
      let entries;
      if (gitDir !== undefined) {
        const index = path.join(gitDir, "index");
        try { bytes = statSync(index).size; } catch { bytes = 0; }
        if (bytes > 0) entries = indexEntries(index);
      }
      found = { top: at, gitDir, indexBytes: bytes, entries, large: entries === undefined ? bytes > ctx.largeRepoIndexBytes : entries > ctx.largeRepoFiles };
      break;
    }
    const parent = path.dirname(at);
    if (parent === at) break;
    at = parent;
  }
  ctx.repos.set(dir, found);
  return found;
}

/** `word` with `~` and known variables expanded, or undefined when it cannot be known statically. */
function expand(word, cwd, ctx) {
  let value = word;
  if (value === "~" || value.startsWith("~/")) value = ctx.home + value.slice(1);
  else if (value.startsWith("~")) return undefined;
  let unknown = false;
  value = value.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}|\$([A-Za-z_][A-Za-z0-9_]*)/gu, (_, braced, bare) => {
    const name = braced ?? bare;
    const known = name === "PWD" ? cwd : ctx.env[name];
    if (known === undefined) unknown = true;
    return known ?? "";
  });
  return unknown || value.includes("$") || value.includes("`") ? undefined : value;
}

/** The directory a path word names (for a glob, the directory holding the glob segment), or undefined when unknowable. */
function resolveDir(word, cwd, ctx) {
  const expanded = expand(word, cwd, ctx);
  if (expanded === undefined || expanded === "") return undefined;
  let base = expanded;
  const glob = expanded.search(/[*?[]/u);
  if (glob >= 0) base = expanded.slice(0, expanded.lastIndexOf("/", glob) + 1) || ".";
  if (!path.isAbsolute(base) && cwd === undefined) return undefined;
  return path.resolve(cwd ?? "/", base);
}

const SYSTEM_TREES = new Set(["/", "/home", "/mnt", "/Users", "/gnu", "/nix", "/proc", "/sys"]);

/** The checkout paths a repository's `.gitmodules` declares, absolute. */
function submodulePaths(top) {
  let text;
  try { text = readFileSync(path.join(top, ".gitmodules"), "utf8"); } catch { return []; }
  return [...text.matchAll(/^\s*path\s*=\s*(.+?)\s*$/gmu)].map((match) => path.resolve(top, match[1]));
}

/**
 * Whether the repositories checked out at or beneath `dir` together track more files than a large
 * repository. A superrepo of submodules has a tiny index of gitlinks, so its own size says nothing of
 * the checkouts under it: `grep -r` from the Bare Cedar Fog root or its `services/` walked every
 * section's tree and exhausted the host (2026-10-26). The declared submodules are followed, nested
 * ones too, and the count stops once it is large.
 */
function holdsLargeTrees(dir, repo, ctx) {
  let files = repo.top === dir ? repo.entries ?? repo.indexBytes / 100 : 0;
  const pending = submodulePaths(repo.top);
  for (let visited = 0; pending.length > 0 && visited < 512; visited += 1) {
    const at = pending.pop();
    if (!within(at, dir) && !within(dir, at)) continue;
    const nested = repoOf(at, ctx);
    if (nested === undefined || nested.top !== at) continue;
    if (within(at, dir)) {
      if (nested.large) return true;
      files += nested.entries ?? nested.indexBytes / 100;
      if (files > ctx.largeRepoFiles) return true;
    }
    pending.push(...submodulePaths(at));
  }
  return false;
}

/** Whether scanning `dir` recursively walks a disk, a home or a large working tree. */
function isBroad(dir, ctx) {
  if (SYSTEM_TREES.has(dir)) return true;
  if (dir === ctx.home || ctx.home.startsWith(`${dir}/`)) return true;
  if (/^\/mnt\/[^/]+$/u.test(dir) || /^\/(home|Users)\/[^/]+$/u.test(dir)) return true;
  const repo = repoOf(dir, ctx);
  if (repo === undefined) return false;
  if (repo.top === dir && repo.large) return true;
  return holdsLargeTrees(dir, repo, ctx);
}

const within = (dir, root) => dir === root || dir.startsWith(root.endsWith("/") ? root : `${root}/`);

/** Whether `dir` is scratch: the session's scratchpad, a temporary root, or a scratch-named directory. Inside the user's
 *  home only the home's own scratch-named directories count, so a home that itself lies under a temporary root (a
 *  test's, a container's) is not wholly scratch. */
function isScratch(dir, ctx) {
  if (typeof ctx.scratchpad === "string" && ctx.scratchpad !== "" && within(dir, path.resolve(ctx.scratchpad))) return true;
  const named = (part) => part.split("/").some((segment) => /^(scratchpad|scratch|tmp)$/iu.test(segment));
  if (ctx.home && within(dir, ctx.home)) return named(dir.slice(ctx.home.length));
  const roots = [tmpdir(), "/tmp", "/var/tmp", "/dev/shm", ctx.env.TMPDIR, ctx.env.XDG_RUNTIME_DIR].filter((root) => typeof root === "string" && root !== "").map((root) => path.resolve(root));
  return roots.some((root) => within(dir, root)) || named(dir);
}

const exists = (file) => { try { statSync(file); return true; } catch { return false; } };

// ---------------------------------------------------------------------------------------------
// Classification.
// ---------------------------------------------------------------------------------------------

const KEYWORDS = new Set(["if", "then", "else", "elif", "do", "while", "until", "!", "{", "}", "time", "coproc"]);
const SKIPPED = new Set(["for", "case", "select", "function", "[[", "[", "test", "echo", "printf", "export", "unset", "set", "alias", "read", "true", "false", ":", "fi", "done", "esac"]);
const SHELLS = new Set(["bash", "sh", "zsh", "dash", "ksh", "ash"]);
const WRAPPERS = {
  sudo: { value: ["-u", "-g", "-h", "-p", "-C", "-D", "-R", "-T", "-U", "-r", "-t"] },
  doas: { value: ["-u", "-C"] },
  env: { value: ["-u", "-C", "-S"], assignments: true },
  time: {}, nohup: {}, command: {}, builtin: {}, setsid: {}, exec: { value: ["-a"] },
  stdbuf: { value: ["-i", "-o", "-e"] },
  nice: { value: ["-n"] },
  ionice: { value: ["-c", "-n", "-p", "-P", "-u"] },
  timeout: { value: ["-k", "-s"], positional: 1 },
  xargs: { value: ["-n", "-P", "-I", "-L", "-s", "-d", "-E", "-a", "-l", "-i"] },
  flock: { value: ["-w", "-E", "--timeout", "--wait", "--conflict-exit-code"], positional: 1 },
};
const isAssignment = (word) => /^[A-Za-z_][A-Za-z0-9_]*=/u.test(word);

/** The command a line really runs: leading assignments, keywords and wrappers (sudo, env, nice, timeout, xargs, flock...) removed. */
function unwrap(argv) {
  let words = argv;
  for (let guard = 0; guard < 8; guard += 1) {
    while (words.length > 0 && (isAssignment(words[0]) || KEYWORDS.has(words[0]))) words = words.slice(1);
    if (words.length === 0) return words;
    const wrapper = path.basename(words[0]);
    const spec = Object.hasOwn(WRAPPERS, wrapper) ? WRAPPERS[wrapper] : undefined;
    if (spec === undefined) return words;
    const value = new Set(spec.value ?? []);
    let i = 1;
    while (i < words.length) {
      const word = words[i];
      if (spec.assignments === true && isAssignment(word)) { i += 1; continue; }
      if (word === "--") { i += 1; break; }
      if (word.startsWith("-") && word.length > 1) { i += value.has(word) ? 2 : 1; continue; }
      break;
    }
    words = words.slice(i + (spec.positional ?? 0));
    if (wrapper === "flock" && (words[0] === "-c" || words[0] === "--command")) words = ["bash", "-c", words[1] ?? ""];
  }
  return words;
}

/** Non-option words of `args`, skipping the values of `valueOptions`; words after `--` are all positional. */
function positionals(args, valueOptions = []) {
  const value = new Set(valueOptions);
  const out = [];
  let rest = false;
  for (let i = 0; i < args.length; i += 1) {
    const word = args[i];
    if (!rest && word === "--") { rest = true; continue; }
    if (!rest && word.startsWith("-") && word.length > 1) { if (value.has(word)) i += 1; continue; }
    out.push(word);
  }
  return out;
}

const optionValue = (args, names) => {
  for (let i = 0; i < args.length; i += 1) {
    for (const name of names) {
      if (args[i] === name) return args[i + 1];
      if (name.startsWith("--") && args[i].startsWith(`${name}=`)) return args[i].slice(name.length + 1);
      if (!name.startsWith("--") && args[i].startsWith(name) && /^\d+$/u.test(args[i].slice(name.length))) return args[i].slice(name.length);
    }
  }
  return undefined;
};

/** Whether `args` hold any of the short option letters (alone or bundled: `-rn`) or the long options. */
const hasFlag = (args, letters, long = []) => args.some((arg) => (arg.startsWith("-") && !arg.startsWith("--") && [...arg.slice(1)].some((letter) => letters.includes(letter))) || long.includes(arg));

// A tool's options that take a separate value, so the value is not mistaken for a path.
const RG_VALUE = ["-e", "--regexp", "-f", "--file", "-g", "--glob", "--iglob", "-t", "--type", "-T", "--type-not", "--type-add", "--type-clear", "-A", "-B", "-C", "--after-context", "--before-context", "--context", "-m", "--max-count", "-j", "--threads", "-M", "--max-columns", "-E", "--encoding", "-r", "--replace", "--max-filesize", "--sort", "--sortr", "--colors", "--engine", "--ignore-file", "--pre", "--pre-glob", "--path-separator", "-d", "--max-depth", "--maxdepth"];
const GREP_VALUE = ["-e", "--regexp", "-f", "--file", "-m", "--max-count", "-A", "-B", "-C", "-d", "--directories", "-D", "--devices", "--include", "--exclude", "--exclude-dir", "--exclude-from", "--label", "--color", "--colour", "--binary-files"];
const FD_VALUE = ["-d", "--max-depth", "-e", "--extension", "-t", "--type", "-E", "--exclude", "-c", "--color", "-j", "--threads", "-S", "--size", "--changed-within", "--changed-before", "-x", "--exec", "-X", "--exec-batch"];
const GREP = { recursive: (args) => hasFlag(args, "rR", ["--recursive", "--dereference-recursive"]) || optionValue(args, ["-d", "--directories"]) === "recurse", value: GREP_VALUE, depth: [], noPattern: ["-e", "--regexp", "-f", "--file"] };
const SCANNERS = {
  rg: { recursive: () => true, value: RG_VALUE, depth: ["-d", "--max-depth", "--maxdepth"], noPattern: ["-e", "--regexp", "-f", "--file", "--files", "--type-list"], stdin: true },
  ag: { recursive: () => true, value: ["-G", "-A", "-B", "-C", "-m", "--depth", "-g", "--ignore", "--ignore-dir", "-p"], depth: ["--depth"], noPattern: ["-g"], stdin: true },
  ack: { recursive: () => true, value: ["-A", "-B", "-C", "-m", "--type", "--ignore-dir", "--ignore-file"], depth: [], noPattern: ["-f"], stdin: true },
  fd: { recursive: () => true, value: FD_VALUE, depth: ["-d", "--max-depth"], noPattern: [] },
  fdfind: { recursive: () => true, value: FD_VALUE, depth: ["-d", "--max-depth"], noPattern: [] },
  tree: { recursive: () => true, value: ["-L", "-P", "-I", "-o", "--charset", "--filelimit", "--sort"], depth: ["-L"], noPattern: [], pattern: false },
  grep: GREP,
  egrep: GREP,
  fgrep: GREP,
  ls: { recursive: (args) => hasFlag(args, "R", ["--recursive"]), value: ["-I", "--ignore", "-w", "--width", "-T", "--tabsize", "--sort", "--time", "--format", "--color", "--block-size", "--hide", "--indicator-style", "--time-style", "--quoting-style"], depth: [], noPattern: [], pattern: false },
};

const CLONE_VALUE_OPTIONS = ["-b", "--branch", "--depth", "--filter", "-o", "--origin", "--reference", "--reference-if-able", "-c", "--config", "-j", "--jobs", "--template", "--separate-git-dir", "-u", "--upload-pack", "--server-option", "--shallow-since", "--shallow-exclude", "--bundle-uri", "--ref-format", "--revision"];

// ---------------------------------------------------------------------------------------------
// Mass deletion: a merge or a `commit -a` that removes most of a repository.
// 2026-10-19: repair PRs made by `git commit -am` in a `--no-checkout` clone (every tracked file absent from the
// worktree staged as a deletion) were merged unseen and emptied ten repositories.
// ---------------------------------------------------------------------------------------------

/** Whether removing `removed` of the `total` files a base holds is a mass deletion (see LIMITS.massDeletion). */
export function isMassDeletion(removed, total, limits = LIMITS.massDeletion) {
  return removed >= limits.minFiles && removed >= limits.share * Math.max(total, 1);
}

/** A commit's short options, read properly: `-a` bundled (`-am`, `-qam`) counts, but not the `a` inside a value (`-m"fix a"`, `-Fnotes`). */
function commitAll(args) {
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--") return false;
    if (arg === "--all") return true;
    if (!arg.startsWith("-") || arg.startsWith("--") || arg.length < 2) continue;
    for (let k = 1; k < arg.length; k += 1) {
      if (arg[k] === "a") return true;
      if ("mFCctSu".includes(arg[k])) { if (k === arg.length - 1 && "mFCct".includes(arg[k])) i += 1; break; }
    }
  }
  return false;
}

/**
 * Why `git commit -a` / `git add -A|-u` at `top` would stage a partial worktree's absence as deletions, or undefined.
 * Partial means `core.sparseCheckout` is set, or tracked files are missing from the worktree in numbers that make a mass
 * deletion. Cheap and bounded: one `git config` and one `git ls-files --deleted` (a stat of each tracked file, no content),
 * each killed at `worktreeMilliseconds`; whatever cannot be determined in time is allowed.
 */
function partialWorktree(top, entries, ctx) {
  const timeout = LIMITS.massDeletion.worktreeMilliseconds;
  const sparse = ctx.run("git", ["-C", top, "config", "--bool", "--get", "core.sparseCheckout"], { cwd: top, timeout, env: ctx.env });
  if (sparse.status === 0 && sparse.stdout.trim() === "true") return "core.sparseCheckout is set, so this working tree holds only part of the repository";
  const missing = ctx.run("git", ["-C", top, "ls-files", "--deleted", "-z"], { cwd: top, timeout, maxBuffer: 4 * 1024 * 1024, env: ctx.env });
  if (missing.status !== 0 && !missing.truncated) return undefined;
  const count = missing.stdout.split("\0").filter(Boolean).length;
  if (count === 0) return undefined;
  const total = Math.max(entries ?? 0, count);
  // a truncated list is more than the buffer held: a mass of absent files whatever the minimum
  if (missing.truncated || isMassDeletion(count, total)) return `${missing.truncated ? "very many" : count} of ${entries ?? "its"} tracked files are missing from this working tree`;
  return undefined;
}

const partialReason = (what, why) => `${what} in a partial working tree stages every tracked file that is absent from it as a deletion (${why}): this is how ten repositories were emptied on 2026-10-19. Stage the paths you changed (git add -- <path>...), then git commit without -a; check git diff --cached --name-status before pushing.`;

// Work parked under an archival name is work nobody processes again (requirement stale-branches-are-retired-or-merged,
// clause archival-labels-are-unprocessed-source): stashes, refs and tags under these names are refused at the source.
const PARKING = /^(?:refs\/)?(?:tags\/)?(?:archive|legacy|salvage|recovery|restored|backup)\//u;
const STASH_READS = new Set(["list", "show", "pop", "apply", "drop", "clear", "branch"]);
const TAG_VALUE = ["-m", "--message", "-F", "--file", "-u", "--local-user", "--cleanup", "--sort", "--format", "--contains", "--no-contains", "--merged", "--no-merged", "--points-at", "--color"];

/** The parking a git invocation would do, or undefined. */
function parkingRef(sub, args) {
  if (sub === "stash") {
    const action = positionals(args)[0];
    return action === undefined || !STASH_READS.has(action) ? "git stash" : undefined;
  }
  if (sub === "update-ref" && !hasFlag(args, "d", ["--delete", "--stdin"])) {
    const ref = positionals(args, ["-m"])[0];
    return ref !== undefined && PARKING.test(ref) ? ref : undefined;
  }
  if (sub === "tag" && !hasFlag(args, "dlv", ["--delete", "--list", "--verify"])) {
    const name = positionals(args, TAG_VALUE)[0];
    return name !== undefined && PARKING.test(name) ? `refs/tags/${name}` : undefined;
  }
  if (sub === "push") {
    const destination = positionals(args, ["-o", "--push-option", "--repo", "--receive-pack", "--exec"]).slice(1)
      .map((spec) => spec.replace(/^\+/u, "")).filter((spec) => !spec.startsWith(":"))
      .map((spec) => spec.includes(":") ? spec.slice(spec.indexOf(":") + 1) : spec).find((ref) => PARKING.test(ref));
    return destination;
  }
  return undefined;
}

const parkingReason = (what) => `${what} parks work under a name nothing processes again; this is how the Group lost track of its own work. Land it instead: commit on a branch, open a pull request and merge it, or delete it if the default branch already holds it. Work already parked is processed by process-git-branches (red-cup-engineering/git-engineering-services-section, --local and --living-forest).`;

function git(argv, state, ctx, report) {
  const rest = argv.slice(1);
  let i = 0;
  let directory;
  while (i < rest.length && rest[i].startsWith("-")) {
    if (rest[i] === "-C") { directory = rest[i + 1]; i += 2; continue; }
    i += ["-c", "--git-dir", "--work-tree", "--namespace", "--super-prefix", "--config-env"].includes(rest[i]) ? 2 : 1;
  }
  const sub = rest[i];
  const args = rest.slice(i + 1);
  if (sub === undefined) return;
  const cwd = directory === undefined ? state.cwd : resolveDir(directory, state.cwd, ctx);
  const repo = cwd === undefined ? undefined : repoOf(cwd, ctx);
  const size = repo === undefined ? "" : ` (${describe(repo)})`;

  if (repo !== undefined && ((sub === "commit" && commitAll(args)) || (sub === "add" && hasFlag(args, "Au", ["--all", "--update"]) && positionals(args).every((spec) => path.resolve(cwd, spec) === repo.top)))) {
    const why = partialWorktree(repo.top, repo.entries, ctx);
    if (why !== undefined) { report.deny(partialReason(sub === "commit" ? "git commit -a" : "git add -A/-u", why)); return; }
  }
  if (sub === "worktree") {
    if (args[0] === "add") report.deny("git worktree add makes a second working tree of a repository the colony already holds: work in that section's own checkout inside the colony directory (~/<colony>) on a branch (git -C ~/<colony>/<section> switch -c <branch>), or open a duty worktree with the MetroPlat verb duty-worktree-open {\"duty\":\"<ready-duty>\"}.");
    return;
  }
  if (sub === "clone") {
    const candidate = directory === undefined ? state.cloneCwd : resolveDir(directory, state.cloneCwd, ctx);
    const cloneCwd = directory === undefined || (candidate && isDirectory(candidate)) ? candidate : undefined;
    clone(positionals(args, CLONE_VALUE_OPTIONS), { cloneCwd }, ctx, report);
    return;
  }
  if (sub === "submodule") {
    const action = positionals(args)[0];
    const split = args.indexOf("--");
    if (["update", "foreach"].includes(action) && (action === "foreach" || args.includes("--recursive") || !(split >= 0 && split < args.length - 1) || args.slice(split+1).some(value => value === "." || value === ".." || /[*?[]/u.test(value)))) {
      report.deny(`git submodule ${action} at the top of this large repository${size} can acquire whole nested repository trees: initialize only one named canonical child without --recursive (git submodule update --init -- <path>), or work inside the existing child checkout.`);
    }
    return;
  }
  const parked = parkingRef(sub, args);
  if (parked !== undefined) { report.deny(parkingReason(parked)); return; }
  if (repo?.large !== true) return;

  // From here the repository is large: what reads or stats its whole working tree is the cost.
  const atTop = cwd === repo.top;
  const limits = (spec) => spec.startsWith(":") || /[*?[]/u.test(spec) || path.resolve(cwd, spec) !== repo.top;
  const limiting = (words, valueOptions = []) => positionals(words, valueOptions).filter(limits);
  const split = args.indexOf("--");
  const scopedByPath = (split >= 0 && args.slice(split + 1).some(limits)) || positionals(split < 0 ? args : args.slice(0, split)).some((word) => exists(path.resolve(cwd, word)) && limits(word));

  if (sub === "status") {
    if (limiting(args).length === 0) report.deny(`git status with no pathspec reads this repository's whole index${size} and stats every tracked file: pass a pathspec (git status -- <dir>) or use git diff --stat -- <dir>.`);
  } else if (sub === "ls-files") {
    if (limiting(args, ["-x", "-X", "--exclude", "--exclude-from", "--exclude-per-directory", "--with-tree", "--format"]).length === 0) {
      if (atTop) report.deny(`git ls-files with no pathspec lists every tracked file of this repository${size}: pass a pathspec (git ls-files -- <dir>) or use git ls-tree <ref> <dir>.`);
    }
  } else if (sub === "log") {
    const bounded = args.some((arg, k) => /^-\d+$/u.test(arg) || /^-n\d+$/u.test(arg) || arg.startsWith("--max-count") || (arg === "-n" && /^\d+$/u.test(args[k + 1] ?? "")));
    if (args.includes("--all") && !bounded) {
      if (!scopedByPath) report.deny(`git log --all with no pathspec walks every commit of a large repository${size}: bound it (git log --all -n 20) or scope it (git log -- <path>).`);
    }
  }
}

function clone(words, state, ctx, report) {
  const source = words[0];
  if (source === undefined) return;
  let destination = words[1];
  if (destination === undefined) {
    const name = expand(source, state.cloneCwd, ctx)?.replace(/[/:]+$/u, "").split(/[/:]/u).pop()?.replace(/\.git$/u, "");
    destination = name === undefined || name === "" ? undefined : name;
  }
  const resolved = destination === undefined ? undefined : resolveDir(destination, state.cloneCwd, ctx);
  if (resolved === undefined) {
    report.deny("git clone destination cannot be established: a missing or unresolved cd/pushd target is not a successful directory change, and an unresolved source cannot supply a destination basename. Use an explicit absolute destination inside the colony directory, e.g. git clone <url> ~/<colony>/<section>.");
    return;
  }
  // Everything the Group writes stays inside the colony directory (~/<colony>, e.g. ~/bare-cedar-fog);
  // a clone in /tmp, a scratchpad, ~/.cache or anywhere outside it is the data flood the Leader names.
  const colony = colonyOf(resolved, ctx);
  if (colony !== undefined && !isScratch(resolved, ctx)) {
    report.deny("raw git clone allocates another unreceived object database even inside the colony. Reuse the canonical checkout; read selected pins through source-working-copy-acquire, or initialize one named canonical child through its owning Git submodule route. Do not make scratch clones.");
    return;
  }
  report.deny(`git clone into ${resolved} is outside the colony directory: clone a repository only to its section's path inside ~/<colony> (${colonyOf(state.cloneCwd ?? "", ctx) ?? "~/<colony>"}), or work in the checkout the colony already holds. Never clone into /tmp, a scratchpad or a dot directory.`);
}

/** The colony directory holding `dir`: the first non-dot directory under the user's home, or undefined. */
function colonyOf(dir, ctx) {
  if (typeof dir !== "string" || !ctx.home || !within(dir, ctx.home) || dir === ctx.home) return undefined;
  const first = dir.slice(ctx.home.length + 1).split("/")[0];
  return first && !first.startsWith(".") ? path.join(ctx.home, first) : undefined;
}

/** The git directory serving `dir`: the nearest `.git` directory, or the target of a `.git` file's `gitdir:` line. */
function gitDirOf(dir) {
  for (let at = dir; ; at = path.dirname(at)) {
    const dotGit = path.join(at, ".git");
    try {
      if (statSync(dotGit).isDirectory()) return dotGit;
      const target = /^gitdir:\s*(.+)$/mu.exec(readFileSync(dotGit, "utf8"))?.[1]?.trim();
      if (target) return path.resolve(at, target);
    } catch { /* no .git here */ }
    if (at === path.dirname(at)) return undefined;
  }
}

/** A running git process working on the git directory `gitDir` (through its cwd, `-C` or `--git-dir`), or undefined. Bounded in time: past the bound the answer is "none seen". */
function gitProcessOn(gitDir) {
  const deadline = Date.now() + 30;
  let entries;
  try { entries = readdirSync("/proc"); } catch { return undefined; }
  for (const entry of entries) {
    if (Date.now() > deadline) return undefined;
    if (!/^\d+$/u.test(entry) || Number(entry) === process.pid) continue;
    try {
      const command = readFileSync(`/proc/${entry}/comm`, "utf8").trim();
      if (command !== "git" && !command.startsWith("git-")) continue;
      let dir = readlinkSync(`/proc/${entry}/cwd`);
      let explicit;
      const args = readFileSync(`/proc/${entry}/cmdline`, "utf8").split("\0");
      for (let i = 1; i < args.length - 1; i++) {
        if (args[i] === "-C") dir = path.resolve(dir, args[i + 1]);
        else if (args[i] === "--git-dir") explicit = path.resolve(dir, args[i + 1]);
      }
      if (args.some((arg) => arg.startsWith("--git-dir="))) explicit = path.resolve(dir, args.find((arg) => arg.startsWith("--git-dir=")).slice(10));
      const served = explicit ?? gitDirOf(dir);
      if (served !== undefined && path.resolve(served) === path.resolve(gitDir)) return Number(entry);
    } catch { /* it ended, or is not ours to read */ }
  }
  return undefined;
}

/** `rm .git/index.lock` while a git process is working on that git directory would corrupt the index it is writing. A submodule's git directory sits under its superproject's `.git/modules/`, so the lock's own directory, not the enclosing working tree, names the repository. */
function indexLock(argv, state, ctx, report) {
  for (const word of positionals(argv.slice(1))) {
    if (path.basename(word) !== "index.lock") continue;
    const file = resolveDir(word, state.cwd, ctx);
    const gitDir = file === undefined ? undefined : path.dirname(file);
    const running = gitDir === undefined ? undefined : gitProcessOn(gitDir);
    if (running !== undefined) {
      report.deny(`removing ${file} while git (pid ${running}) is working on ${gitDir} corrupts the index it is writing: wait for that git process to finish (check with pgrep -a git); the lock is stale only once no git process is left there.`);
      return;
    }
  }
}

const GH_VALUE = ["-R", "--repo", "-B", "--base", "-H", "--head", "-t", "--title", "-b", "--body", "-F", "--body-file", "-a", "--assignee", "-l", "--label", "-m", "--milestone", "-p", "--project", "-r", "--reviewer", "-q", "--jq", "--template", "-b", "--branch"];

const GH_MERGE_VALUE = ["-R", "--repo", "-A", "--author-email", "--match-head-commit", "-t", "--subject", "-b", "--body", "-F", "--body-file"];

/** The reason given on the `mass-deletion-intended: <reason>` line of a PR body, or undefined: a reason is required. */
export const massDeletionMarker = (body, marker = LIMITS.massDeletion.marker) => new RegExp(`^[\\s>*_-]*${marker}\\s*:[\\s*_]*(\\S.*)$`, "imu").exec(String(body ?? ""))?.[1]?.trim();

/**
 * Refuses to merge a pull request that removes a mass of its repository, unless its body says so
 * (`mass-deletion-intended: <reason>`). Reads `gh pr view` (changedFiles, body), then, only when the PR changes at
 * least `minFiles` files, the status of the first `sampleFiles` changed files and the base tree's file count.
 * Every failure to know (no gh, no network, a timeout, an unreadable answer) allows the merge.
 */
function guardMerge({ selector, repository, cwd }, ctx, report) {
  const limits = LIMITS.massDeletion;
  const deadline = Date.now() + limits.budgetMilliseconds;
  const call = (args) => {
    const left = deadline - Date.now();
    if (left < 250) return undefined;
    const result = ctx.run("gh", args, { cwd, timeout: Math.min(left, limits.callMilliseconds), env: ctx.env });
    return result.status === 0 ? result.stdout : undefined;
  };
  try {
    const where = repository ? ["-R", repository] : [];
    const view = JSON.parse(call(["pr", "view", ...(selector ? [selector] : []), ...where, "--json", "number,url,state,baseRefName,changedFiles,deletions,body"]) ?? "null");
    if (view === null || view.state !== "OPEN" || !(view.changedFiles >= limits.minFiles)) return;
    if (massDeletionMarker(view.body, limits.marker) !== undefined) return;
    const slug = /^https?:\/\/[^/]+\/([^/]+\/[^/]+)\/pull\/\d+/u.exec(view.url ?? "")?.[1];
    if (slug === undefined) return;
    let seen = 0;
    let removedSeen = 0;
    for (let page = 1; seen < Math.min(view.changedFiles, limits.sampleFiles); page += 1) {
      const statuses = call(["api", `repos/${slug}/pulls/${view.number}/files?per_page=100&page=${page}`, "--jq", ".[].status"]);
      if (statuses === undefined) return;
      const rows = statuses.split("\n").filter(Boolean);
      if (rows.length === 0) break;
      seen += rows.length;
      removedSeen += rows.filter((status) => status === "removed").length;
    }
    if (seen === 0) return;
    const removed = seen >= view.changedFiles ? removedSeen : Math.round((removedSeen / seen) * view.changedFiles);
    if (removed < limits.minFiles) return;
    const tree = call(["api", `repos/${slug}/git/trees/${encodeURIComponent(view.baseRefName)}?recursive=1`, "--jq", '[(.tree | map(select(.type != "tree")) | length), .truncated] | @tsv']);
    const total = Number(tree?.split("\t")[0]);
    if (!Number.isFinite(total) || total <= 0 || !isMassDeletion(removed, total)) return;
    const estimated = seen < view.changedFiles ? "about " : "";
    report.deny(`${slug}#${view.number} removes ${estimated}${removed} of the ${total} files in ${view.baseRefName} (${Math.round((removed / total) * 100)}%; ${view.changedFiles} files changed, ${view.deletions} lines deleted): a repair or extraction that emptied a repository looks like this. Read the removals (gh pr diff ${view.number} --name-only); if they are intended, add a line \`${limits.marker}: <reason>\` to the PR body (gh pr edit ${view.number} --body-file ...) and merge again. Merged unseen, the 2026-10-19 repair PRs deleted 31,084 files from one repository.`);
  } catch { /* fail open */ }
}

/** `gh api -X PUT repos/<owner>/<repo>/pulls/<n>/merge`: the same merge by the REST door. */
function apiMerge(args) {
  const method = optionValue(args, ["-X", "--method"]);
  const target = positionals(args, ["-X", "--method", "-H", "--header", "-f", "--raw-field", "-F", "--field", "--jq", "-q", "--template", "-t", "--input", "--cache", "--hostname"]).find((word) => /\/pulls\/\d+\/merge$/u.test(word));
  if (target === undefined || String(method).toUpperCase() !== "PUT") return undefined;
  const found = /(?:^|\/)repos\/([^/]+\/[^/]+)\/pulls\/(\d+)\/merge$/u.exec(target);
  return found === null ? undefined : { repository: found[1], selector: found[2] };
}

function github(argv, state, ctx, report) {
  const args = argv.slice(1);
  const cut = args.indexOf("--");
  const [group, action, ...rest] = positionals(cut < 0 ? args : args.slice(0, cut), GH_VALUE);
  if (group === "repo" && action === "clone") { clone(rest, state, ctx, report); return; }
  if (ctx.env.AGENT_MERGE_GUARD !== "off") {
    if (group === "pr" && action === "merge") {
      const operands = positionals(cut < 0 ? args : args.slice(0, cut), GH_MERGE_VALUE).slice(2);
      if (operands.every((word) => !/[$`]/u.test(word))) guardMerge({ selector: operands[0], repository: optionValue(args, ["-R", "--repo"]), cwd: state.cwd }, ctx, report);
    } else if (group === "api") {
      const target = apiMerge(args.slice(1));
      if (target !== undefined) guardMerge({ ...target, cwd: state.cwd }, ctx, report);
    }
  }
}

function parseFind(args) {
  const roots = [];
  let i = 0;
  while (i < args.length) {
    const word = args[i];
    if (["-D", "-S", "-j", "-regextype"].includes(word)) { i += 2; continue; }
    if (word === "-f") { roots.push(args[i + 1] ?? "."); i += 2; continue; }
    if (["-H", "-L", "-P", "-E", "-X", "-d", "-s", "-x", "-color", "-nocolor", "-nohidden", "-noerror", "-unique", "-status", "-warn", "-nowarn"].includes(word) || /^-O\d?$/u.test(word)) { i += 1; continue; }
    if (word.startsWith("-") || word === "(" || word === "!" || word === ",") break;
    roots.push(word);
    i += 1;
  }
  let maxDepth;
  for (let k = 0; k < args.length - 1; k += 1) {
    if (args[k] === "-maxdepth" && /^\d+$/u.test(args[k + 1])) maxDepth = Math.min(maxDepth ?? Infinity, Number(args[k + 1]));
  }
  return { roots, maxDepth };
}

function find(argv, state, ctx, report) {
  const { roots, maxDepth } = parseFind(argv.slice(1));
  if (maxDepth !== undefined && maxDepth <= LIMITS.findMaxDepth) return;
  for (const root of roots.length > 0 ? roots : ["."]) {
    const dir = resolveDir(root, state.cwd, ctx);
    if (dir !== undefined && isBroad(dir, ctx)) {
      report.deny(`${path.basename(argv[0])} rooted at ${dir} walks the whole disk or a large working tree: add -maxdepth ${LIMITS.findMaxDepth} or a narrower root, or search contents with rg -g '<glob>' <dir> and tracked names with git ls-files -- <pathspec> in a small repository.`);
      return;
    }
  }
}

function scanner(name, argv, piped, state, ctx, report) {
  const spec = SCANNERS[name];
  const args = argv.slice(1);
  if (!spec.recursive(args)) return;
  const depth = spec.depth.length === 0 ? undefined : optionValue(args, spec.depth);
  if (depth !== undefined && /^\d+$/u.test(depth) && Number(depth) <= LIMITS.findMaxDepth) return;
  let paths = positionals(args, spec.value);
  if (spec.pattern !== false && !args.some((arg) => spec.noPattern.some((option) => arg === option || (option.startsWith("--") && arg.startsWith(`${option}=`))))) paths = paths.slice(1);
  if (paths.length === 0) {
    if (piped && spec.stdin === true) return;
    paths = ["."];
  }
  for (const word of paths) {
    const dir = resolveDir(word, state.cwd, ctx);
    // Rule no-whole-tree-scans-on-bare-cedar-fog: a recursive scan of a disk, a home or a large working tree is denied like
    // `find`, not run; the settings deny list matches command prefixes, so `cd … && grep -r …` reaches only this hook.
    if (dir !== undefined && isBroad(dir, ctx)) { report.deny(`${name} recursing from ${dir} scans the whole disk or a large working tree (rule no-whole-tree-scans-on-bare-cedar-fog): search a named section's directory (rg -n <pattern> <section-dir>), read the file a note or term already cites, or hand a broad sweep to an Explore agent.`); return; }
  }
}

function dependencyProduction(name, words, report) {
  if(!["npm","npx","pnpm","yarn","bun","bunx"].includes(name))return false;
  const args=words.slice(1), positional=positionals(args,["--prefix","--dir","-C","--cwd","--cache","--store-dir","--registry","--userconfig","--globalconfig","--filter","--package","-p"]);
  const action=positional[0];
  const installation=(name==="npm"&&["install","i","ci","add","update","upgrade","rebuild"].includes(action))
    ||(name==="pnpm"&&["install","i","add","update","up","rebuild","fetch","dlx"].includes(action))
    ||(name==="yarn"&&(action===undefined||["install","add","upgrade","up","dlx"].includes(action)))
    ||(name==="bun"&&["install","i","add","update"].includes(action));
  const fetchingExec=name==="npx"||name==="bunx"||name==="npm"&&action==="exec";
  // A lockfile-only resolution writes no node_modules and runs no lifecycle script; the repository's
  // own .pnpmfile.cjs (the house's one-version-per-family rule) must still shape that resolution.
  const lockOnly=args.includes("--ignore-scripts")&&(name==="npm"&&args.includes("--package-lock-only")||name==="pnpm"&&["install","i","add"].includes(action)&&args.includes("--lockfile-only"))&&!args.some(arg=>["--package-lock-only=false","--lockfile-only=false"].includes(arg));
  if((installation&&!lockOnly)||(fetchingExec&&!args.includes("--no-install")))
    report.deny("direct dependency installation or fetch-on-exec can allocate an unreceived graph/cache. Prepare dependencies through the MetroPlat verb duty-worktree-open with explicit installation selection, input {\"duty\":\"<ready-duty>\",\"dependencies\":true} (it links the duty worktree through the shared store and returns the lifecycle receipt), or, to converge house package pins, run node scripts/converge-house-dependencies.mjs <package> --apply from computer-code-development-engine; use already received dependencies for checks. Lockfile-only metadata resolution remains available as `pnpm install --lockfile-only --ignore-scripts` (or `npm install --package-lock-only --ignore-scripts`), and no-install execution as `npx --no-install`.");
  return true;
}

function simple(command, frame, ctx, report, depth) {
  const words = unwrap(withoutRedirections(command.words, command.quoted));
  if (words.length === 0) return;
  const name = path.basename(words[0].replaceAll("\\","/")).replace(/\.(?:exe|cmd|bat)$/iu, "").toLowerCase();
  if (SKIPPED.has(name)) return;
  const cwdOf = (scope) => {
    if (!frame.cwds.has(scope)) frame.cwds.set(scope, cwdOf(frame.scopes[scope].parent));
    return frame.cwds.get(scope);
  };
  const cloneCwdOf = (scope) => {
    if (!frame.cloneCwds.has(scope)) frame.cloneCwds.set(scope, cloneCwdOf(frame.scopes[scope].parent));
    return frame.cloneCwds.get(scope);
  };
  const here = { cwd: cwdOf(command.scope), cloneCwd: cloneCwdOf(command.scope) };
  if (name === "cd" || name === "pushd") {
    const target = positionals(words.slice(1))[0];
    frame.cwds.set(command.scope, target === "-" ? undefined : target === undefined ? ctx.home : resolveDir(target, here.cwd, ctx));
    // Keep the existing scan heuristic, but never grant clone custody from a directory
    // that is only intended. A failed `cd; clone` otherwise runs in the caller's tree.
    const cloneCwd = target === "-" ? undefined : target === undefined ? ctx.home : resolveDir(target, here.cloneCwd, ctx);
    frame.cloneCwds.set(command.scope, cloneCwd && isDirectory(cloneCwd) ? cloneCwd : undefined);
    return;
  }
  if (SHELLS.has(name)) {
    const at = words.findIndex((word, k) => k > 0 && /^-[A-Za-z]*c[A-Za-z]*$/u.test(word));
    if (at > 0 && words[at + 1] !== undefined) walk(words[at + 1], here.cwd, ctx, report, depth + 1, here.cloneCwd);
    return;
  }
  if (name === "eval") { walk(words.slice(1).join(" "), here.cwd, ctx, report, depth + 1, here.cloneCwd); return; }
  if (dependencyProduction(name, words, report)) return;
  if (name === "find" || name === "bfs") { find(words, here, ctx, report); return; }
  if (name === "git") { git(words, here, ctx, report); return; }
  if (name === "gh") { github(words, here, ctx, report); return; }
  if (name === "rm" || name === "unlink") { indexLock(words, here, ctx, report); return; }
  if (Object.hasOwn(SCANNERS, name)) scanner(name, words, command.piped, here, ctx, report);
}

function walk(source, cwd, ctx, report, depth, cloneCwd) {
  if (depth > LIMITS.maxShellDepth) return;
  const { commands, scopes } = parseShell(source);
  const frame = { scopes, cwds: new Map([[0, cwd]]), cloneCwds: new Map([[0, cloneCwd]]) };
  for (const command of commands) simple(command, frame, ctx, report, depth);
}

/** `{ action: "deny", reason } | { action: "allow" }` for a command line run in `cwd`. */
export function classify(command, { cwd, env = process.env, home, scratchpad, run } = {}) {
  const ctx = makeContext({ cwd, scratchpad_dir: scratchpad }, env, { home, run });
  const denied = [];
  walk(command, ctx.cwd, ctx, { deny: (reason) => denied.push(reason) }, 0, ctx.cwd);
  return denied.length > 0 ? { action: "deny", reason: denied[0] } : { action: "allow" };
}

const isDirectory = (dir) => { try { return statSync(dir).isDirectory(); } catch { return false; } };
const onPath = (name, env) => (env.PATH ?? "").split(":").some((dir) => {
  if (dir === "") return false;
  try { accessSync(path.join(dir, name), constants.X_OK); return true; } catch { return false; }
});

export const shellQuote = (text) => `'${String(text).replaceAll("'", "'\\''")}'`;

// ---------------------------------------------------------------------------------------------
// Containment: everything a Claude Code session runs, held by the kernel to a share of the host.
// ---------------------------------------------------------------------------------------------

/**
 * The user-manager slice every process of every Claude Code session runs in. Its cgroup limits bind
 * the sum of all of it (sessions, subagents, monitors, commands, MCP servers), so no number of them
 * can take the machine from the person using it: the cap is the kernel's, not a rule a session is
 * trusted to keep.
 */
export const CONTAINMENT_SLICE = "agent-claude.slice";
/**
 * The slice the commands of every session run in, a sibling of the sessions' own under `agent.slice`.
 * Its memory ceiling binds the commands only, so a runaway build or test is reclaimed or killed and
 * the session that started it (and every subagent it holds) lives on to see the failure.
 */
export const WORK_SLICE = "agent-work.slice";

/**
 * Read the effective allocation of the destination user manager, not the
 * launcher's cgroup. WSL-launched agents and systemd user work are siblings;
 * sizing work from the VM ignored its tighter user.slice allocation and let
 * one npm process throttle the manager before the work limit could act.
 * Only these four known ancestors and their native limit files are read.
 */
export function effectiveUserServiceMemory({ memory = totalmem(), uid = process.getuid?.(), cgroupRoot = "/sys/fs/cgroup" } = {}) {
  if (!Number.isSafeInteger(uid) || uid < 0) return memory;
  const ancestors = ["", "user.slice", `user.slice/user-${uid}.slice`, `user.slice/user-${uid}.slice/user@${uid}.service`];
  let effective = memory;
  for (const ancestor of ancestors) for (const limit of ["memory.high", "memory.max"]) {
    try {
      const text = readFileSync(path.join(cgroupRoot, ancestor, limit), "utf8").trim();
      if (!/^[1-9][0-9]*$/u.test(text)) continue;
      const bytes = Number(text);
      if (Number.isSafeInteger(bytes)) effective = Math.min(effective, bytes);
    } catch { /* A non-cgroup host keeps the existing physical-memory fallback. */ }
  }
  return effective;
}

/**
 * The work slice's limits within `memory` bytes of effective user-service allocation: a low CPU weight, so the person at the machine
 * wins any contention while an otherwise idle host still runs agents' work at full speed (a hard CPU
 * quota of a quarter of the processors starved nine agents on an idle sixteen-processor host); a
 * command killed above 60% of the host, with no swap, so an exhausted command fails rather than the
 * machine thrashing; and a task ceiling that stops a runaway fan-out of processes. There is no
 * MemoryHigh: with no swap, anonymous memory cannot be reclaimed, so a high mark only throttles every
 * allocation in the slice without end. On 2026-10-24 the slice sat between its 45% high and 60% max
 * for hours (26.7M high events, 247 max events): every agent's command stalled, nothing was killed.
 */
export function containmentLimits({ memory = effectiveUserServiceMemory() } = {}) {
  const share = (fraction) => `${Math.floor((memory * fraction) / (1024 * 1024))}M`;
  return Object.freeze({ CPUWeight: 20, MemoryMax: share(0.6), MemorySwapMax: 0, TasksMax: 1024 });
}

/** The sessions' slice: protected, not capped. Their memory up to 10% of the host (at most 1.5 GiB) is reclaimed last, so the work slice's pressure never starves the sessions directing it. */
export function sessionLimits({ memory = totalmem() } = {}) {
  return Object.freeze({ CPUWeight: 50, MemoryLow: `${Math.floor(Math.min(memory * 0.1, 1536 * 1024 * 1024) / (1024 * 1024))}M` });
}

/** A systemd user slice unit holding `limits` (`~/.config/systemd/user/<slice>`). */
export function sliceUnit(limits = containmentLimits(), { description = "The commands every Claude Code session runs, held to a share of this host" } = {}) {
  return [
    "[Unit]",
    `Description=${description}`,
    "",
    "[Slice]",
    ...Object.entries(limits).map(([key, value]) => `${key}=${value}`),
    "",
  ].join("\n");
}

/**
 * The launcher a harness runs in place of the `claude` executable (the VS Code extension's
 * `claudeCode.claudeProcessWrapper`, which is handed the executable and its arguments): it starts
 * them inside a transient scope of the slice, so the session and everything it ever spawns are
 * contained from its first instruction. A process already in the slice is started directly. Where
 * the user's systemd cannot place it, it says so and starts the session uncontained, whose commands
 * the hook then places in the slice one by one if it can.
 */
export function launcherScript({ slice = CONTAINMENT_SLICE } = {}) {
  const run = `systemd-run --user --scope --quiet --collect --slice=${slice}`;
  return [
    "#!/bin/sh",
    "# Generated by install-host-resource-hook (agent-harness); an install replaces any edit.",
    `# Runs "$@", the claude executable and its arguments, inside ${slice}.`,
    ': "${XDG_RUNTIME_DIR:=/run/user/$(id -u)}"',
    "export XDG_RUNTIME_DIR",
    `case "$(cat /proc/self/cgroup 2>/dev/null)" in */${slice}/*) exec "$@" ;; esac`,
    `if [ -S "$XDG_RUNTIME_DIR/bus" ] && command -v systemd-run >/dev/null 2>&1 && ${run} true 2>/dev/null; then`,
    `  exec ${run} -- "$@"`,
    "fi",
    `echo "claude launcher: the user's systemd could not place this session in ${slice}; it runs uncontained" >&2`,
    'exec "$@"',
    "",
  ].join("\n");
}

/** Whether a process whose `/proc/<pid>/cgroup` reads `cgroup` runs inside the slice. */
export const isContained = (cgroup, slice = CONTAINMENT_SLICE) => typeof cgroup === "string" && cgroup.includes(`/${slice}/`);

const ownCgroup = () => {
  try { return readFileSync("/proc/self/cgroup", "utf8"); } catch { return undefined; }
};

/** Whether a command can be placed in the slice from here: `systemd-run` on PATH and the user manager's bus at `$XDG_RUNTIME_DIR/bus`. */
function canContain(env) {
  if (env.AGENT_CONTAINMENT === "off" || !env.XDG_RUNTIME_DIR || !onPath("systemd-run", env)) return false;
  try { return statSync(path.join(env.XDG_RUNTIME_DIR, "bus")).isSocket(); } catch { return false; }
}

/**
 * `original` run in a transient scope of the work slice, in this shell's environment, keeping its exit
 * status and the directory it ends in (the harness reads the shell's directory after the command,
 * so a `cd` inside the scope must carry back out of it).
 *
 * The scope fails open like the rest of the hook. `canContain` sees only that the user manager's bus
 * socket exists; a manager that has died behind it ("Failed to start transient scope unit: Transport
 * endpoint is not connected") refuses every scope, and the command would never run. The command's
 * first act is to mark that it started, so a scope that never started runs the command here,
 * uncontained, while one that started and was killed in the slice is not run a second time.
 *
 * What systemd-run says when it cannot start the scope is kept, not discarded: its standard error goes to a file beside the
 * directory record (the command's own standard error is restored from file descriptor 3 as its first act, so the command
 * never writes there), and when no scope started that text is shown, then handed with the exit status to `recorder`
 * (`{ node, script }`, the scope-failure record entry), which keeps it with the user manager's state in an OTLP record.
 * The recorder is optional, time-bounded and never the reason the command does not run.
 */
export function containedCommand(original, { slice = WORK_SLICE, recorder = null } = {}) {
  const inner = `: >"$_AH_DIR.ran"; exec 2>&3 3>&-; trap 'pwd -P >"$_AH_DIR" 2>/dev/null' EXIT; ${requestedTimeoutPrelude}; ${original}`;
  const record = recorder ? `; { timeout 30 ${shellQuote(recorder.node)} ${shellQuote(recorder.script)} "$_ah_dir.err" "$_ah_rc" >/dev/null 2>&1 || true; }` : "";
  return [
    '_ah_dir=$(mktemp "${XDG_RUNTIME_DIR:-${TMPDIR:-/tmp}}/agent-dir.XXXXXX" 2>/dev/null || mktemp)',
    `_AH_DIR="$_ah_dir" systemd-run --user --scope --quiet --collect --slice=${slice} -- bash -c ${shellQuote(inner)} 3>&2 2>"$_ah_dir.err"`,
    "_ah_rc=$?",
    `[ -e "$_ah_dir.ran" ] || { cat "$_ah_dir.err" >&2 2>/dev/null${record}; _AH_DIR="$_ah_dir" bash -c ${shellQuote(inner)} 3>&2; _ah_rc=$?; }`,
    '_ah_to=$(cat "$_ah_dir" 2>/dev/null); unlink -- "$_ah_dir"; if [ -e "$_ah_dir.ran" ]; then unlink -- "$_ah_dir.ran"; fi; unlink -- "$_ah_dir.err" 2>/dev/null',
    '[ -z "$_ah_to" ] || cd "$_ah_to"',
    '(exit "$_ah_rc")',
  ].join("; ");
}

const SHELL_TOOLS = /^(Bash|shell|exec_command|local_shell|container\.exec)$/u;
/** Claude Code's Monitor runs a shell command for as long as it watches: always contained. */
const WATCH_TOOLS = /^Monitor$/u;

/** Programs the harness's own removal check must read as written. Contained, a command is a
 *  `systemd-run … bash -c` carrier that check cannot see into, so it refuses every removal. */
const SELF_CHECKED_PROGRAMS = new Set(["rm", "rmdir", "unlink"]);

/** Whether any simple command of `command` is a removal the harness checks itself. The whole line is
 *  left uncontained so that check reads it and asks, instead of refusing an unreadable carrier. */
export function isSelfCheckedRemoval(command) {
  try {
    const { commands } = parseShell(command);
    return commands.some(({ words }) => SELF_CHECKED_PROGRAMS.has(words[0]));
  } catch {
    return false;
  }
}

/**
 * The hook's answer to one PreToolUse event: the `hookSpecificOutput` object, or undefined to let
 * the command run untouched. `provider` is "claude" or "codex"; only a Claude Code session is
 * rewritten. `cgroup` is the session's own cgroup (the hook inherits it).
 *
 * A Claude Code session outside the slice has its commands placed there: every command when it runs
 * without permission rules (`bypassPermissions`), and otherwise only the `Monitor` watches,
 * so no command an allow rule admits starts asking because of it.
 */
export function decide(input, { env = process.env, provider = "claude", home, cgroup = ownCgroup(), run: runner } = {}) {
  if (env.AGENT_HOST_GUARD === "off") return undefined;
  const toolInput = input?.tool_input;
  const tool = String(input?.tool_name);
  const watch = provider === "claude" && WATCH_TOOLS.test(tool);
  if (!(SHELL_TOOLS.test(tool) || watch) || typeof toolInput?.command !== "string") return undefined;
  const command = toolInput.command;
  if (command.trim() === "" || command.length > LIMITS.maxCommandLength) return undefined;
  const verdict = classify(command, { cwd: input.cwd, env, home, scratchpad: input.scratchpad_dir, run: runner });
  if (verdict.action === "deny") {
    return { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: `host-resource guard: ${verdict.reason}` };
  }
  // A session confined to an allow-list (`dontAsk`, the carriers') has its permission rules checked
  // against the rewritten command, which no allowed pattern matches: it is denied there, never rewritten.
  if (input.permission_mode === "dontAsk") return undefined;
  // Commands go to the work slice even from a session inside its own slice, so a command's memory never counts against the session.
  const contain = provider === "claude" && !isContained(cgroup, WORK_SLICE) && (watch || (input.permission_mode === "bypassPermissions" && !isSelfCheckedRemoval(command))) && canContain(env);
  if (!contain) return undefined;
  return { hookEventName: "PreToolUse", updatedInput: { ...toolInput, command: containedCommand(command, { recorder: { node: process.execPath, script: fileURLToPath(new URL("./scope-failure-record.mjs", import.meta.url)) } }) } };
}

/** The stdin of one hook run to its stdout; undefined for an untouched command or any failure. */
export function run(stdin, { env = process.env, provider = "claude" } = {}) {
  try {
    const output = decide(JSON.parse(stdin), { env, provider });
    return output === undefined ? undefined : JSON.stringify({ hookSpecificOutput: output });
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------------------------
// What a harness projects to install the hook.
// ---------------------------------------------------------------------------------------------

/** The `hooks` object naming the hook for shell tool calls (Claude Code's Bash and Monitor, Codex's Bash), valid in Claude Code settings and in Codex `hooks.json`. */
export function hookEntries(hookPath, { provider = "claude", node = process.execPath, timeout = 15 } = {}) {
  const command = `${shellQuote(node)} ${shellQuote(hookPath)}${provider === "codex" ? " --provider codex" : ""}`;
  return { PreToolUse: [{ matcher: provider === "codex" ? "Bash" : "Bash|Monitor", hooks: [{ type: "command", command, timeout }] }] };
}

/** One source reference for both providers; no copied executable hook bodies. */
export function hostResourceControl({ node, codex = true }) {
  node = path.resolve(node);
  const source = fileURLToPath(import.meta.url);
  const files = new Map();
  if (codex) files.set(".codex/hooks.json", `${JSON.stringify({ hooks: hookEntries(source, { provider: "codex" }) }, null, 2)}\n`);
  return Object.freeze({ source, files, hooks: hookEntries(source) });
}

/** Retain unrelated hooks; replace every copy of this guard, from whichever install wrote it (a source
 *  checkout, an app's dependencies, a release), so a node runs the guard once. */
export function mergeHostResourceHooks(existing, entries, node, { retiredSources = [] } = {}) {
  const sources = [fileURLToPath(import.meta.url), ...retiredSources];
  const guard = /\/host-resource-hook\.mjs['"]?(?:\s|$)/u;
  const hooks = { ...existing };
  hooks.PreToolUse = (hooks.PreToolUse ?? []).flatMap(group => {
    const held = (group.hooks ?? []).filter(handler => {
      const command = String(handler.command ?? "");
      return !guard.test(command) && !sources.some(source => command.includes(source));
    });
    return held.length === 0 ? [] : [{ ...group, hooks: held }];
  });
  hooks.PreToolUse.push(...(entries.PreToolUse ?? []));
  return hooks;
}

/** Enable this one existing feature without replacing the caller's TOML configuration. */
function enabledHooksConfiguration(text) {
  const lines = text.split("\n");
  const start = lines.findIndex(line => /^\s*\[features\]\s*(?:#.*)?$/.test(line));
  if (start < 0) return `${text}${text.endsWith("\n") || text === "" ? "" : "\n"}\n[features]\nhooks = true\n`;
  let end = start + 1;
  while (end < lines.length && !/^\s*\[/.test(lines[end])) end++;
  const matches = lines.slice(start + 1, end).map((line, index) => ({ line, index: start + 1 + index })).filter(value => /^\s*hooks\s*=/.test(value.line));
  if (matches.length > 1) throw new Error("host-resource projection refuses duplicate features.hooks settings");
  if (matches.length === 0) lines.splice(start + 1, 0, "hooks = true");
  else {
    const { line, index } = matches[0];
    if (!/^\s*hooks\s*=\s*(true|false)\s*(?:#.*)?$/.test(line)) throw new Error("host-resource projection requires an ordinary Boolean features.hooks setting");
    lines[index] = line.replace(/(=\s*)(true|false)/, "$1true");
  }
  return lines.join("\n");
}

/** Actual local projection, never a Codex trust admission or a claim about an already running session. */
export function writeHostResourceControl({ node, providers = ["claude", "codex"], retiredSources = [], dryRun = false }) {
  node = path.resolve(node);
  if (providers.some(provider => !["claude", "codex"].includes(provider))) throw new TypeError("unknown resource-hook provider");
  const source = fileURLToPath(import.meta.url);
  const written = [];
  const expected = new Map();
  const pending = new Map();
  const read = relative => {
    const file = path.join(node, relative);
    const text = existsSync(file) ? readFileSync(file, "utf8") : undefined;
    expected.set(relative, text);
    return text;
  };
  for (const provider of providers) {
    const relative = provider === "claude" ? ".claude/settings.local.json" : ".codex/hooks.json";
    const held = JSON.parse(read(relative) ?? "{}");
    pending.set(relative, `${JSON.stringify({ ...held, hooks: mergeHostResourceHooks(held.hooks, hookEntries(source, { provider }), node, { retiredSources }) }, null, 2)}\n`);
    if (provider === "codex") pending.set(".codex/config.toml", enabledHooksConfiguration(read(".codex/config.toml") ?? ""));
  }
  // Validate all input before any configuration write; preserve another author's concurrent edit.
  for (const [relative, previous] of expected) {
    const file = path.join(node, relative);
    const current = existsSync(file) ? readFileSync(file, "utf8") : undefined;
    if (current !== previous) throw new Error(`host-resource configuration changed during projection: ${relative}`);
  }
  for (const [relative, text] of pending) {
    if (expected.get(relative) === text) continue;
    written.push(relative);
    if (dryRun) continue;
    const file = path.join(node, relative);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, text, { mode: 0o600 });
  }
  return Object.freeze({ source, written, codexTrustRequired: providers.includes("codex"), activeSessionGuarded: false });
}

/** The Claude Code CLI arguments that give a headless session (`--setting-sources ""`) the hook. */
export const hookSettingsArguments = (hookPath) => ["--settings", JSON.stringify({ hooks: hookEntries(hookPath) })];

/**
 * The process: the event on stdin to a decision on stdout. Whatever happens, it is gone within
 * `guardMilliseconds` of starting to wait: a stdin that never closes, a closed one or a broken one
 * leaves the command untouched.
 */
function main() {
  const guard = setTimeout(() => process.exit(0), LIMITS.guardMilliseconds);
  guard.unref();
  const chunks = [];
  process.stdin.on("data", (chunk) => chunks.push(chunk));
  process.stdin.on("error", () => process.exit(0));
  process.stdin.on("end", () => {
    // stdin closed: the 200 ms timer has done its job. What follows is bounded by the decision itself
    // (a merge check holds a ten-second budget inside the hook's 15 s timeout), so the timer must not cut it short.
    clearTimeout(guard);
    try {
      const at = process.argv.indexOf("--provider");
      const output = run(Buffer.concat(chunks).toString("utf8"), { provider: at < 0 ? "claude" : process.argv[at + 1] });
      if (output !== undefined) process.stdout.write(output);
    } catch { /* fail open */ }
  });
}

let invoked = false;
try { invoked = process.argv[1] !== undefined && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url)); } catch { invoked = false; }
if (invoked) main();
