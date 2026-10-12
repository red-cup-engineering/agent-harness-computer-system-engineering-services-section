import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  boundedDiscoveryRewrite,
  classifyLine,
  compileEvidence,
  compileToolEvidence,
  DEFAULT_TOOL_BOUNDARY_BUDGET,
  declaredBudget,
  declaredToolBudget,
  readEvidence,
  readToolEvidence,
} from "../src/tool-evidence.mjs";

const state = () => ({ stateRoot: mkdtempSync(join(tmpdir(), "tool-evidence-")) });
const FIXTURE_DISCOVERY_SCRIPT = "/opt/harness-fixture/discover.mjs";

function failureFixture() {
  const lines = [];
  for (let index = 0; Buffer.byteLength(lines.join("\n")) < 176_000; index += 1) {
    lines.push(` M lib/submodule-${String(index).padStart(5, "0")}/src/file-${index}.mjs`);
  }
  return lines.join("\n");
}

test("a failure-sized result becomes a bounded premium receipt with exact paged evidence", () => {
  const options = state(), raw = failureFixture();
  const input = { hook_event_name: "PostToolUse", tool_name: "Bash", tool_input: { command: "git status --short" }, tool_response: { output: raw }, model: "gpt-5.6-sol", tool_use_id: "tool-44k" };
  const compiled = compileToolEvidence(input, options);
  assert.equal(compiled.receipt.phase, "context-discovery");
  assert.equal(compiled.receipt.premiumContext.truncated, true);
  assert.ok(Buffer.byteLength(compiled.modelContext) <= 12_288);
  assert.match(compiled.modelContext, /"type":"ToolEvidenceReceipt"/u);
  assert.match(compiled.modelContext, /"summary"/u);
  assert.equal(compiled.receipt.output.quantity.amount, Buffer.byteLength(JSON.stringify(input.tool_response)));
  assert.ok(compiled.receipt.summary.classifications.change > 1000);
  assert.ok(compiled.receipt.summary.findings.every(({ address }) => /#L[0-9]+$/u.test(address)));
  const first = readToolEvidence({ receipt: compiled.receipt.id, maximumBytes: 4096 }, options);
  assert.equal(first.returnedBytes, 4096);
  assert.equal(first.nextOffset, 4096);
  assert.equal(Buffer.from(first.content, "base64").toString("utf8"), readFileSync(compiled.receipt.output.carrier).subarray(0, 4096).toString("utf8"));
  const repeated = compileToolEvidence(input, options);
  assert.equal(repeated.receipt.id, compiled.receipt.id);
  assert.equal(repeated.reused, true);
});

test("the default raw capture cap is sixteen MiB", () => {
  assert.equal(DEFAULT_TOOL_BOUNDARY_BUDGET.maximumRawCaptureBytes, 16 * 1024 * 1024);
  assert.equal(declaredToolBudget({ tool_name: "Bash", tool_input: { command: "git status" } }).maximumRawCaptureBytes, 16 * 1024 * 1024);
});

test("ordinary small output remains direct and useful", () => {
  const compiled = compileToolEvidence({ tool_name: "Bash", tool_input: { command: "printf ok" }, tool_response: { output: "ok\n", exit_code: 0 }, model: "gpt-5.6-sol" }, state());
  assert.equal(compiled.receipt.premiumContext.truncated, false);
  assert.equal(compiled.receipt.routing.next, "direct-tool-result");
  assert.equal(compiled.receipt.summary.lineCount, 1);
  assert.match(compiled.modelContext, /"type":"ToolEvidenceReceipt"/u);
});

test("a caller declares its own actor instead of the package default", () => {
  const compiled = compileToolEvidence({ tool_name: "Bash", tool_input: { command: "printf ok" }, tool_response: { output: "ok\n" } }, { ...state(), actor: "urn:ame:some-other-harness" });
  assert.equal(compiled.receipt.actor, "urn:ame:some-other-harness");
});

test("the compatibility byte-oriented API retains exact UTF-8 paging through the receipt", () => {
  const options = state(), raw = "warning: first\nsecond line\n";
  const compiled = compileEvidence(raw, { ...options, tool: "run-bounded-command", maximumSummaryBytes: 1024 });
  assert.equal(compiled.receipt.outputBytes, Buffer.byteLength(raw));
  assert.equal(compiled.receipt.carrier, compiled.receipt.output.carrier);
  assert.equal(classifyLine("warning: first"), "warning");
  assert.equal(declaredBudget({ maximumSummaryBytes: 2048 }).maximumSummaryBytes, 2048);
  const page = readEvidence({ receipt: compiled.receipt.id, maximumBytes: 9 }, options);
  assert.equal(page.encoding, "utf8");
  assert.equal(page.content, raw.slice(0, 9));
  assert.equal(page.nextOffset, 9);
});

test("pre-tool routing wraps risky discovery but respects an explicit aggregation", () => {
  const risky = { tool_name: "Bash", tool_input: { command: "find . -type f", workdir: "/workspace/root", max_output_tokens: 100 }, cwd: "/workspace/root", model: "gpt-5.6-sol" };
  const rewrite = boundedDiscoveryRewrite(risky, { budget: declaredToolBudget(risky), discoveryScriptPath: FIXTURE_DISCOVERY_SCRIPT });
  assert.match(rewrite.updatedInput.command, /discover\.mjs/u);
  const request = JSON.parse(Buffer.from(rewrite.updatedInput.command.split(" ").at(-1), "base64url"));
  assert.equal(request.command, "find . -type f");
  assert.equal(request.budget.maximumRawCaptureBytes, 400);
  assert.equal(boundedDiscoveryRewrite({ ...risky, tool_input: { command: "find . -type f | head -20" } }), null);
});

test("ordinary Git commands remain native", () => {
  const input = { tool_name: "Bash", tool_input: { command: "git status --short", workdir: "/workspace/root" } };
  assert.equal(boundedDiscoveryRewrite(input), null);
});

test("Claude print-mode invocations are never substituted as shell discovery", () => {
  const input = { tool_name: "functions.exec", tool_input: { cmd: "claude --model sonnet --no-session-persistence --allowedTools Read,Glob,Grep -p 'find . and explain it'", workdir: "/workspace/root" } };
  assert.equal(boundedDiscoveryRewrite(input), null);
});

test("host-level exec workdir takes precedence over the harness cwd", () => {
  const target = mkdtempSync(join(tmpdir(), "host-workdir-"));
  const rewrite = boundedDiscoveryRewrite({
    tool_name: "exec_command", cwd: "/workspace/root", workdir: target,
    tool_input: { cmd: "find . -maxdepth 3", max_output_tokens: 100 },
  }, { discoveryScriptPath: FIXTURE_DISCOVERY_SCRIPT });
  assert.equal(rewrite.request.cwd, target);
});

test("discovery stays native when a harness withholds its requested workdir from the hook", () => {
  for (const tool_name of ["Bash", "exec_command", "functions.exec"]) {
    const input = { tool_name, cwd: "/workspace/root", tool_input: { cmd: "find . -maxdepth 3" } };
    assert.equal(boundedDiscoveryRewrite(input), null, tool_name);
  }
});

test("rewriting a huge-discovery command without a configured discovery script refuses rather than silently passing it through native", () => {
  const input = { tool_name: "exec_command", cwd: "/workspace/root", workdir: "/workspace/root", tool_input: { cmd: "find . -maxdepth 3", max_output_tokens: 100 } };
  assert.throws(() => boundedDiscoveryRewrite(input), TypeError);
});

test("pre-tool routing preserves a top-level exec workdir", () => {
  const input = { tool_name: "exec_command", tool_input: { cmd: "find ." }, workdir: "/tmp/harness-workdir-witness", model: "gpt-5.6-sol" };
  const rewrite = boundedDiscoveryRewrite(input, { budget: declaredToolBudget(input), discoveryScriptPath: FIXTURE_DISCOVERY_SCRIPT });
  const request = JSON.parse(Buffer.from(rewrite.updatedInput.cmd.split(" ").at(-1), "base64url"));
  assert.equal(request.cwd, "/tmp/harness-workdir-witness");
  assert.equal(rewrite.updatedInput.workdir, "/tmp/harness-workdir-witness");
});
