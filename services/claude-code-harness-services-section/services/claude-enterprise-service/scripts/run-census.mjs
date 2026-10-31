#!/usr/bin/env node
// Census: re-run every target node's own verification command and record the
// observed exit statuses as dated log records. Truth is derived by re-running,
// never read from a report (concept-of-operations §2.3; the-distal-bypass).
// Red is recorded, never smoothed: the census always completes and always
// writes its records; it exits 0 only when every target was green, 3 when any
// target was red, 1 on its own failure to run. Log layout per the Leader's
// ruling of 2026-07-30: data/logs/YYYY/MM/DD/YYYY-MM-DD-<unit>-census.jsonl.
import { spawnSync } from "node:child_process";
import { mkdirSync, appendFileSync, readFileSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Data root: a checkout of 561-group/561-group-bare-cedar-fog-claude-services-section (env CLAUDE_SERVICES_ROOT, default cwd).
const NODE_ROOT = resolve(process.env.CLAUDE_SERVICES_ROOT ?? process.cwd());
const UNIT = "bare-cedar-fog-claude-services-section";

function repoRoot() {
  let dir = NODE_ROOT;
  for (;;) {
    if (existsSync(join(dir, ".mcp.json")) && existsSync(join(dir, "Makefile"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) throw new Error("census: cannot locate repository root");
    dir = parent;
  }
}

const ROOT = repoRoot();
const targetsRecord = JSON.parse(readFileSync(join(NODE_ROOT, "content", "harness", "census-targets.json"), "utf8"));
const startedAt = new Date();
const results = [];

for (const target of targetsRecord.targets) {
  const cwd = join(ROOT, target.path);
  const t0 = Date.now();
  let exit = null;
  let error = null;
  if (!existsSync(cwd)) {
    error = "target path does not exist";
  } else {
    const run = spawnSync(target.command[0], target.command.slice(1), {
      cwd,
      timeout: 300_000,
      stdio: ["ignore", "ignore", "pipe"],
      env: process.env,
    });
    exit = run.status;
    if (run.error) error = String(run.error.message ?? run.error);
    else if (run.status !== 0) error = String(run.stderr ?? "").split("\n").filter(Boolean).slice(-3).join(" | ").slice(0, 500);
  }
  const record = {
    type: "CensusTargetObservation",
    census: startedAt.toISOString(),
    target: target.id,
    path: target.path,
    command: target.command.join(" "),
    exit,
    green: exit === 0,
    wallMs: Date.now() - t0,
    observedAt: new Date().toISOString(),
    ...(error ? { error } : {}),
  };
  results.push(record);
  process.stderr.write(`${record.green ? "green" : "RED  "} ${target.id} exit=${exit} ${record.wallMs}ms\n`);
}

const y = String(startedAt.getUTCFullYear());
const m = String(startedAt.getUTCMonth() + 1).padStart(2, "0");
const d = String(startedAt.getUTCDate()).padStart(2, "0");
const logDir = join(NODE_ROOT, "data", "logs", y, m, d);
mkdirSync(logDir, { recursive: true });
const logFile = join(logDir, `${y}-${m}-${d}-${UNIT}-census.jsonl`);
for (const record of results) appendFileSync(logFile, JSON.stringify(record) + "\n");

const red = results.filter((r) => !r.green);
const summary = {
  type: "CensusRun",
  census: startedAt.toISOString(),
  unit: UNIT,
  targets: results.length,
  green: results.length - red.length,
  red: red.map((r) => r.target),
  log: logFile.slice(ROOT.length + 1),
};
appendFileSync(logFile, JSON.stringify(summary) + "\n");
process.stdout.write(JSON.stringify(summary, null, 2) + "\n");
process.exit(red.length ? 3 : 0);
