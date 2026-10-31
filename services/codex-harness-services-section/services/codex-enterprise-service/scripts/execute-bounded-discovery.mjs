#!/usr/bin/env node
import { randomUUID } from "node:crypto";
import { createReadStream, createWriteStream, existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import { DEFAULT_TOOL_BOUNDARY_BUDGET, classifyEvidenceLine, compileToolEvidence } from "../src/tool-evidence.mjs";
import { DEFAULT_STATE_ROOT } from "../src/enterprise.mjs";
import { semanticFileKey, semanticIdentity } from "../src/semiotic-circuit.mjs";

function fail(message) { throw new Error(message); }
function parse(argv) {
  const at = argv.indexOf("--request"); if (at < 0 || !argv[at + 1]) fail("--request is required");
  let value; try { value = JSON.parse(Buffer.from(argv[at + 1], "base64url")); } catch { fail("--request is not valid base64url JSON"); }
  if (typeof value.command !== "string" || !value.command.trim()) fail("request.command is required");
  if (typeof value.cwd !== "string") fail("request.cwd is required");
  return value;
}
function stateRoot() { return resolve(process.env.CODEX_ENTERPRISE_STATE_ROOT ?? DEFAULT_STATE_ROOT); }
function identifyCarrier(path, objectKind) {
  return semanticIdentity({ encoding: "base64", bytes: readFileSync(path).toString("base64") }, objectKind).id;
}
function pump(source, destination, maximum) {
  let bytes = 0, complete = true;
  return new Promise((resolvePump, reject) => {
    source.on("data", (chunk) => {
      const retained = Math.max(0, Math.min(chunk.length, maximum - bytes));
      if (retained !== chunk.length) complete = false;
      bytes += retained;
      // Keep draining after the carrier is full.  Closing the pipe or killing
      // the child changes the command's native exit status.
      if (retained && !destination.write(retained === chunk.length ? chunk : chunk.subarray(0, retained))) {
        source.pause(); destination.once("drain", () => source.resume());
      }
    });
    source.on("error", (error) => error?.code === "ERR_STREAM_PREMATURE_CLOSE" ? destination.end() : reject(error));
    source.on("end", () => destination.end());
    destination.on("error", reject); destination.on("finish", () => resolvePump({ bytes: Math.min(bytes, maximum), complete }));
  });
}
const PRIORITY = { fatal: 0, failure: 1, warning: 2, change: 3, address: 4, success: 5, other: 6 };
async function summarizeCarrier(path, label, budget) {
  const counts = { fatal: 0, failure: 0, warning: 0, change: 0, success: 0, address: 0, other: 0 };
  const findings = [], seen = new Set(); let line = 0, carry = "", discarding = false;
  const acceptLine = (text) => {
    line += 1; if (!text.trim()) return;
    const kind = classifyEvidenceLine(text); counts[kind] += 1;
    const excerpt = Buffer.from(text).subarray(0, budget.maximumFindingBytes).toString("utf8");
    const key = excerpt.replace(/\b[0-9]+\b/gu, "#").replace(/\s+/gu, " ").trim();
    if (!seen.has(key)) { seen.add(key); findings.push({ line, stream: label, category: kind, excerpt, address: `${path}#L${line}` }); }
  };
  for await (const chunk of createReadStream(path, { encoding: "utf8" })) {
    for (const character of chunk) {
      if (character === "\n") { acceptLine(carry); carry = ""; discarding = false; }
      else if (!discarding) {
        carry += character;
        if (Buffer.byteLength(carry) >= budget.maximumFindingBytes) discarding = true;
      }
    }
  }
  if (carry || discarding) acceptLine(carry);
  findings.sort((left, right) => PRIORITY[left.category] - PRIORITY[right.category] || left.line - right.line);
  return { lineCount: line, classifications: counts, findings: findings.slice(0, budget.maximumFindingCount) };
}
function mergeSummaries(summaries, budget) {
  const classifications = { fatal: 0, failure: 0, warning: 0, change: 0, success: 0, address: 0, other: 0 };
  for (const summary of summaries) for (const [kind, count] of Object.entries(summary.classifications)) classifications[kind] += count;
  const findings = summaries.flatMap((summary) => summary.findings).sort((left, right) => PRIORITY[left.category] - PRIORITY[right.category] || left.stream.localeCompare(right.stream) || left.line - right.line).slice(0, budget.maximumFindingCount);
  return { lineCount: summaries.reduce((sum, item) => sum + item.lineCount, 0), classifications, findings };
}
async function run(request) {
  const budget = { ...DEFAULT_TOOL_BOUNDARY_BUDGET, ...(request.budget ?? {}), phase: request.budget?.phase ?? "context-discovery" };
  const runRoot = join(stateRoot(), "tool-evidence", "runs"); mkdirSync(runRoot, { recursive: true });
  const stem = `${process.pid}-${randomUUID()}`, stdoutTemporary = join(runRoot, `${stem}.stdout.tmp`), stderrTemporary = join(runRoot, `${stem}.stderr.tmp`), timePath = join(runRoot, `${stem}.time`);
  const stdoutWriter = createWriteStream(stdoutTemporary, { mode: 0o600, flags: "wx" }), stderrWriter = createWriteStream(stderrTemporary, { mode: 0o600, flags: "wx" });
  const timeFormat = "%e\t%U\t%S\t%M\t%x";
  const stderrBudget = Math.min(Math.floor(budget.maximumRawCaptureBytes / 4), 4096);
  const stdoutBudget = budget.maximumRawCaptureBytes - stderrBudget;
  // A non-login shell preserves spawn's cwd.  Login startup files are allowed
  // to change it, which broadens a discovery command beyond its workdir.
  const child = spawn("/usr/bin/time", ["-f", timeFormat, "-o", timePath, "/bin/bash", "-c", request.command], { cwd: resolve(request.cwd), env: process.env, stdio: ["ignore", "pipe", "pipe"] });
  const [stdoutCapture, stderrCapture, completion] = await Promise.all([
    pump(child.stdout, stdoutWriter, stdoutBudget),
    pump(child.stderr, stderrWriter, stderrBudget),
    new Promise((resolveChild, reject) => { child.on("error", reject); child.on("close", (code, signal) => resolveChild({ code, signal })); }),
  ]);
  const stdoutDigest = identifyCarrier(stdoutTemporary, "bare-cedar-fog-codex.tool-stdout-carrier");
  const stderrDigest = identifyCarrier(stderrTemporary, "bare-cedar-fog-codex.tool-stderr-carrier");
  const rawRoot = join(stateRoot(), "tool-evidence", "raw"); mkdirSync(rawRoot, { recursive: true });
  const stdoutPath = join(rawRoot, `${semanticFileKey(stdoutDigest)}.stdout`), stderrPath = join(rawRoot, `${semanticFileKey(stderrDigest)}.stderr`);
  const reusedStdout = existsSync(stdoutPath), reusedStderr = existsSync(stderrPath);
  if (reusedStdout) rmSync(stdoutTemporary); else renameSync(stdoutTemporary, stdoutPath);
  if (reusedStderr) rmSync(stderrTemporary); else renameSync(stderrTemporary, stderrPath);
  const timing = existsSync(timePath) ? readFileSync(timePath, "utf8").trim().split("\t") : [];
  rmSync(timePath, { force: true });
  const stdoutBytes = statSync(stdoutPath).size, stderrBytes = statSync(stderrPath).size;
  const carrier = {
    type: "BoundedDiscoveryCommandResult", command: request.command, cwd: request.cwd,
    exitCode: completion.code, signal: completion.signal, captureComplete: stdoutCapture.complete && stderrCapture.complete,
    stdout: { digest: stdoutDigest, carrier: stdoutPath, bytes: stdoutBytes, reused: reusedStdout },
    stderr: { digest: stderrDigest, carrier: stderrPath, bytes: stderrBytes, reused: reusedStderr },
    resources: { wallTime: timing[0] ? { amount: Number(timing[0]), unit: "seconds" } : null, cpuUser: timing[1] ? { amount: Number(timing[1]), unit: "seconds" } : null, cpuSystem: timing[2] ? { amount: Number(timing[2]), unit: "seconds" } : null, peakRss: timing[3] ? { amount: Number(timing[3]) * 1024, unit: "bytes" } : null },
  };
  const summary = mergeSummaries(await Promise.all([summarizeCarrier(stdoutPath, "stdout", budget), summarizeCarrier(stderrPath, "stderr", budget)]), budget);
  const aggregateDigest = semanticIdentity({ stdout: stdoutDigest, stderr: stderrDigest, exitCode: completion.code, signal: completion.signal }, "bare-cedar-fog-codex.tool-output-descriptor").id;
  const outputDescriptor = { digest: aggregateDigest, complete: carrier.captureComplete, carriers: [{ stream: "stdout", ...carrier.stdout }, { stream: "stderr", ...carrier.stderr }] };
  const compiled = compileToolEvidence({ tool_name: "bounded-discovery", tool_input: { command: request.command, cwd: request.cwd }, tool_response: carrier, model: request.model, tool_use_id: request.toolUseId }, { provider: request.provider, budget, observedAt: new Date().toISOString(), summary, outputBytes: stdoutBytes + stderrBytes, outputDescriptor, resources: carrier.resources });
  // The caller asked for command output, not a receipt in place of it.  Replay
  // the bounded carriers even after truncation; the receipt remains a
  // secondary, addressable record rather than consuming the useful result.
  if (stdoutBytes) process.stdout.write(readFileSync(stdoutPath));
  if (stderrBytes) process.stderr.write(readFileSync(stderrPath));
  process.stdout.write(`\n[bounded discovery receipt ${compiled.receipt.id}; raw carriers retained; complete=${carrier.captureComplete}; cache reused=${compiled.reused || reusedStdout || reusedStderr}]\n`);
  process.exitCode = Number.isInteger(completion.code) ? completion.code : 1;
}

if (fileURLToPath(import.meta.url) === process.argv[1]) run(parse(process.argv.slice(2))).catch((error) => { process.stderr.write(`bounded-discovery: ${error.message}\n`); process.exitCode = 2; });
