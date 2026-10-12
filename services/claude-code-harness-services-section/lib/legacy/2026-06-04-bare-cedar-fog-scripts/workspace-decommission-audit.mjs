#!/usr/bin/env node
/**
 * Hook adapter: surface non-decommissioned packages importing decommissioned
 * workspace packages as cockpit context.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const MODULE_PATH = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(MODULE_PATH), "../../..");
const JSNODE_ICK_CLI = path.join(REPO_ROOT, "apps", "jsnode-ick", "dist", "cli.mjs");

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}

function payloadFromText(text) {
  const trimmed = text.trim();
  if (!trimmed.startsWith("{")) return {};
  try {
    const parsed = JSON.parse(trimmed);
    return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function hookEventName(payload) {
  const value = payload.hook_event_name ?? payload.hookEventName;
  return typeof value === "string" && value.trim() !== "" ? value : "UserPromptSubmit";
}

function textForReport(report) {
  const lines = [
    "# Workspace Decommission Audit",
    "",
    report.violationCount === 0
      ? `No non-decommissioned package imports the ${report.decommissionedPackages.length} decommissioned package(s).`
      : `${report.violationCount} import violation(s): non-decommissioned packages are importing decommissioned packages.`,
  ];
  for (const violation of report.violations.slice(0, 8)) {
    const symbol = violation.name === undefined ? violation.mode : `${violation.mode}:${violation.name}`;
    lines.push(`- ${violation.consumer} imports ${symbol} from ${violation.provider} in ${violation.file}`);
  }
  if (report.violations.length > 8) {
    lines.push(`- ${report.violations.length - 8} more violation(s); run \`pnpm audit:decommissioned-imports\` for the full list.`);
  }
  return lines.join("\n");
}

async function auditContext() {
  const timeout = Number.parseInt(process.env.EMSENN_DEV_DECOMMISSION_AUDIT_TIMEOUT_MS ?? "8000", 10);
  const { stdout } = await execFileAsync(process.execPath, [JSNODE_ICK_CLI, "decommissioned-imports", "--root", REPO_ROOT], {
    cwd: REPO_ROOT,
    timeout: Number.isFinite(timeout) ? timeout : 8000,
    maxBuffer: 4 * 1024 * 1024,
  });
  const report = JSON.parse(stdout);
  return textForReport(report);
}

async function main() {
  const payload = payloadFromText(await readStdin());
  let additionalContext;
  try {
    additionalContext = await auditContext();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    additionalContext = [
      "# Workspace Decommission Audit",
      "",
      `Audit unavailable: ${message}`,
      "Run `pnpm --filter @emsenn/jsnode-ick build` and then `pnpm audit:decommissioned-imports`.",
    ].join("\n");
  }
  process.stdout.write(`${JSON.stringify({
    hookSpecificOutput: {
      hookEventName: hookEventName(payload),
      additionalContext,
    },
  })}\n`);
}

await main();
