#!/usr/bin/env node
/**
 * The sorting law, as a Stop hook: a turn that wrote anything ends with the session looking at
 * everything it wrote and putting each piece where it belongs.
 *
 * Agents put work wherever is nearest: the /tmp scratchpad Claude Code hands every session, ad hoc
 * folders, the wrong section of the repository. Blocking one place moves the habit to the next. On
 * 2026-10-08 five live sessions in ~/info held about 56,000 files in /tmp scratchpads (research
 * findings, analysis scripts, measurements, clones of house repositories) and a median session had
 * built 163k tokens of context that left no durable trace. The remedy is not a forbidden directory;
 * it is a routine. At the end of each turn that wrote something, the session gets one sorting pass:
 *
 *   carry   everything it wrote outside the repository (the scratchpad, /tmp, the home directory)
 *           goes into the repository at full depth, or is recorded as disposable with a reason;
 *   place   everything it wrote inside the repository is checked against its proper home (the
 *           owning section; notes vs data records vs code; dated note paths; no duplicates;
 *           indexes and READMEs that should name it), and moved if it is misplaced.
 *
 * What the turn wrote is read from the session transcript (`transcript_path`), from every entry
 * after the session's previous sorting pass: Write, Edit, MultiEdit and NotebookEdit targets, and
 * the targets a Bash command visibly writes (redirections, tee, cp/mv/rsync/install destinations,
 * mkdir, git clone destinations, touch). Bash writes hidden inside an interpreter (python -c, node -e,
 * heredoc scripts) are not parsed; the scratchpad sweep below catches those that land there. In
 * addition, every file in the session's scratchpad that the carry ledger does not cover is listed on
 * every pass, whoever wrote it (subagents and workflows write there too) and whenever.
 *
 * The carry ledger is <scratchpad>/CARRIED.jsonl, one JSON object per line:
 *   {"path": "proto/syntactic-chu.mjs", "to": "lib/.../scripts/syntactic-chu.mjs", "at": "<ISO time>"}
 *   {"path": "kmeter/", "to": "lib/.../data/records/2026-10-08-k-meter/", "at": "<ISO time>"}
 *   {"path": "issues.json", "disposable": "raw gh API dump, regenerable with gh issue list", "at": "<ISO time>"}
 * A path ending in "/" covers its whole directory; an entry covers a file only if the file has not
 * changed since the entry's "at". Clones under the scratchpad are listed only when their origin is a
 * house organization and they hold uncommitted changes or unpushed commits.
 *
 * Decision: if the turn wrote anything (or the scratchpad holds uncarried files) and the stop was not
 * already prolonged by a Stop hook, the hook answers {"decision": "block", "reason": <the pass>} and
 * the session continues to sort. When `stop_hook_active` is true it never blocks again: it records
 * the pass as done (state in ~/.local/state/561-group/turn-sorting/<session>.json) and, if uncarried
 * scratch files remain, tells the person in a systemMessage. It FAILS OPEN: malformed input, an
 * unreadable transcript, a walk past its deadline or any internal error prints nothing and exits 0.
 * Zero dependencies; copied to ~/.local/share/561-group/harness/ beside the settings that name it.
 */
import { readdirSync, statSync, readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, relative, resolve, isAbsolute, dirname } from "node:path";
import { homedir } from "node:os";
import { execFileSync } from "node:child_process";

const EXTENSIONS = new Set([".md", ".mjs", ".js", ".cjs", ".ts", ".py", ".json", ".jsonl", ".lean", ".txt", ".csv", ".tsv", ".sh", ".scm", ".sol", ".yaml", ".yml", ".toml", ".html", ".svg"]);
const HOUSE_ORGS = ["red-cup-engineering", "emsenn", "561-group", "lenticule-science", "causeway-services", "coesite-operations", "koios-news", "turntide-islands", "harmonious-union", "rsc-quiescent", "union-officer-academy", "emsweb", "red-cup-science"];
const MAX_BYTES = 5 * 1024 * 1024;
const MAX_ENTRIES = 40000;
const DEADLINE_MS = 4000;
const LIST_LIMIT = 40;
const STATE_DIR = join(homedir(), ".local", "state", "561-group", "turn-sorting");

const started = Date.now();
const late = () => Date.now() - started > DEADLINE_MS;

// ---------------------------------------------------------------------------------------------
// What the turn wrote, from the transcript.

/** Paths a Bash command visibly writes. Heuristic and deliberately conservative. */
export function bashTargets(command, cwd) {
  const out = new Set();
  const add = (p) => {
    if (!p) return;
    p = p.replace(/^['"]|['"]$/g, "");
    if (!p || p.startsWith("&") || p === "-" || /^\/dev\//.test(p) || /[$`*?{]/.test(p)) return;
    out.add(isAbsolute(p) ? p : resolve(cwd, p.replace(/^~(?=\/)/, homedir())));
  };
  for (const m of command.matchAll(/(?:^|[^0-9&<>])>>?\s*([^\s;|&<>()]+)/g)) add(m[1]);
  for (const segment of command.split(/&&|\|\||[;|\n]/)) {
    const words = segment.trim().split(/\s+/).filter(Boolean);
    while (words.length && /^[A-Z_][A-Z0-9_]*=/.test(words[0])) words.shift();
    if (words[0] === "sudo" || words[0] === "nice" || words[0] === "timeout") words.splice(0, words[0] === "timeout" ? 2 : 1);
    const [cmd, ...rest] = words;
    const args = rest.filter((w) => !w.startsWith("-"));
    if (!cmd) continue;
    if (["cp", "mv", "rsync", "install", "ln", "scp"].includes(cmd) && args.length >= 2) add(args[args.length - 1]);
    else if (["mkdir", "touch"].includes(cmd)) args.forEach(add);
    else if (cmd === "tee") args.forEach(add);
    else if (cmd === "git" && rest[0] === "clone" && args.length >= 3) add(args[args.length - 1]);
  }
  return [...out];
}

/** Paths written in transcript entries after `sinceMs`: [{path, via}]. */
export function writtenSince(transcriptPath, sinceMs, fallbackCwd) {
  const written = new Map();
  let lines;
  try { lines = readFileSync(transcriptPath, "utf8").split("\n"); } catch { return []; }
  for (const line of lines) {
    if (!line) continue;
    let entry;
    try { entry = JSON.parse(line); } catch { continue; }
    if (entry.type !== "assistant") continue;
    const at = Date.parse(entry.timestamp);
    if (Number.isFinite(at) && at <= sinceMs) continue;
    const cwd = entry.cwd || fallbackCwd;
    for (const block of entry.message?.content ?? []) {
      if (block?.type !== "tool_use") continue;
      const input = block.input ?? {};
      if (["Write", "Edit", "MultiEdit", "NotebookEdit"].includes(block.name)) {
        const p = input.file_path || input.notebook_path;
        if (p) written.set(p, block.name);
      } else if (block.name === "Bash" && typeof input.command === "string") {
        for (const p of bashTargets(input.command, cwd)) if (!written.has(p)) written.set(p, "Bash");
      }
    }
  }
  return [...written].map(([path, via]) => ({ path, via })).filter(({ path }) => existsSync(path));
}

/** The time of the first human prompt of the current turn, used when no pass has been recorded. */
export function lastPromptMs(transcriptPath) {
  let last = 0;
  try {
    for (const line of readFileSync(transcriptPath, "utf8").split("\n")) {
      if (!line.includes('"human"')) continue;
      const entry = JSON.parse(line);
      if (entry.type === "user" && entry.origin?.kind === "human") last = Date.parse(entry.timestamp) || last;
    }
  } catch { /* none */ }
  return last ? last - 1 : 0;
}

// ---------------------------------------------------------------------------------------------
// The scratchpad and its carry ledger.

export function scratchpadOf(sessionId, uid = process.getuid?.() ?? 1000) {
  const root = `/tmp/claude-${uid}`;
  if (!sessionId || !existsSync(root)) return null;
  for (const project of readdirSync(root)) {
    const candidate = join(root, project, sessionId, "scratchpad");
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

export function readLedger(scratchpad) {
  const file = join(scratchpad, "CARRIED.jsonl");
  if (!existsSync(file)) return [];
  const entries = [];
  for (const line of readFileSync(file, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try {
      const entry = JSON.parse(line);
      const at = Date.parse(entry.at);
      if (typeof entry.path === "string" && Number.isFinite(at) && (entry.to || entry.disposable)) entries.push({ ...entry, at });
    } catch { /* a malformed line covers nothing */ }
  }
  return entries;
}

export function covered(ledger, rel, mtimeMs) {
  return ledger.some((e) => (e.path === rel || (e.path.endsWith("/") && rel.startsWith(e.path))) && e.at >= mtimeMs - 1000);
}

function cloneState(dir) {
  const git = (...args) => execFileSync("git", ["-C", dir, ...args], { encoding: "utf8", timeout: 1500, stdio: ["ignore", "pipe", "ignore"] });
  let origin = "";
  try { origin = git("remote", "get-url", "origin").trim(); } catch { return null; }
  if (!HOUSE_ORGS.some((org) => new RegExp(`[:/]${org}/`).test(origin))) return null;
  const status = git("status", "--porcelain=v1", "--branch").split("\n");
  const ahead = /\[ahead (\d+)/.exec(status[0] ?? "");
  const dirty = status.slice(1).some((l) => l.trim());
  const parts = [];
  if (dirty) parts.push("uncommitted changes");
  if (ahead) parts.push(`${ahead[1]} unpushed commits`);
  return parts.length ? `${parts.join(", ")}; origin ${origin}` : null;
}

/** Uncarried scratch files and house clones with unsaved work. */
export function uncarriedScratch(scratchpad) {
  const ledger = readLedger(scratchpad);
  const files = [];
  const clones = [];
  const stack = [scratchpad];
  let seen = 0;
  while (stack.length && seen < MAX_ENTRIES && !late()) {
    const dir = stack.pop();
    let names;
    try { names = readdirSync(dir, { withFileTypes: true }); } catch { continue; }
    if (dir !== scratchpad && names.some((d) => d.name === ".git")) {
      const rel = relative(scratchpad, dir) + "/";
      let mtimeMs = 0;
      try { mtimeMs = statSync(join(dir, ".git", "index")).mtimeMs; } catch { /* no index */ }
      if (!covered(ledger, rel, mtimeMs) && !late()) {
        let state = null;
        try { state = cloneState(dir); } catch { state = null; }
        if (state) clones.push(`${rel} (${state})`);
      }
      continue;
    }
    for (const d of names) {
      seen++;
      if (["node_modules", ".git", "__pycache__", "CARRIED.jsonl"].includes(d.name)) continue;
      const path = join(dir, d.name);
      if (d.isDirectory()) { stack.push(path); continue; }
      if (!d.isFile()) continue;
      const dot = d.name.lastIndexOf(".");
      if (dot < 0 || !EXTENSIONS.has(d.name.slice(dot).toLowerCase())) continue;
      let st;
      try { st = statSync(path); } catch { continue; }
      const rel = relative(scratchpad, path);
      if (st.size > 0 && st.size <= MAX_BYTES && !covered(ledger, rel, st.mtimeMs)) files.push(rel);
    }
  }
  return { files: files.sort(), clones };
}

// ---------------------------------------------------------------------------------------------
// The pass.

function stateFile(sessionId) { return join(STATE_DIR, `${sessionId}.json`); }
function readState(sessionId) { try { return JSON.parse(readFileSync(stateFile(sessionId), "utf8")); } catch { return {}; } }
function writeState(sessionId, state) { try { mkdirSync(STATE_DIR, { recursive: true }); writeFileSync(stateFile(sessionId), JSON.stringify(state)); } catch { /* fail open */ } }

export function pass(event, env = process.env) {
  const sessionId = event.session_id;
  if (!sessionId) return null;
  const repo = env.CLAUDE_PROJECT_DIR || event.cwd || "";
  const state = readState(sessionId);
  const since = state.lastSortedAt ? Date.parse(state.lastSortedAt) : lastPromptMs(event.transcript_path);
  const scratchpad = scratchpadOf(sessionId);
  const scratch = scratchpad ? uncarriedScratch(scratchpad) : { files: [], clones: [] };

  if (event.stop_hook_active) {
    writeState(sessionId, { lastSortedAt: new Date().toISOString() });
    const left = scratch.files.length + scratch.clones.length;
    return left ? { systemMessage: `Sorting pass ended with ${left} item(s) still only in ${scratchpad} (not in the repository and not ledgered as disposable).` } : null;
  }

  const written = event.transcript_path ? writtenSince(event.transcript_path, since, event.cwd) : [];
  const inside = written.filter(({ path }) => repo && path.startsWith(repo + "/") && !path.includes("/node_modules/"));
  const outside = written.filter(({ path }) => !(repo && path.startsWith(repo + "/")) && !(scratchpad && path.startsWith(scratchpad + "/")));
  if (!inside.length && !outside.length && !scratch.files.length && !scratch.clones.length) {
    writeState(sessionId, { lastSortedAt: new Date().toISOString() });
    return null;
  }
  const show = (items) => items.slice(0, LIST_LIMIT).map((x) => `  - ${x}`).concat(items.length > LIST_LIMIT ? [`  - and ${items.length - LIST_LIMIT} more`] : []);
  const lines = ["Sorting pass: before this turn ends, look at what you wrote and put each piece where it belongs."];
  if (inside.length) lines.push("", `Written inside the repository (${repo}) since the last pass; confirm each is in its proper home (owning section; notes at content/text/documents/articles/notes/YYYY/MM/DD/, data at data/records/, code in its package's src/ or scripts/; no duplicate of something that already exists; indexes and READMEs that should name it do), and move it if not:`, ...show(inside.map(({ path, via }) => `${relative(repo, path)} (${via})`)));
  if (outside.length) lines.push("", "Written outside the repository; carry each into the repository at full depth or say in your reply why it is disposable:", ...show(outside.map(({ path, via }) => `${path} (${via})`)));
  if (scratch.files.length || scratch.clones.length) lines.push("", `Only in the scratchpad ${scratchpad}, which /tmp does not keep; carry each into the repository at full depth (house clones: commit and push), then append a line per carried path to ${join(scratchpad, "CARRIED.jsonl")} like {"path": "<scratch path>", "to": "<repo path>", "at": "<date -Is>"}, or {"path": ..., "disposable": "<why it is regenerable>", "at": ...}; a path ending in "/" covers its directory:`, ...show([...scratch.clones.map((c) => `clone ${c}`), ...scratch.files]));
  lines.push("", "If everything is already where it belongs, say so in one line and end the turn.");
  return { decision: "block", reason: lines.join("\n") };
}

const isMain = process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname);
if (isMain) {
  const timer = setTimeout(() => process.exit(0), DEADLINE_MS + 2000);
  let input = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk) => { input += chunk; });
  process.stdin.on("end", () => {
    try {
      const out = pass(JSON.parse(input || "{}"));
      if (out) process.stdout.write(JSON.stringify(out));
    } catch { /* fail open */ }
    clearTimeout(timer);
    process.exit(0);
  });
}
