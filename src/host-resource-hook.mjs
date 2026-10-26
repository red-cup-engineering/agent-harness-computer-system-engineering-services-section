#!/usr/bin/env node
/**
 * The host-resource controller: one PreToolUse hook that mediates the Bash commands of every agent
 * session on a machine, so that no number of concurrent sessions, subagents or Codex processes can
 * exhaust its disk or memory. The control is software in the harness and not an instruction an agent
 * is trusted to follow: the harness hands the hook each command before it runs, and the hook answers
 * one of three ways. Beneath it sits a kernel cap (see "Containment" below): every process a Claude
 * Code session runs lives in one user-manager slice, `agent-claude.slice`, whose cgroup limits bind
 * the sum of all of it to a share of the host, however many sessions and subagents there are. A
 * session started by the launcher `launcherScript` writes is inside the slice from its first
 * instruction; for one that is not, the hook places its commands there itself.
 *
 *   deny       the command reads or writes far more than it can be worth (`find`, or a recursive
 *              `grep`/`rg`/`ag`/`ack`/`fd`/`tree`, over the disk, a home or a large working tree, `git worktree add`, `git clone` into a working directory, an
 *              unscoped `git status`/`git log --all`/`git ls-files` and `git submodule update|foreach`
 *              in a large repository, `rm .git/index.lock` while a git process works there); the
 *              reason, shown to the agent, names the safe alternative;
 *   serialize  the command is disk- or CPU-heavy (clone, a fetch or push in a large repository or of all
 *              history, gc, repack, archive, recursive
 *              tree reads, du/tar/rsync outside scratch, package installs, guix, lake,
 *              cargo, make, and git or gh operations that stat a large working tree). It is rewritten
 *              (`updatedInput.command`) to run in one of the host's heavy SLOTS, each a kernel lock
 *              (`flock(1)` on a file every process of the user shares), at `nice -n 10` and idle I/O
 *              class. The host admits one heavy command by default (AGENT_HEAVY_SLOTS
 *              explicitly overrides), and ONE while memory or I/O is under pressure: when every task stalled on memory
 *              for at least AGENT_HEAVY_PRESSURE percent (default 10) of the last ten seconds
 *              (/proc/pressure/memory, "full avg10"), admitting more heavy work only deepens the stall.
 *              A command takes the first free slot, else waits on one. Holding a slot it is ADMITTED
 *              only when the agent work slice has room (see "Room" below), else it waits for the kernel
 *              to say a scope of the slice ended, never on a timer;
 *   allow      everything else, untouched (no output).
 *
 * The lock is the kernel's, so a crashed or killed holder releases it at once and nothing can be
 * left stale or raced, which a lease kept in a JSON file cannot promise. (The carrier's own
 * provider-capacity lease, `carrier/session.mjs`, admits whole agent sessions through slot records
 * guarded by the same `flock`; it meters the number of sessions, this meters the weight of what
 * each runs, and the two compose.)
 *
 * Contract (Claude Code and Codex share it): the event arrives as JSON on stdin (`tool_name`,
 * `tool_input.command`, `cwd`); a decision leaves as `hookSpecificOutput` on stdout with exit 0. A
 * deny is `permissionDecision: "deny"` plus `permissionDecisionReason`; a rewrite is `updatedInput`
 * (it replaces the whole input, so unchanged fields are carried over). The hook FAILS OPEN: on any
 * internal error, malformed input, a missing `flock` or an unwritable lock it prints nothing and
 * exits 0, and the command runs as if the hook were absent. A hook is a guardrail on a cooperative
 * agent, not a security boundary, and it must never be the reason work stops. It never waits on
 * anything: the lock is taken by the rewritten command, not by the hook, and a 200 ms timer ends the
 * process if stdin never closes. The one exception is the mass-deletion guard (`gh pr merge`, `git commit -a`):
 * it asks gh and git, within a ten-second budget, and allows the command when it cannot find out.
 *
 * Zero dependencies: projections reference this one owning source file and the verified Node
 * executable that runs the projecting harness. It reads a handful of stat results and no repository state, so it adds only node's
 * own start-up time. Settings are read from the hook's own process environment (the harness's, which
 * an agent's command cannot change): AGENT_HOST_GUARD=off disables it; AGENT_CONTAINMENT=off leaves
 * commands outside the slice; AGENT_HEAVY_ROOM=off turns the room gate off and AGENT_HEAVY_ROOM_MB sets the room
 * (MiB) a heavy command is held to; AGENT_HEAVY_LOCK, AGENT_HEAVY_WAIT_SECONDS, AGENT_HEAVY_LARGE_REPO_FILES
 * and AGENT_HEAVY_LARGE_REPO_INDEX_BYTES tune it.
 */
import { spawnSync } from "node:child_process";
import { accessSync, closeSync, constants, existsSync, lstatSync, mkdirSync, openSync, readFileSync, readSync, readdirSync, readlinkSync, realpathSync, statSync, watch, writeFileSync } from "node:fs";
import { homedir, tmpdir, totalmem } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const LOCK_FILE = "agent-heavy.lock";
/** Memory pressure (percent of the last ten seconds every task stalled on memory) at which the host admits one heavy command at a time. */
export const PRESSURE_PERCENT = 10;
/** The exit status of a heavy command that never ran because the host's one heavy slot stayed busy. */
export const BUSY_EXIT_CODE = 75;
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
  waitSeconds: 110,
  minWaitSeconds: 20,
  maxWaitSeconds: 900,
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

/** Whether scanning `dir` recursively walks a disk, a home or a large working tree. */
function isBroad(dir, ctx) {
  if (SYSTEM_TREES.has(dir)) return true;
  if (dir === ctx.home || ctx.home.startsWith(`${dir}/`)) return true;
  if (/^\/mnt\/[^/]+$/u.test(dir) || /^\/(home|Users)\/[^/]+$/u.test(dir)) return true;
  const repo = repoOf(dir, ctx);
  return repo !== undefined && repo.top === dir && repo.large;
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

/** The command a line really runs: leading assignments, keywords and wrappers (sudo, env, nice, timeout, xargs, flock...) removed. `onLock` is told the lock file of a flock. */
function unwrap(argv, onLock) {
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
    if (wrapper === "flock" && words[i] !== undefined) onLock?.(words[i]);
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

const NPM_INSTALL = new Set(["install", "i", "add", "ci", "update", "up", "upgrade", "rebuild", "dedupe", "ddp", "link", "ln", "prune", "fetch", "import", "install-test", "it"]);
const GUIX_HEAVY = new Set(["build", "pull", "shell", "environment", "package", "install", "upgrade", "gc", "system", "home", "deploy", "time-machine", "archive", "copy", "weather", "lint", "refresh", "challenge"]);
const LAKE_HEAVY = new Set(["build", "update", "exe", "test", "lint", "clean", "check-build", "cache", "upload", "pack", "unpack"]);
const CARGO_LIGHT = new Set(["version", "help", "locate-project", "pkgid", "read-manifest", "config", "search", "login", "logout", "owner", "yank", "verify-project", "fmt", "metadata"]);
const DOCKER_HEAVY = new Set(["build", "pull", "push", "load", "save", "import", "export", "buildx", "builder"]);
// A transfer costs the history it packs or unpacks, not the crossing of the network: a few commits pushed from a
// small clone are light, and holding them behind the host's one heavy slot only starves the work that made them
// (2026-10-26: a two-file push waited 15 minutes behind another session's job). A large or unrecognized repository,
// or a transfer of every ref or the whole history, still serializes.
const GIT_TRANSFERS = new Set(["fetch", "push", "pull"]);
const WHOLE_HISTORY_TRANSFER = new Set(["--all", "--mirror", "--unshallow", "--tags", "--recurse-submodules", "--recurse-submodules=yes", "--recurse-submodules=on-demand"]);
const GIT_ALWAYS_HEAVY = new Set(["gc", "repack", "archive", "prune", "maintenance", "bundle", "fsck", "index-pack", "pack-objects", "unpack-objects", "fast-import", "fast-export", "filter-branch", "filter-repo", "commit-graph", "multi-pack-index", "lfs", "prune-packed", "pack-refs", "bisect"]);
const GIT_WORKTREE_WIDE = new Set(["stash", "checkout", "switch", "reset", "clean", "merge", "rebase", "cherry-pick", "revert"]);
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
    if (args[0] === "add") report.deny("git worktree add checks out a full working tree on disk: use a blobless sparse clone in the scratchpad instead (git clone --filter=blob:none --sparse --depth=50 <url> <scratchpad>/<name>, then git sparse-checkout set <dirs>).");
    return;
  }
  if (sub === "clone") {
    const candidate = directory === undefined ? state.cloneCwd : resolveDir(directory, state.cloneCwd, ctx);
    const cloneCwd = directory === undefined || (candidate && isDirectory(candidate)) ? candidate : undefined;
    clone(positionals(args, CLONE_VALUE_OPTIONS), { cloneCwd }, ctx, report);
    return;
  }
  if (GIT_ALWAYS_HEAVY.has(sub)) { report.heavy(`git ${sub}`); return; }
  if (GIT_TRANSFERS.has(sub)) {
    const whole = args.some((arg) => WHOLE_HISTORY_TRANSFER.has(arg) || arg.startsWith("--deepen") || arg.startsWith("--shallow-since") || arg.startsWith("--shallow-exclude"));
    if (repo?.large !== false || whole) report.heavy(`git ${sub}${size}`);
    return;
  }
  if (sub === "ls-tree") { if (hasFlag(args, "r", ["--recursive"])) report.heavy("git ls-tree -r"); return; }
  if (sub === "cat-file") { if (args.some((arg) => arg.startsWith("--batch"))) report.heavy("git cat-file --batch"); return; }
  if (sub === "rev-list") { if (args.some((arg) => ["--all", "--objects", "--objects-edge", "--branches"].includes(arg))) report.heavy("git rev-list over all history"); return; }
  if (sub === "remote") { if (args[0] === "update") report.heavy("git remote update"); return; }
  if (sub === "submodule") {
    const action = positionals(args)[0];
    const split = args.indexOf("--");
    if (["update", "foreach"].includes(action) && repo?.large === true && cwd === repo.top && !(split >= 0 && split < args.length - 1)) {
      report.deny(`git submodule ${action} at the top of this large repository${size} visits every submodule, checks out each one's recorded commit (detaching nested repositories) and reads all their trees: name the submodule (git submodule ${action} -- <path>) or work inside that submodule's own clone.`);
    } else if (["update", "foreach", "sync", "init", "add"].includes(action)) report.heavy(`git submodule ${action}`);
    return;
  }
  if (repo?.large !== true) return;

  // From here the repository is large: what reads or stats its whole working tree is the cost.
  const atTop = cwd === repo.top;
  const limits = (spec) => spec.startsWith(":") || /[*?[]/u.test(spec) || path.resolve(cwd, spec) !== repo.top;
  const limiting = (words, valueOptions = []) => positionals(words, valueOptions).filter(limits);
  const split = args.indexOf("--");
  const scoped = split >= 0 && args.slice(split + 1).some(limits);
  const scopedByPath = scoped || positionals(split < 0 ? args : args.slice(0, split)).some((word) => exists(path.resolve(cwd, word)) && limits(word));

  if (sub === "status") {
    if (limiting(args).length === 0) report.deny(`git status with no pathspec reads this repository's whole index${size} and stats every tracked file: pass a pathspec (git status -- <dir>) or use git diff --stat -- <dir>.`);
  } else if (sub === "ls-files") {
    if (limiting(args, ["-x", "-X", "--exclude", "--exclude-from", "--exclude-per-directory", "--with-tree", "--format"]).length === 0) {
      if (atTop) report.deny(`git ls-files with no pathspec lists every tracked file of this repository${size}: pass a pathspec (git ls-files -- <dir>) or use git ls-tree <ref> <dir>.`);
      else report.heavy("git ls-files");
    }
  } else if (sub === "log") {
    const bounded = args.some((arg, k) => /^-\d+$/u.test(arg) || /^-n\d+$/u.test(arg) || arg.startsWith("--max-count") || (arg === "-n" && /^\d+$/u.test(args[k + 1] ?? "")));
    if (args.includes("--all") && !bounded) {
      if (scopedByPath) report.heavy("git log --all -- <path>");
      else report.deny(`git log --all with no pathspec walks every commit of a large repository${size}: bound it (git log --all -n 20) or scope it (git log -- <path>).`);
    }
  } else if (sub === "diff") {
    const revisions = positionals(split < 0 ? args : args.slice(0, split)).filter((word) => !exists(path.resolve(cwd, word)));
    const betweenCommits = hasFlag(args, "", ["--cached", "--staged"]) || revisions.some((word) => word.includes("..")) || revisions.length >= 2;
    if (!betweenCommits && !scopedByPath) report.heavy("git diff over a large working tree");
  } else if (sub === "grep") {
    if (!scoped) report.heavy("git grep over a large working tree");
  } else if (sub === "add") {
    if (hasFlag(args, "Au", ["--all", "--update"]) || (positionals(args).length > 0 && limiting(args).length === 0)) report.heavy("git add over a large working tree");
  } else if (sub === "commit") {
    if (commitAll(args)) report.heavy("git commit -a over a large working tree");
  } else if (sub === "restore") {
    if (limiting(args).length === 0) report.heavy("git restore over a large working tree");
  } else if (GIT_WORKTREE_WIDE.has(sub)) {
    if (!scoped) report.heavy(`git ${sub} over a large working tree`);
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
  report.heavy("git clone");
  const resolved = destination === undefined ? undefined : resolveDir(destination, state.cloneCwd, ctx);
  if (resolved === undefined) {
    report.deny("git clone destination cannot be established: a missing or unresolved cd/pushd target is not a successful directory change, and an unresolved source cannot supply a destination basename. Use an explicit absolute destination within the permitted session scratchpad/tmp custody.");
    return;
  }
  if (isScratch(resolved, ctx)) return;
  report.deny(`git clone into ${resolved} is outside a scratchpad/tmp directory: clone into the session scratchpad or /tmp (git clone --filter=blob:none --sparse --depth=50 <url> <scratchpad>/<name>) and delete the clone when done.`);
}

/** A running git process whose working directory is inside `top`, or undefined. Bounded in time: past the bound the answer is "none seen". */
function gitProcessIn(top) {
  const deadline = Date.now() + 30;
  let entries;
  try { entries = readdirSync("/proc"); } catch { return undefined; }
  for (const entry of entries) {
    if (Date.now() > deadline) return undefined;
    if (!/^\d+$/u.test(entry) || Number(entry) === process.pid) continue;
    try {
      const command = readFileSync(`/proc/${entry}/comm`, "utf8").trim();
      if (command !== "git" && !command.startsWith("git-")) continue;
      if (within(readlinkSync(`/proc/${entry}/cwd`), top)) return Number(entry);
    } catch { /* it ended, or is not ours to read */ }
  }
  return undefined;
}

/** `rm .git/index.lock` while a git process is working in that repository would corrupt the index it is writing. */
function indexLock(argv, state, ctx, report) {
  for (const word of positionals(argv.slice(1))) {
    if (path.basename(word) !== "index.lock") continue;
    const file = resolveDir(word, state.cwd, ctx);
    const repo = file === undefined ? undefined : repoOf(path.dirname(file), ctx);
    const running = repo === undefined ? undefined : gitProcessIn(repo.top);
    if (running !== undefined) {
      report.deny(`removing ${file} while git (pid ${running}) is running in ${repo.top} corrupts the index it is writing: wait for that git process to finish; the lock is stale only once no git process is left there.`);
      return;
    }
  }
}

// gh commands that inspect or change the local checkout (an implicit `git status`) unless told which repository to use.
const GH_LOCAL = { pr: new Set(["create", "checkout", "status", "diff"]), repo: new Set(["sync", "fork"]) };
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
  if (!(Object.hasOwn(GH_LOCAL, group) && GH_LOCAL[group].has(action))) return;
  if (args.some((word) => word === "-R" || word === "--repo" || word.startsWith("--repo=") || /^-R./u.test(word))) return;
  const repo = state.cwd === undefined ? undefined : repoOf(state.cwd, ctx);
  if (repo?.large === true) report.heavy(`gh ${group} ${action} runs an implicit git status over this large repository (${describe(repo)}): gh api, or -R owner/repo, avoids reading the checkout`);
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
    // `find`, not serialized; the settings deny list matches command prefixes, so `cd … && grep -r …` reaches only this hook.
    if (dir !== undefined && isBroad(dir, ctx)) { report.deny(`${name} recursing from ${dir} scans the whole disk or a large working tree (rule no-whole-tree-scans-on-bare-cedar-fog): search a named section's directory, read the file a note or term already cites, or hand a broad sweep to an Explore agent.`); return; }
  }
}

/** Whether every path a du, tar or rsync names (and the directory it runs in, when it names none) is scratch: unpacking a tarball into the scratchpad is not heavy work. */
function scratchOnly(args, here, ctx) {
  if (/^[A-Za-z]+$/u.test(args[0] ?? "")) args = [`-${args[0]}`, ...args.slice(1)]; // tar's bundled old-style options (`tar xzf a.tgz`)
  const paths = [];
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (["-f", "--file", "-C", "--directory"].includes(arg)) { paths.push(args[i + 1]); i += 1; continue; }
    const attached = /^--(?:file|directory)=(.+)$/u.exec(arg);
    if (attached) { paths.push(attached[1]); continue; }
    if (!arg.startsWith("-")) paths.push(arg);
  }
  const dirs = (paths.length > 0 ? paths : ["."]).map((word) => (word === undefined ? undefined : resolveDir(word, here.cwd, ctx)));
  return dirs.every((dir) => dir !== undefined && isScratch(dir, ctx));
}

function heavyTool(name, argv, report, here = {}, ctx = undefined) {
  const args = argv.slice(1);
  const sub = (valueOptions = []) => positionals(args.filter((arg) => !arg.startsWith("+")), valueOptions)[0];
  switch (name) {
    case "du": case "tar": case "bsdtar": case "rsync": if (!(ctx && scratchOnly(args, here, ctx))) report.heavy(name); return;
    case "updatedb": report.heavy(name); return;
    case "make": case "gmake": case "ninja": case "cmake": case "bazel": case "bazelisk": case "gradle": case "gradlew": case "mvn": case "mvnw":
      if (!args.some((arg) => ["--version", "-v", "-h", "--help", "-n", "--dry-run"].includes(arg))) report.heavy(name);
      return;
    case "cargo": { const s = sub(); if (s !== undefined && !CARGO_LIGHT.has(s)) report.heavy("cargo"); return; }
    case "lake": if (LAKE_HEAVY.has(sub())) report.heavy("lake"); return;
    case "guix": if (GUIX_HEAVY.has(sub(["-L", "--load-path", "-C", "--cores", "-M", "--max-jobs"]))) report.heavy("guix"); return;
    case "node": case "nodejs": if (args.some(arg => arg === "--test" || arg.startsWith("--test="))) report.heavy("node tests"); return;
    case "npm": case "pnpm": case "bun": if (NPM_INSTALL.has(sub(["-C", "--dir", "--prefix", "--filter", "-F", "--workspace", "-w"])) || ["run", "run-script", "test", "build", "exec", "x"].includes(sub())) report.heavy(`${name} install or script`); return;
    case "npx": report.heavy("npx script"); return;
    case "yarn": { const s = sub(["--cwd"]); if (s === undefined || NPM_INSTALL.has(s)) report.heavy("yarn install"); return; }
    case "pip": case "pip3": if (sub() === "install") report.heavy("pip install"); return;
    case "uv": if (["sync", "add", "lock", "pip"].includes(sub())) report.heavy("uv"); return;
    case "poetry": if (["install", "update", "add"].includes(sub())) report.heavy("poetry"); return;
    case "docker": case "podman": { const s = sub(); if (DOCKER_HEAVY.has(s) || (s === "compose" && ["build", "pull", "up"].includes(positionals(args)[1]))) report.heavy(name); return; }
    case "go": if (["build", "test", "install", "get", "generate", "vet", "mod"].includes(sub())) report.heavy("go"); return;
    case "dotnet": if (["build", "restore", "publish", "test"].includes(sub())) report.heavy("dotnet"); return;
    default:
  }
}

function simple(command, frame, state, ctx, report, depth, lock) {
  const words = unwrap(withoutRedirections(command.words, command.quoted), (operand) => { if (operand === lock) state.locked = true; });
  if (words.length === 0) return;
  const name = path.basename(words[0]);
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
    if (at > 0 && words[at + 1] !== undefined) walk(words[at + 1], here.cwd, state, ctx, report, depth + 1, lock, here.cloneCwd);
    return;
  }
  if (name === "eval") { walk(words.slice(1).join(" "), here.cwd, state, ctx, report, depth + 1, lock, here.cloneCwd); return; }
  if (name === "find" || name === "bfs") { find(words, here, ctx, report); return; }
  if (name === "git") { git(words, here, ctx, report); return; }
  if (name === "gh") { github(words, here, ctx, report); return; }
  if (name === "rm" || name === "unlink") { indexLock(words, here, ctx, report); return; }
  if (Object.hasOwn(SCANNERS, name)) { scanner(name, words, command.piped, here, ctx, report); return; }
  heavyTool(name, words, report, here, ctx);
}

function walk(source, cwd, state, ctx, report, depth, lock, cloneCwd) {
  if (depth > LIMITS.maxShellDepth) return;
  const { commands, scopes } = parseShell(source);
  const frame = { scopes, cwds: new Map([[0, cwd]]), cloneCwds: new Map([[0, cloneCwd]]) };
  for (const command of commands) simple(command, frame, state, ctx, report, depth, lock);
}

/** `{ action: "deny", reason } | { action: "serialize", heavy, locked } | { action: "allow" }` for a command line run in `cwd`. */
export function classify(command, { cwd, env = process.env, home, scratchpad, lock = lockPath(env), run } = {}) {
  const ctx = makeContext({ cwd, scratchpad_dir: scratchpad }, env, { home, run });
  const denied = [];
  const heavy = [];
  const state = { locked: false };
  walk(command, ctx.cwd, state, ctx, { deny: (reason) => denied.push(reason), heavy: (what) => heavy.push(what) }, 0, lock, ctx.cwd);
  if (denied.length > 0) return { action: "deny", reason: denied[0] };
  // Heavy commands are no longer queued behind one host-wide slot. Leader, 2026-10-26: "fuck this
  // heavy-command slot slop": the slot held every session's fetches and pushes for tens of minutes
  // behind one long command, so no work landed. Whole-tree reads are still denied above.
  return { action: "allow" };
}

// ---------------------------------------------------------------------------------------------
// The lock and the rewrite.
// ---------------------------------------------------------------------------------------------

const isDirectory = (dir) => { try { return statSync(dir).isDirectory(); } catch { return false; } };

/** The one file every agent process of this user locks: `$XDG_RUNTIME_DIR/agent-heavy.lock`, else under the user's state directory. */
export function lockPath(env = process.env, uid = process.getuid?.()) {
  if (env.AGENT_HEAVY_LOCK) return path.resolve(env.AGENT_HEAVY_LOCK);
  for (const dir of [env.XDG_RUNTIME_DIR, uid === undefined ? undefined : `/run/user/${uid}`]) {
    if (dir && path.isAbsolute(dir) && isDirectory(dir)) return path.join(dir, LOCK_FILE);
  }
  return path.join(env.XDG_STATE_HOME || path.join(env.HOME || homedir(), ".local", "state"), "agent-harness", LOCK_FILE);
}

/** The memory pressure now: "full avg10" of /proc/pressure/memory, or undefined where the kernel does not report it. */
export function memoryPressure(read = () => readFileSync("/proc/pressure/memory", "utf8")) {
  try {
    const match = /^full avg10=([0-9.]+)/mu.exec(read());
    return match ? Number(match[1]) : undefined;
  } catch { return undefined; }
}

/** CPU count does not measure disk capacity. Parallel admission is explicit; pressure always reduces it to one. */
export function heavySlots({ env = process.env, pressure = memoryPressure(), ioPressure = memoryPressure(() => readFileSync("/proc/pressure/io", "utf8")) } = {}) {
  const configured = Math.floor(Number(env.AGENT_HEAVY_SLOTS));
  const slots = Number.isFinite(configured) && configured >= 1 ? configured : 1;
  const threshold = Number(env.AGENT_HEAVY_PRESSURE);
  const limit = env.AGENT_HEAVY_PRESSURE !== undefined && env.AGENT_HEAVY_PRESSURE !== "" && Number.isFinite(threshold) ? threshold : PRESSURE_PERCENT;
  return (pressure !== undefined && pressure >= limit) || (ioPressure !== undefined && ioPressure >= limit) ? 1 : slots;
}

/** The lock files of `slots` slots: the first is `lock` itself, so a command an agent wraps in `flock <lock>` by hand holds slot one. */
export const slotLocks = (lock, slots = 1) => Array.from({ length: Math.max(1, slots) }, (_, i) => (i === 0 ? lock : `${lock}.${i}`));

// ---------------------------------------------------------------------------------------------
// Room: a heavy command starts only where the memory it will take exists.
// ---------------------------------------------------------------------------------------------

/** Exit status of the room gate when the work slice never had room for the command inside its wait. */
export const NO_ROOM_EXIT_CODE = BUSY_EXIT_CODE;
/** The share of a ceiling a heavy command is assumed to need free, within these bounds (MiB). */
export const ROOM_SHARE = Object.freeze({ fraction: 0.15, floorMiB: 256, capMiB: 1024 });

/** The cgroup of the slice every contained command runs in, under the user manager of `uid`. */
export const workSliceDirectory = ({ uid = process.getuid?.(), cgroupRoot = "/sys/fs/cgroup" } = {}) =>
  Number.isSafeInteger(uid) ? path.join(cgroupRoot, "user.slice", `user-${uid}.slice`, `user@${uid}.service`, "agent.slice", WORK_SLICE) : undefined;

const cgroupNumber = (text) => (/^[0-9]+$/u.test(String(text).trim()) ? Number(text) : undefined);

/**
 * The room in `directory` (a cgroup) and in every ancestor below `cgroupRoot` that has a ceiling: for each,
 * `ceiling - workingSet`, the ceiling being its memory.max or, sooner, its memory.high (above which the kernel
 * throttles every task under it) and the working set its memory.current less the inactive file cache the kernel
 * hands back on demand (what Kubernetes calls the working set). Raw memory.current is not used: a slice
 * that has read files all day sits at its ceiling on cache alone. Returns the tightest level, with the memory
 * pressure ("full avg10", percent) of the slice and, if `host`, of the machine. undefined where no level has a ceiling.
 */
export function cgroupRoom({ directory, cgroupRoot = "/sys/fs/cgroup", read = (file) => readFileSync(file, "utf8") } = {}) {
  const get = (file) => { try { return read(file); } catch { return undefined; } };
  const levels = [];
  for (let dir = directory; dir && dir.startsWith(cgroupRoot + path.sep); dir = path.dirname(dir)) {
    const ceilings = ["memory.max", "memory.high"].map((name) => cgroupNumber(get(path.join(dir, name)) ?? "")).filter((n) => n !== undefined);
    const current = cgroupNumber(get(path.join(dir, "memory.current")) ?? "");
    if (ceilings.length === 0 || current === undefined) continue;
    const inactive = cgroupNumber(/^inactive_file (\d+)$/mu.exec(get(path.join(dir, "memory.stat")) ?? "")?.[1] ?? "") ?? 0;
    const ceiling = Math.min(...ceilings), workingSet = Math.max(0, current - inactive);
    levels.push({ cgroup: path.relative(cgroupRoot, dir), ceiling, workingSet, free: ceiling - workingSet });
  }
  if (levels.length === 0) return undefined;
  const tightest = levels.reduce((a, b) => (b.free < a.free ? b : a));
  const slice = levels[0];
  const pressure = memoryPressure(() => get(path.join(directory, "memory.pressure")) ?? "");
  return { ...tightest, sliceCeiling: slice.ceiling, pressure };
}

/** What the gate holds a heavy command to: `{ directory, needMiB, pressure }`, or undefined where AGENT_HEAVY_ROOM=off or nothing can be measured. */
export function roomSettings(env = process.env, { directory = workSliceDirectory(), cgroupRoot, read } = {}) {
  if (env.AGENT_HEAVY_ROOM === "off") return undefined;
  const state = directory ? cgroupRoom({ directory, cgroupRoot, read }) : undefined;
  const configured = Number(env.AGENT_HEAVY_ROOM_MB);
  const needMiB = env.AGENT_HEAVY_ROOM_MB !== undefined && env.AGENT_HEAVY_ROOM_MB !== "" && Number.isFinite(configured) && configured >= 0
    ? Math.floor(configured)
    : state ? Math.min(ROOM_SHARE.capMiB, Math.max(ROOM_SHARE.floorMiB, Math.floor((state.sliceCeiling * ROOM_SHARE.fraction) / (1024 * 1024)))) : 0;
  const threshold = Number(env.AGENT_HEAVY_PRESSURE);
  const pressure = env.AGENT_HEAVY_PRESSURE !== undefined && env.AGENT_HEAVY_PRESSURE !== "" && Number.isFinite(threshold) ? threshold : PRESSURE_PERCENT;
  if (!state && memoryPressure() === undefined) return undefined;
  return { directory: state ? directory : undefined, needMiB, pressure, ...(cgroupRoot ? { cgroupRoot } : {}) };
}

/** Whether `settings` are met now: `{ ok, reason }`, the reason naming the figures when not. */
export function roomVerdict(settings, { read, hostPressure = memoryPressure() } = {}) {
  const state = settings.directory ? cgroupRoom({ directory: settings.directory, cgroupRoot: settings.cgroupRoot, read }) : undefined;
  const need = settings.needMiB * 1024 * 1024;
  const stalls = [hostPressure, state?.pressure].filter((p) => p !== undefined);
  const stalled = stalls.length > 0 && Math.max(...stalls) >= settings.pressure;
  const short = state !== undefined && need > 0 && state.free < need;
  const MiB = (n) => Math.round(n / (1024 * 1024));
  const reasons = [
    ...(short ? [`${state.cgroup} has ${MiB(Math.max(0, state.free))} MiB of room (ceiling ${MiB(state.ceiling)} MiB, working set ${MiB(state.workingSet)} MiB) and this command is held to ${settings.needMiB} MiB`] : []),
    ...(stalled ? [`tasks stalled on memory ${Math.max(...stalls)}% of the last ten seconds (limit ${settings.pressure}%)`] : []),
  ];
  return { ok: reasons.length === 0, reason: reasons.join("; ") };
}

/**
 * Resolve once `settings` are met, waiting on the kernel's own notifications and not on a timer: inotify on
 * the work slice's directory (a scope of any command starting or ending in it) and on the memory.events of each
 * level (a ceiling breached). Every notification re-measures. `deadline` (epoch seconds) is the end of the
 * caller's budget, not an interval: past it the answer is the last verdict, `ok: false`.
 */
export function waitForRoom(settings, { deadline, read, hostPressure = () => memoryPressure(), watcher = watch, now = () => Date.now() } = {}) {
  return new Promise((resolve) => {
    const watchers = [];
    let budget;
    const finish = (verdict) => { clearTimeout(budget); for (const w of watchers) try { w.close(); } catch { /* already closed */ } resolve(verdict); };
    const measure = () => roomVerdict(settings, { read, hostPressure: hostPressure() });
    let verdict = measure();
    if (verdict.ok || !settings.directory) return finish(verdict);
    const left = deadline * 1000 - now();
    if (!(left > 0)) return finish(verdict);
    const recheck = () => { verdict = measure(); if (verdict.ok) finish(verdict); };
    const targets = [settings.directory];
    const base = settings.cgroupRoot ?? "/sys/fs/cgroup";
    for (let dir = settings.directory; dir.startsWith(base + path.sep); dir = path.dirname(dir)) targets.push(path.join(dir, "memory.events"));
    for (const target of targets) try { watchers.push(watcher(target, recheck)); } catch { /* an unwatchable file only means fewer notifications */ }
    // The caller's budget is one deadline, armed once; re-measuring is driven by the notifications above.
    budget = setTimeout(() => finish(verdict), left);
  });
}

// Contention testimony comes from the existing kernel locks, not another
// ownership journal. In particular, a missing PID never licenses lock removal.
function boundedLockReading(file, maximum) {
  const fd = openSync(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const bytes = Buffer.alloc(maximum + 1);
    let used = 0;
    while (used <= maximum) {
      const n = readSync(fd, bytes, used, bytes.length - used, null);
      if (n === 0) return bytes.subarray(0, used).toString("utf8");
      used += n;
    }
    throw new Error("lock observation exceeds allocation");
  } finally { closeSync(fd); }
}

function processBirth(stat) {
  const end = stat.lastIndexOf(")");
  const fields = end < 0 ? [] : stat.slice(end + 2).trim().split(/\s+/u);
  return /^\d+$/u.test(fields[19] ?? "") ? fields[19] : null;
}

/** Deliberately omit every argv value: shell text, credentials and customer
 * input cannot be made safe by a token-name blacklist. */
function lockProcess(pid, procRoot, includeChildren, budget) {
  if (budget.remaining <= 0) return { pid, state: "process-budget-exhausted" };
  budget.remaining -= 1;
  const root = path.join(procRoot, String(pid));
  try {
    const before = processBirth(boundedLockReading(path.join(root, "stat"), 8192));
    if (before === null) throw new Error("unknown birth");
    const command = boundedLockReading(path.join(root, "cmdline"), 65536).split("\0").filter(Boolean);
    const named = path.basename(command[0] ?? "");
    const executable = ["node", "nodejs", "flock", "bash", "sh", "git", "guix", "npm", "pnpm", "cargo", "make", "sleep"].includes(named) ? named : "other";
    const kind = ["node", "nodejs"].includes(executable) && command.includes("--test") ? "node-test"
      : ["flock", "bash", "sh", "git", "guix", "npm", "pnpm", "cargo", "make"].includes(executable) ? executable : "other";
    const fullCgroup = boundedLockReading(path.join(root, "cgroup"), 8192).trim();
    const cgroup = fullCgroup.slice(0, 1024);
    const childrenText = includeChildren
      ? boundedLockReading(path.join(root, "task", String(pid), "children"), 4096).trim() : "";
    const allChildren = childrenText ? childrenText.split(/\s+/u).filter(x => /^[1-9]\d*$/u.test(x)).map(Number) : [];
    const children = allChildren.slice(0, 4);
    const after = processBirth(boundedLockReading(path.join(root, "stat"), 8192));
    if (before !== after) return { pid, state: "identity-changed" };
    return { pid, state: "observed", startTicks: before, cgroup, cgroupComplete: fullCgroup.length <= 1024,
      command: { executable, kind, argv: "omitted" },
      ...(includeChildren ? { childrenComplete: allChildren.length <= Math.min(4, budget.remaining),
        children: children.slice(0, budget.remaining).map(child => lockProcess(child, procRoot, false, budget)) } : {}) };
  } catch (error) {
    return { pid, state: error.code === "ENOENT" || error.code === "ESRCH" ? "exited-or-unavailable" : "unavailable" };
  }
}

/** Bounded read-only snapshot for the exact already selected slot files.
 * It neither creates/open-locks a file nor enumerates processes/directories. */
export function heavyLockStatus(locks, { procRoot = "/proc" } = {}) {
  if (!Array.isArray(locks) || locks.length < 1 || locks.length > 16 ||
      locks.some(lock => typeof lock !== "string" || lock.length > 4096 || !path.isAbsolute(lock)))
    throw new TypeError("one to sixteen exact absolute slot paths required");
  let rows;
  try { rows = boundedLockReading(path.join(procRoot, "locks"), 524288).split("\n"); }
  catch { return { kind: "agent-heavy.lock-status.v1", state: "kernel-locks-unavailable", snapshot: true }; }
  const processBudget = { remaining: 8 };
  return { kind: "agent-heavy.lock-status.v1", snapshot: true, authority: "kernel-advisory-lock-snapshot",
    locks: locks.map(lock => {
      try {
        const before = lstatSync(lock, { bigint: true });
        if (!before.isFile() || before.isSymbolicLink()) throw new Error("not an original regular slot");
        const major = ((before.dev >> 8n) & 0xfffn) | ((before.dev >> 32n) & 0xfffff000n);
        const minor = (before.dev & 0xffn) | ((before.dev >> 12n) & 0xffffff00n);
        const selected = [];
        for (const row of rows) {
          const match = /^\s*\d+:\s*(->\s*)?FLOCK\s+ADVISORY\s+(?:WRITE|READ)\s+(-?\d+)\s+([a-f0-9]+):([a-f0-9]+):(\d+)\s/iu.exec(row);
          if (match && BigInt("0x" + match[3]) === major && BigInt("0x" + match[4]) === minor && BigInt(match[5]) === before.ino)
            selected.push({ role: match[1] ? "waiter" : "holder", pid: Number(match[2]) });
        }
        const after = lstatSync(lock, { bigint: true });
        if (before.dev !== after.dev || before.ino !== after.ino)
          return { path: lock, state: "slot-identity-changed" };
        const retained = selected.slice(0, 8);
        const processes = retained.map(({ role, pid }) => ({ role,
          ...(pid > 0 ? lockProcess(pid, procRoot, role === "holder", processBudget) : { pid, state: "kernel-holder-unavailable" }) }));
        return { path: lock, state: selected.length ? "contended-or-held" : "free-at-snapshot",
          device: String(before.dev), major: major.toString(16), minor: minor.toString(16), inode: String(before.ino),
          complete: retained.length === selected.length && !processes.some(p => p.state === "process-budget-exhausted" || p.childrenComplete === false),
          processes };
      } catch { return { path: lock, state: "slot-unavailable" }; }
    }),
    limitations: "Processes and locks can change after this snapshot; never remove a lock or terminate an owner from this testimony." };
}

// Never `mkdirSync(..., { recursive: true })` here: on a path whose parent exists but cannot hold
// the child (anything under /proc) node's recursive mkdir retries forever at full CPU.
function makeDirectories(dir, levels = 4) {
  if (isDirectory(dir)) return;
  if (levels === 0) throw new Error("no directory to hold the lock");
  makeDirectories(path.dirname(dir), levels - 1);
  mkdirSync(dir, { mode: 0o700 });
}

/** The lock file exists and is readable, creating it if need be. Creating it is all the hook does with it: it never takes the lock itself. */
function ensureLockFile(file) {
  try { accessSync(file, constants.R_OK); return true; } catch { /* created below */ }
  try { makeDirectories(path.dirname(file)); } catch { return false; }
  try {
    closeSync(openSync(file, "wx", 0o600));
    return true;
  } catch (error) { return error?.code === "EEXIST"; } // another process created it first
}

const onPath = (name, env) => (env.PATH ?? "").split(":").some((dir) => {
  if (dir === "") return false;
  try { accessSync(path.join(dir, name), constants.X_OK); return true; } catch { return false; }
});

export const shellQuote = (text) => `'${String(text).replaceAll("'", "'\\''")}'`;

export function waitSeconds(toolInput, env = process.env) {
  const override = Number(env.AGENT_HEAVY_WAIT_SECONDS);
  if (env.AGENT_HEAVY_WAIT_SECONDS !== undefined && env.AGENT_HEAVY_WAIT_SECONDS !== "" && Number.isFinite(override) && override >= 1) return Math.floor(override);
  const timeout = Number(toolInput?.timeout);
  // Wait for the slot a little less than the tool would wait for the command, so the agent is told why.
  const seconds = Number.isFinite(timeout) && timeout > 0 ? timeout / 1000 - 10 : LIMITS.waitSeconds;
  return Math.min(LIMITS.maxWaitSeconds, Math.max(LIMITS.minWaitSeconds, Math.floor(seconds)));
}

const roomGate = ({ directory, needMiB, pressure, cgroupRoot }) => {
  const args = ["--wait-for-room", ...(cgroupRoot ? ["--cgroup-root", shellQuote(cgroupRoot)] : []), "--deadline", '"$_AH_DEADLINE"', "--need-mb", needMiB, "--pressure", pressure, ...(directory ? ["--directory", shellQuote(directory)] : [])];
  return `${shellQuote(process.execPath)} ${shellQuote(fileURLToPath(import.meta.url))} ${args.join(" ")}; [ "$?" -ne ${NO_ROOM_EXIT_CODE} ] || { echo room >"$_AH_RAN"; exit ${BUSY_EXIT_CODE}; }; `;
};

/**
 * `original` run in one of the host's heavy slots (`locks`, from `slotLocks`): at `nice -n 10`, idle
 * I/O class. It takes the first slot that is free (`flock -n`), else waits up to `wait` seconds on
 * `waitOn` (one of them; spread at random so waiters do not all queue on the first). A busy host ends
 * the command with exit 75 and a message to the agent. A marker the command touches first tells a slot
 * that was busy from a command that ran and itself exited 75, so a command never runs twice. A lock
 * file the command's sandbox cannot read refuses admission; it never runs unlocked.
 *
 * With `room` (from `roomSettings`) the command, once it holds a slot and before it is marked as run, is held
 * until the work slice has room (`--wait-for-room`, which waits on kernel notifications) within the same
 * deadline as the slot wait. No room is also exit 75, said so, and the command does not run; room is global,
 * so no other slot is tried. The slot is held while waiting, which queues the waiters in the kernel's order
 * and lets each be measured alone. A gate that fails for any other reason lets the command through.
 */
export function serializedCommand(original, { lock, locks = [lock], wait, nice = true, ionice = true, room, waitOn = locks[Math.floor(Math.random() * locks.length)] }) {
  const runner = (flockArgs, file) => ["AGENT_HEAVY_LOCK_HELD=1", nice ? "nice -n 10" : "", ionice ? "$_ah_io" : "", `flock ${flockArgs} -E ${BUSY_EXIT_CODE} ${file} bash -c "$_ah_c"`].filter(Boolean).join(" ");
  const ran = `[ -s "$_AH_RAN" ]`;
  const busy = `agent-heavy: waited ${wait}s for one of the host's ${locks.length} heavy-command slot${locks.length === 1 ? "" : "s"} (${locks[0]}${locks.length === 1 ? "" : ` and .1-.${locks.length - 1}`}); other agents' clones, fetches, builds or tree scans hold ${locks.length === 1 ? "it" : "them"}, so this command did not run. Retry shortly, or narrow it.`;
  const diagnose = `timeout --signal=KILL 2s ${shellQuote(process.execPath)} ${shellQuote(fileURLToPath(import.meta.url))} --lock-status ${locks.map(shellQuote).join(" ")} >&2 || true`;
  return [
    `_ah_c=${shellQuote(`${room ? roomGate(room) : ""}echo >"$_AH_RAN"; ${requestedTimeoutPrelude}; ${original}`)}`,
    ...(room ? [`_AH_DEADLINE=$(( $(date +%s) + ${Math.max(0, Math.floor(wait))} )); export _AH_DEADLINE`] : []),
    ...(ionice ? ["_ah_io=", "ionice -c3 true 2>/dev/null && _ah_io='ionice -c3'"] : []),
    // Missing admission infrastructure cannot turn into unbounded work.
    '_ah_readable=',
    `for _ah_l in ${locks.map(shellQuote).join(" ")}; do [ ! -r "$_ah_l" ] || _ah_readable=1; done`,
    // The marker sits beside the slot locks, whose directory the hook has just made sure exists: XDG_RUNTIME_DIR can
    // name a directory that is not there yet (a host still booting has no /run/user/<uid>), and then the marker could
    // not be written and a command that itself exits 75 could run again in the next slot.
    // Allocate an exclusive private marker file: it starts empty and the command's first act makes it non-empty,
    // so no guessed pathname is deleted. Only our own file is unlinked afterwards; no rm or rmdir appears, which
    // Claude Code's removal check refuses in a rewritten command.
    `if [ -z "$_ah_readable" ]; then printf '%s\\n' 'agent-heavy: no readable admission lock; this command did not run' >&2; (exit ${BUSY_EXIT_CODE}); else _AH_RAN=$(mktemp ${shellQuote(path.dirname(locks[0]))}/agent-ran.XXXXXX) && { export _AH_RAN`,
    `_ah_rc=${BUSY_EXIT_CODE}`,
    `for _ah_l in ${locks.map(shellQuote).join(" ")}; do [ -r "$_ah_l" ] || continue; ${runner("-n", '"$_ah_l"')}; _ah_rc=$?; { [ "$_ah_rc" -eq ${BUSY_EXIT_CODE} ] && ! ${ran}; } || break; done`,
    `if [ "$_ah_rc" -eq ${BUSY_EXIT_CODE} ] && ! ${ran}`,
    `then if [ -r ${shellQuote(waitOn)} ]; then ${runner(`-w ${wait}`, shellQuote(waitOn))}; _ah_rc=$?; fi`,
    "fi",
    `[ "$_ah_rc" -ne ${BUSY_EXIT_CODE} ] || ${ran} || { printf '%s\\n' ${shellQuote(busy)} >&2; ${diagnose}; }`,
    'unlink -- "$_AH_RAN"',
    '(exit "$_ah_rc")',
    '}',
    'fi',
  ].join("; ");
}

// ---------------------------------------------------------------------------------------------
// Containment: everything a Claude Code session runs, held by the kernel to a share of the host.
// ---------------------------------------------------------------------------------------------

/**
 * The user-manager slice every process of every Claude Code session runs in. Its cgroup limits bind
 * the sum of all of it (sessions, subagents, monitors, commands, MCP servers), so no number of them
 * can take the machine from the person using it: the cap is the kernel's, not a rule a session is
 * trusted to keep. The lock above orders the heavy commands; the slice bounds everything.
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

/**
 * A command an agent wrapped by hand in `flock <the heavy lock> …` (optionally after one `cd <dir> &&`): its
 * prefix, the command inside, and the wait it asked for. Such a command is admitted through the slots like any
 * other heavy command, so hand-wrapping never pins it to the first slot. Anything else: undefined.
 */
export function handWrappedHeavy(command, lock) {
  const match = /^(\s*cd\s+[^;&|<>`$]+?\s*&&\s*)?flock((?:\s+(?:-[nxs]|-[wE]\s*\d+|--(?:nonblock|exclusive|shared)|--(?:wait|timeout|conflict-exit-code)(?:=|\s+)\d+))*)\s+(\S+)\s+(.+)$/su.exec(command);
  if (!match) return undefined;
  const [, prefix = "", options, file, inner] = match;
  const named = file.replace(/^['"]|['"]$/gu, "");
  if (named !== lock && path.basename(named) !== path.basename(lock)) return undefined;
  if (/(^|\s)(-c|--command)(\s|$)/u.test(options) || /^(-c|--command)\s/u.test(inner)) return undefined;
  const wait = Number(/(?:-w|--wait|--timeout)(?:=|\s*)(\d+)/u.exec(options)?.[1]);
  return { prefix, inner, wait: Number.isFinite(wait) ? wait : undefined };
}

const SHELL_TOOLS = /^(Bash|shell|exec_command|local_shell|container\.exec)$/u;
/** Claude Code's Monitor runs a shell command for as long as it watches: contained, never serialized, since a watch would hold the heavy slot for its whole life. */
const WATCH_TOOLS = /^Monitor$/u;

/** Programs the harness's own removal check must read as written. Contained, a command is a
 *  `systemd-run … bash -c` carrier that check cannot see into, so it refuses every removal. */
const SELF_CHECKED_PROGRAMS = new Set(["rm", "rmdir", "unlink"]);

/** Whether every simple command of `command` is a removal the harness checks itself: light work,
 *  left uncontained so that check reads it. */
export function isSelfCheckedRemoval(command) {
  try {
    const { commands } = parseShell(command);
    return commands.length > 0 && commands.every(({ words, piped }) => !piped && SELF_CHECKED_PROGRAMS.has(words[0]));
  } catch {
    return false;
  }
}

/**
 * The hook's answer to one PreToolUse event: the `hookSpecificOutput` object, or undefined to let
 * the command run untouched. `provider` is "claude" or "codex"; Codex accepts `updatedInput` only
 * together with an explicit allow. `cgroup` is the session's own cgroup (the hook inherits it).
 *
 * A Claude Code session outside the slice has its commands placed there: every command when it runs
 * without permission rules (`bypassPermissions`), and otherwise the heavy commands and watches,
 * which are already rewritten, so no command an allow rule admits starts asking because of it.
 */
export function decide(input, { env = process.env, provider = "claude", home, cgroup = ownCgroup(), run: runner } = {}) {
  if (env.AGENT_HOST_GUARD === "off") return undefined;
  const toolInput = input?.tool_input;
  const tool = String(input?.tool_name);
  const watch = provider === "claude" && WATCH_TOOLS.test(tool);
  if (!(SHELL_TOOLS.test(tool) || watch) || typeof toolInput?.command !== "string") return undefined;
  const command = toolInput.command;
  if (command.trim() === "" || command.length > LIMITS.maxCommandLength) return undefined;
  const lock = lockPath(env);
  const verdict = classify(command, { cwd: input.cwd, env, home, scratchpad: input.scratchpad_dir, lock, run: runner });
  if (verdict.action === "deny") {
    return { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: `host-resource guard: ${verdict.reason}` };
  }
  // A session confined to an allow-list (`dontAsk`, the carriers') has its permission rules checked
  // against the rewritten command, which no allowed pattern matches: it is denied there, never rewritten.
  if (input.permission_mode === "dontAsk") return undefined;
  if (!watch && verdict.action === "serialize" && !env.AGENT_HEAVY_LOCK_HELD && (!onPath("flock", env) || !ensureLockFile(lock))) {
    return { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: "host-resource guard: heavy-command admission unavailable (flock or shared lock); this command did not run" };
  }
  let wrapped;
  const hand = verdict.action === "serialize" && verdict.locked ? handWrappedHeavy(command, lock) : undefined;
  if (!watch && verdict.action === "serialize" && (!verdict.locked || hand) && !env.AGENT_HEAVY_LOCK_HELD && onPath("flock", env) && ensureLockFile(lock)) {
    const locks = slotLocks(lock, heavySlots({ env })).filter((file, i) => i === 0 || ensureLockFile(file));
    const wait = Math.min(LIMITS.maxWaitSeconds * 4, Math.max(waitSeconds(toolInput, env), hand?.wait ?? 0));
    wrapped = `${hand?.prefix ?? ""}${serializedCommand(hand?.inner ?? command, { lock, locks, wait, room: roomSettings(env), nice: onPath("nice", env), ionice: onPath("ionice", env) })}`;
  }
  // Commands go to the work slice even from a session inside its own slice, so a command's memory never counts against the session.
  const selfChecked = wrapped === undefined && !watch && isSelfCheckedRemoval(command);
  const contain = provider === "claude" && !isContained(cgroup, WORK_SLICE) && !selfChecked && (wrapped !== undefined || watch || input.permission_mode === "bypassPermissions") && canContain(env);
  if (contain) wrapped = containedCommand(wrapped ?? command, { recorder: { node: process.execPath, script: fileURLToPath(new URL("./scope-failure-record.mjs", import.meta.url)) } });
  if (wrapped === undefined) return undefined;
  const output = { hookEventName: "PreToolUse", updatedInput: { ...toolInput, command: wrapped } };
  if (provider === "codex") {
    output.permissionDecision = "allow";
    output.permissionDecisionReason = `host-resource guard: ${verdict.heavy.join(", ")} runs in one of the host's heavy-command slots`;
  }
  return output;
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
 * leaves the command untouched. The hook never waits on the lock; the rewritten command does.
 */
function main() {
  if (process.argv[2] === "--wait-for-room") {
    // `--wait-for-room --within <seconds>` is for a caller that is not a Bash command (a timer-driven service): the
    // room it is held to is this process's own environment's, as the hook would set it. The flags below spell it out.
    const args = process.argv.slice(3);
    const value = (name) => args[args.indexOf(name) + 1];
    const explicit = args.includes("--need-mb");
    const settings = explicit
      ? { directory: args.includes("--directory") ? value("--directory") : undefined, cgroupRoot: args.includes("--cgroup-root") ? value("--cgroup-root") : undefined, needMiB: Number(value("--need-mb")), pressure: Number(value("--pressure")) }
      : roomSettings(process.env);
    if (settings === undefined) process.exit(0);
    const deadline = args.includes("--deadline") ? Number(value("--deadline")) : Date.now() / 1000 + (Number(value("--within")) || 0);
    waitForRoom(settings, { deadline }).then((verdict) => {
      if (!verdict.ok) process.stderr.write(`agent-heavy: no room for this command: ${verdict.reason}. It did not run; it waited for a running command to end and none did. Retry when the other work has finished, or narrow it.\n`);
      process.exit(verdict.ok ? 0 : NO_ROOM_EXIT_CODE);
    }, () => process.exit(0));
    return;
  }
  if (process.argv[2] === "--lock-status") {
    try { process.stdout.write(JSON.stringify(heavyLockStatus(process.argv.slice(3))) + "\n"); }
    catch { process.stdout.write('{"kind":"agent-heavy.lock-status.v1","state":"observation-unavailable","snapshot":true}\n'); }
    return;
  }
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
