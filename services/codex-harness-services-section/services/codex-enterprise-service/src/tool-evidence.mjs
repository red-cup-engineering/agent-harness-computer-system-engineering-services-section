import { closeSync, existsSync, mkdirSync, openSync, readFileSync, readSync, renameSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { ACTOR, DEFAULT_STATE_ROOT, appendObservation, identity } from "./enterprise.mjs";
import { semanticFileKey, semanticIdentity } from "./semiotic-circuit.mjs";

export const DEFAULT_TOOL_BOUNDARY_BUDGET = Object.freeze({
  maximumPremiumContextBytes: 12_288,
  maximumFindingCount: 16,
  maximumFindingBytes: 512,
  maximumRawCaptureBytes: 16_777_216,
});


function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

function bytesIdentity(bytes, objectKind) { return semanticIdentity({ encoding: "base64", bytes: Buffer.from(bytes).toString("base64") }, objectKind).id; }
function stateRoot(options = {}) { return resolve(options.stateRoot ?? process.env.CODEX_ENTERPRISE_STATE_ROOT ?? DEFAULT_STATE_ROOT); }
function evidenceRoot(options = {}) { return join(stateRoot(options), "tool-evidence"); }
function integer(value, fallback, minimum = 1, maximum = Number.MAX_SAFE_INTEGER) {
  return Number.isSafeInteger(value) && value >= minimum && value <= maximum ? value : fallback;
}
function commandOf(input) {
  const value = input?.tool_input ?? {};
  return typeof value.command === "string" ? value.command : typeof value.cmd === "string" ? value.cmd : "";
}
function commandField(input) { return typeof input?.tool_input?.command === "string" ? "command" : "cmd"; }
function hasRequestedWorkdir(input) {
  return [input?.tool_input?.workdir, input?.workdir, input?.tool_input?.cwd].some((value) => typeof value === "string" && value.trim());
}
function workdirOf(input) {
  for (const value of [input?.tool_input?.workdir, input?.workdir, input?.tool_input?.cwd, input?.cwd]) {
    if (typeof value === "string" && value.trim()) return resolve(value);
  }
  return process.cwd();
}

export function classifyCostPhase(toolName, toolInput = {}) {
  const tool = String(toolName ?? "unknown");
  const command = String(toolInput.command ?? toolInput.cmd ?? "");
  if (/Agent|spawn_agent|collaboration|market|supplier|activitypub|a2a/iu.test(tool)) return "coordination";
  if (tool === "apply_patch" || /(?:^|\s)(?:mv|cp|install|write|format|generate|build)(?:\s|$)/iu.test(command)) return "implementation";
  if (/(?:test|verify|check|lint|typecheck|pytest|vitest|jest|cargo test|go test)/iu.test(`${tool} ${command}`)) return "verification";
  if (/(?:search|find|read|list|status|diff|log|show|inventory|query|observe|discover|context)/iu.test(`${tool} ${command}`)) return "context-discovery";
  return "implementation";
}

export function declaredToolBudget(input, overrides = {}) {
  const phase = classifyCostPhase(input?.tool_name, input?.tool_input);
  return Object.freeze({
    type: "ToolBoundaryBudget",
    phase,
    maximumPremiumContextBytes: integer(overrides.maximumPremiumContextBytes, DEFAULT_TOOL_BOUNDARY_BUDGET.maximumPremiumContextBytes, 1024, 65_536),
    maximumFindingCount: integer(overrides.maximumFindingCount, DEFAULT_TOOL_BOUNDARY_BUDGET.maximumFindingCount, 1, 100),
    maximumFindingBytes: integer(overrides.maximumFindingBytes, DEFAULT_TOOL_BOUNDARY_BUDGET.maximumFindingBytes, 64, 4096),
    maximumRawCaptureBytes: integer(overrides.maximumRawCaptureBytes, DEFAULT_TOOL_BOUNDARY_BUDGET.maximumRawCaptureBytes, 1_048_576, 1_073_741_824),
    degradationOrder: ["deterministic-aggregate", "reuse-content-addressed-result", "page-exact-carrier", "contract-clerical-inference", "bounded-refusal"],
  });
}

function explicitlyBounded(command) {
  return /(?:\||^)\s*(?:head|tail|wc|jq|awk|sed)\b|--max-count(?:=|\s)|--count\b|--files-with-matches\b|--quiet\b|\blimit\s+[0-9]+\b/iu.test(command);
}

export function potentiallyHugeDiscovery(input) {
  const command = commandOf(input);
  if (!command || explicitlyBounded(command)) return false;
  // Claude Code owns the protocol for its print-mode provider exchange.  Its
  // prompt may legitimately mention shell discovery words, which must not
  // cause the enclosing provider CLI to be substituted with our pipe runner.
  if (/^\s*(?:command\s+|env\s+)?claude\b/iu.test(command)) return false;
  return /(?:^|[;&|]\s*)(?:rg|grep|find|fd|tree|du)\b|\b(?:npm|pnpm|yarn)\s+(?:list|ls|why|audit)\b|\b(?:pytest|vitest|jest|cargo\s+test|go\s+test|npm\s+test|pnpm\s+test)\b/iu.test(command);
}

export function boundedDiscoveryRewrite(input, options = {}) {
  if (!potentiallyHugeDiscovery(input)) return null;
  // Codex's exec_command hook payload can omit its per-call workdir while the
  // native executor still knows it.  Replacing cmd in that shape loses the
  // host-only cwd and silently runs from the repository root.  Leave that
  // invocation native; PostToolUse records the host-bounded result.
  if (!hasRequestedWorkdir(input)) return null;
  const requestedOutputTokens = integer(input?.tool_input?.max_output_tokens, 4000, 1, 4000);
  // Native tools declare their response budget in tokens.  The bounded runner
  // stores bytes, so use a conservative four-byte carrier allowance and never
  // retain more raw discovery output than the caller asked to receive.
  const budget = { ...(options.budget ?? declaredToolBudget(input, options)), maximumRawCaptureBytes: requestedOutputTokens * 4 };
  const request = {
    command: commandOf(input),
    cwd: workdirOf(input),
    sessionId: input?.session_id ?? null,
    turnId: input?.turn_id ?? null,
    toolUseId: input?.tool_use_id ?? null,
    model: input?.model ?? null,
    provider: options.provider ?? "provider-native",
    budget,
  };
  const script = resolve(dirname(fileURLToPath(import.meta.url)), "../scripts/execute-bounded-discovery.mjs");
  const encoded = Buffer.from(JSON.stringify(request)).toString("base64url");
  const updatedInput = { ...(input.tool_input ?? {}), [commandField(input)]: `${process.execPath} ${script} --request ${encoded}` };
  if (Object.hasOwn(updatedInput, "max_output_tokens") || input.tool_name === "Bash" || input.tool_name === "exec_command") updatedInput.max_output_tokens = Math.min(integer(updatedInput.max_output_tokens, 4000), 4000);
  return Object.freeze({ budget, request, updatedInput });
}

export function classifyEvidenceLine(line) {
  if (/\b(?:fatal|panic|exception|traceback|segmentation fault|oom|out of memory)\b/iu.test(line)) return "fatal";
  if (/\b(?:error|failed|failure|not ok|assertion)\b/iu.test(line)) return "failure";
  if (/\b(?:warn|warning|deprecated)\b/iu.test(line)) return "warning";
  if (/^(?:[ MARC?DUT]{2}|diff --git|@@|\+\+\+|---)\s/u.test(line)) return "change";
  if (/\b(?:pass|passed|ok|success)\b/iu.test(line)) return "success";
  if (/(?:^|\s)(?:\.?\.?\/)?[^\s:]+\.[A-Za-z0-9]{1,8}(?::[0-9]+)?(?:\s|$)/u.test(line)) return "address";
  return "other";
}

function summarizeText(text, budget) {
  const counts = { fatal: 0, failure: 0, warning: 0, change: 0, success: 0, address: 0, other: 0 };
  const priorities = { fatal: 0, failure: 1, warning: 2, change: 3, address: 4, success: 5, other: 6 };
  const candidates = [], seen = new Set();
  const lines = String(text).split(/\r?\n/u);
  for (let index = 0; index < lines.length; index += 1) {
    const raw = lines[index]; if (!raw.trim()) continue;
    const kind = classifyEvidenceLine(raw); counts[kind] += 1;
    const excerpt = Buffer.from(raw).subarray(0, budget.maximumFindingBytes).toString("utf8");
    const key = excerpt.replace(/\b[0-9]+\b/gu, "#").replace(/\s+/gu, " ").trim();
    if (!seen.has(key)) { seen.add(key); candidates.push({ line: index + 1, category: kind, excerpt }); }
  }
  candidates.sort((left, right) => priorities[left.category] - priorities[right.category] || left.line - right.line);
  return { lineCount: lines.length - (lines.at(-1) === "" ? 1 : 0), classifications: counts, findings: candidates.slice(0, budget.maximumFindingCount) };
}

function extractResponseText(value) {
  if (typeof value === "string") return value;
  if (typeof value?.output === "string") return value.output;
  if (Array.isArray(value?.content)) return value.content.filter((item) => item?.type === "text" && typeof item.text === "string").map((item) => item.text).join("\n");
  return JSON.stringify(value);
}

function writeImmutable(path, bytes) {
  mkdirSync(dirname(path), { recursive: true });
  if (existsSync(path)) {
    if (!readFileSync(path).equals(Buffer.from(bytes))) throw new Error(`content-address conflict at ${path}`);
    return true;
  }
  const temporary = `${path}.${process.pid}.tmp`;
  writeFileSync(temporary, bytes, { mode: 0o600, flag: "wx" }); renameSync(temporary, path); return false;
}

function observableDuration(response) {
  const seconds = response?.wall_time_seconds ?? response?.wallTimeSeconds;
  return typeof seconds === "number" && Number.isFinite(seconds) && seconds >= 0 ? { amount: seconds, unit: "seconds", source: "tool-response" } : null;
}

export function compileToolEvidence(input, options = {}) {
  const budget = options.budget ?? declaredToolBudget(input, options);
  const raw = Buffer.from(canonical(input?.tool_response ?? null));
  const rawDigest = bytesIdentity(raw, "bare-cedar-fog-codex.tool-output-carrier"), rawPath = join(evidenceRoot(options), "raw", `${semanticFileKey(rawDigest)}.json`);
  const reusedRaw = writeImmutable(rawPath, raw);
  const summary = options.summary ?? summarizeText(extractResponseText(input?.tool_response), budget);
  if (!options.summary) summary.findings = summary.findings.map((finding) => ({ ...finding, address: `${rawPath}#L${finding.line}` }));
  const argumentBytes = Buffer.byteLength(canonical(input?.tool_input ?? null));
  const suppliedOutput = options.outputDescriptor;
  const measuredOutputBytes = integer(options.outputBytes, raw.length, 0, Number.MAX_SAFE_INTEGER);
  const outputDigest = suppliedOutput?.digest ?? rawDigest;
  const measuredResources = options.resources ?? null;
  semanticFileKey(outputDigest);
  const body = {
    type: "ToolEvidenceReceipt",
    version: 1,
    actor: ACTOR,
    phase: budget.phase,
    tool: String(input?.tool_name ?? "unknown"),
    provider: options.provider ?? "provider-native",
    model: input?.model ?? null,
    input: { digest: semanticIdentity(input?.tool_input ?? null, "bare-cedar-fog-codex.tool-input").id, quantity: { amount: argumentBytes, unit: "bytes" } },
    output: suppliedOutput
      ? { ...suppliedOutput, digest: outputDigest, ni: outputDigest, quantity: { amount: measuredOutputBytes, unit: "bytes" } }
      : { digest: outputDigest, ni: rawDigest, quantity: { amount: measuredOutputBytes, unit: "bytes" }, carrier: rawPath, complete: true },
    premiumContext: { budget: { amount: budget.maximumPremiumContextBytes, unit: "bytes" }, original: { amount: measuredOutputBytes, unit: "bytes" }, truncated: measuredOutputBytes > budget.maximumPremiumContextBytes },
    elapsed: measuredResources?.wallTime ?? observableDuration(input?.tool_response),
    compute: measuredResources ? { cpuUser: measuredResources.cpuUser ?? null, cpuSystem: measuredResources.cpuSystem ?? null, peakRss: measuredResources.peakRss ?? null } : null,
    cache: { key: outputDigest, mode: "content-addressed-evidence", executionReused: false },
    delegation: /Agent|spawn_agent|collaboration/iu.test(String(input?.tool_name ?? "")),
    summary,
    routing: measuredOutputBytes > budget.maximumPremiumContextBytes
      ? { next: "decision-relevant-receipt", semanticCompression: "contract-existing-inference-work-market-if-deterministic-summary-is-insufficient", premiumReasoning: "only-after-an-explicit-decision-question-is-bound-to-addressed-evidence" }
      : { next: "direct-tool-result", semanticCompression: "not-required", premiumReasoning: "current-session-discretion" },
    settlement: { canonicalSubstrate: "Union chain", status: "unsettled-local-content-addressed-carrier", r2: "not-used" },
  };
  const receipt = Object.freeze({ id: identity(body), ...body });
  const receiptPath = join(evidenceRoot(options), "receipts", `${semanticFileKey(receipt.id)}.json`);
  const reusedReceipt = writeImmutable(receiptPath, Buffer.from(`${canonical(receipt)}\n`));
  const contextBody = {
    type: receipt.type, id: receipt.id, phase: receipt.phase, tool: receipt.tool, provider: receipt.provider, model: receipt.model,
    input: receipt.input, output: receipt.output, premiumContext: receipt.premiumContext,
    elapsed: receipt.elapsed, compute: receipt.compute, cache: { ...receipt.cache, reused: reusedReceipt || reusedRaw }, delegation: receipt.delegation,
    summary: { ...receipt.summary, findings: [...receipt.summary.findings] }, routing: receipt.routing, settlement: receipt.settlement,
    receiptAddress: receiptPath,
    drillDown: { operation: "read_codex_tool_evidence", receipt: receipt.id, ...(Array.isArray(receipt.output.carriers) ? { stream: "stdout" } : {}), offset: 0, maximumBytes: Math.min(16_384, budget.maximumPremiumContextBytes) },
  };
  let modelContext = JSON.stringify(contextBody);
  while (Buffer.byteLength(modelContext) > budget.maximumPremiumContextBytes && contextBody.summary.findings.length > 0) {
    contextBody.summary.findings.pop();
    modelContext = JSON.stringify(contextBody);
  }
  if (Buffer.byteLength(modelContext) > budget.maximumPremiumContextBytes) {
    const compact = {
      type: "ToolEvidenceSummary",
      receipt: receipt.id,
      phase: receipt.phase,
      tool: receipt.tool,
      outputBytes: measuredOutputBytes,
      truncated: receipt.premiumContext.truncated,
      classifications: receipt.summary.classifications,
      findings: [],
    };
    while (compact.findings.length < receipt.summary.findings.length) {
      const candidate = { ...compact, findings: [...compact.findings, receipt.summary.findings[compact.findings.length]] };
      if (Buffer.byteLength(JSON.stringify(candidate)) > budget.maximumPremiumContextBytes) break;
      compact.findings.push(receipt.summary.findings[compact.findings.length]);
    }
    modelContext = JSON.stringify(compact);
  }
  if (Buffer.byteLength(modelContext) > budget.maximumPremiumContextBytes) throw new Error("decision-relevant tool evidence exceeds the premium-context budget");
  appendObservation({
    type: "ToolEvidenceObserved", actor: ACTOR, receipt: receipt.id, phase: receipt.phase, tool: receipt.tool,
    provider: receipt.provider, model: receipt.model, toolUseId: input?.tool_use_id ?? null,
    inputBytes: argumentBytes, toolOutputBytes: measuredOutputBytes, premiumContextBytes: Buffer.byteLength(modelContext),
    truncated: receipt.premiumContext.truncated, cacheReused: reusedReceipt || reusedRaw,
    result: receipt.output.ni, receiptAddress: receiptPath, observedAt: options.observedAt ?? new Date().toISOString(),
  }, options);
  return Object.freeze({ receipt, receiptPath, modelContext, reused: reusedReceipt || reusedRaw });
}

export function recordToolBudget(input, budget, options = {}) {
  return appendObservation({
    type: "ToolBoundaryBudgetDeclared", actor: ACTOR, sessionFace: input?.session_id ?? null, turn: input?.turn_id ?? null,
    toolUseId: input?.tool_use_id ?? null, tool: String(input?.tool_name ?? "unknown"), model: input?.model ?? null,
    budget, observedAt: options.observedAt ?? new Date().toISOString(),
  }, options).record;
}

export function readToolEvidence(input, options = {}) {
  const receiptId = String(input?.receipt ?? "");
  semanticFileKey(receiptId);
  const receiptPath = join(evidenceRoot(options), "receipts", `${semanticFileKey(receiptId)}.json`);
  if (!existsSync(receiptPath)) throw new TypeError("tool evidence receipt is unavailable");
  const receipt = JSON.parse(readFileSync(receiptPath, "utf8"));
  const { id: _id, ...receiptBody } = receipt;
  if (identity(receiptBody) !== receiptId) throw new TypeError("tool evidence receipt identity mismatch");
  const offset = integer(input?.offset, 0, 0, Number.MAX_SAFE_INTEGER);
  const maximumBytes = integer(input?.maximumBytes, 8192, 1, 16_384);
  const carriers = Array.isArray(receipt.output.carriers) ? receipt.output.carriers : [{ stream: "result", carrier: receipt.output.carrier, digest: receipt.output.digest, bytes: receipt.output.quantity.amount }];
  const selected = input?.stream ? carriers.find((item, index) => item.stream === input.stream || String(index) === String(input.stream)) : carriers[0];
  if (!selected?.carrier) throw new TypeError("requested tool evidence carrier is unavailable");
  const rawRoot = resolve(evidenceRoot(options), "raw"), rawPath = resolve(selected.carrier);
  if (rawPath !== rawRoot && !rawPath.startsWith(`${rawRoot}/`)) throw new TypeError("tool evidence carrier escapes the evidence store");
  const size = statSync(rawPath).size, length = Math.max(0, Math.min(maximumBytes, size - offset)), bytes = Buffer.alloc(length);
  const descriptor = openSync(rawPath, "r");
  try { if (length) readSync(descriptor, bytes, 0, length, offset); } finally { closeSync(descriptor); }
  return Object.freeze({
    type: "ToolEvidencePage", receipt: receipt.id, result: receipt.output.ni, offset, returnedBytes: bytes.length,
    totalBytes: size, nextOffset: offset + bytes.length < size ? offset + bytes.length : null,
    stream: selected.stream ?? null, availableCarriers: carriers.map((item, index) => ({ stream: item.stream ?? String(index), bytes: item.bytes ?? null, digest: item.digest ?? null })),
    encoding: "base64", content: bytes.toString("base64"), carrier: rawPath,
  });
}

export function compileNetworkToolEvidence(request, options = {}) {
  if (request?.provider !== ACTOR) throw new TypeError("Codex enterprise provider address is required");
  if (typeof request.raw !== "string") throw new TypeError("raw evidence must be a string");
  const maximum = integer(request.maximumRawBytes, 8_388_608, 1024, 16_777_216);
  if (Buffer.byteLength(request.raw) > maximum) throw new TypeError("raw evidence exceeds the declared network boundary");
  return compileToolEvidence({
    tool_name: request.tool ?? "network-supplied-evidence",
    tool_input: request.input ?? {}, tool_response: request.raw,
    model: request.model ?? null, tool_use_id: request.operation ?? null,
  }, { ...options, provider: request.sourceProvider ?? "network-caller", budget: { ...DEFAULT_TOOL_BOUNDARY_BUDGET, phase: request.phase ?? "context-discovery" } });
}
