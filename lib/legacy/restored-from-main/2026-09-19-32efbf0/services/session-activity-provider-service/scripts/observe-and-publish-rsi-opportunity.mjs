#!/usr/bin/env node
// One contracted clockkeeper pulse advances this sensor: it measures the
// window since its last tick for one session-transcript dialect and, when a
// premium self-execution opportunity is measured, publishes it to the
// customer's improvement board. Which dialect, which policy record, and which
// board are all explicit parameters:
//
//   observe-and-publish-rsi-opportunity --policy <record> [--dialect codex|claude]
import { isMain } from "@red-cup-engineering/javascript-file-main-guard-service";
import { executeJavascriptNodeCommand } from "@red-cup-engineering/execute-javascript-node-command-service";
import { readJavascriptNodeStandardInputText } from "@red-cup-engineering/read-javascript-node-standard-input-text-service";
import { createSettlementStore } from "@red-cup-engineering/settlement-record-store-service";
import { claudeSessionTranscriptDialect } from "@red-cup-engineering/session-transcript-dialects/claude-dialect";
import { codexSessionTranscriptDialect } from "@red-cup-engineering/session-transcript-dialects/codex-dialect";
import { ACTOR, CONTEXT, inspectBoardBoundary, loadPolicy, measureSessionWindow, record, selectOpportunity } from "../src/session-rsi-sensor.mjs";

const DIALECTS = Object.freeze({ codex: codexSessionTranscriptDialect, claude: claudeSessionTranscriptDialect });

function argumentValue(name, argv) {
  const index = argv.indexOf(name);
  if (index === -1) return undefined;
  const value = argv[index + 1];
  if (typeof value !== "string" || value.startsWith("--")) throw new TypeError(`${name} requires one value`);
  return value;
}
export function selectedDialect(name) {
  const dialect = DIALECTS[name ?? "codex"];
  if (!dialect) throw new TypeError(`unknown session-transcript dialect ${name}; expected one of ${Object.keys(DIALECTS).join(", ")}`);
  return dialect;
}

const CATEGORY = "ni:///sha-256;Vy8ofltNXRqQ2tDGGNV2hcTt3TkExTkpQsysWjDentM.sensor-history";
function response(type, source, object) { return record({ "@context": CONTEXT, type, actor: ACTOR, target: source?.actor ?? null, inReplyTo: source?.id ?? null, object: { ...object, customerTerritoryMutation: false } }); }
function pulseProblem(activity, policy) { return activity?.["@context"] !== CONTEXT || activity.type !== "Create" || activity.actor !== policy.clockActor || activity.target !== ACTOR || activity.capability !== policy.deliveryCapabilityId || activity.object?.type !== "SessionRsiSensorPulse" || !/#([0-9]+)$/u.test(activity.object.pulseId ?? "") ? "exact-contracted-clockkeeper-pulse-required" : null; }
function defaultLedger(policy, options = {}) { const settlement = createSettlementStore({ settlementRoot: policy.settlementRoot, agentUrl: options.agentUrl ?? process.env.WITNESS_JOURNAL_RDF_AGENT }); return { read: () => settlement.records(CATEGORY), append: (value, at) => settlement.record({ category: CATEGORY, recordedAt: at, record: value }) }; }
export function memoryLedger(seed = []) { const rows = [...seed]; return { read: () => [...rows], append: async (value) => { rows.push(value); return value; } }; }
// executeJavascriptNodeCommand carries no timeout: it is a thin, exact
// spawnSync boundary. The prior 60s timeout guard against a hung board
// ingress process has no equivalent in that owner's admitted request shape
// (arguments,command,directory,environment,input only) and is not restored
// here, since restoring it would mean reimplementing spawn timeout handling
// outside the owner -- exactly the wrapper this migration forbids.
export function invokeBoard(board, activity) {
  const boundary = inspectBoardBoundary(board);
  const environment = Object.fromEntries(["WITNESS_JOURNAL_RDF_AGENT", "IMPROVEMENT_BOARD_SETTLEMENT", "IMPROVEMENT_BOARD_DATA_ROOT"].flatMap((name) => process.env[name] === undefined ? [] : [[name, process.env[name]]]));
  const receipt = executeJavascriptNodeCommand({
    type: "JavascriptNodeCommandExecutionRequest",
    version: 1,
    command: process.execPath,
    arguments: [boundary.entry, "--operation", board.submitOperation],
    directory: boundary.root,
    environment,
    input: JSON.stringify(activity),
  });
  let output;
  try { output = JSON.parse(receipt.result.stdout); } catch { throw new Error(`board ingress returned no typed JSON: ${String(receipt.result.stderr).slice(-1000)}`); }
  return output;
}

export async function advanceSensor(activity, options = {}) {
  const policy = options.policy ?? loadPolicy(options.policyPath), dialect = options.dialect ?? selectedDialect(options.dialectName), at = options.recordedAt ?? new Date().toISOString(), problem = pulseProblem(activity, policy);
  if (problem) return response("Reject", activity, { type: "SessionRsiSensorRefusal", reason: problem, customerMutation: false });
  const ledger = options.ledger ?? defaultLedger(policy, options), prior = ledger.read().filter((item) => item.type === "SessionRsiSensorTick").sort((left, right) => left.toInclusive.localeCompare(right.toInclusive)).at(-1);
  const fromExclusive = prior?.toInclusive ?? new Date(Date.parse(at) - policy.initialLookbackSeconds * 1000).toISOString();
  let measurements; try { measurements = (options.measure ?? measureSessionWindow)(dialect, { sessionRoot: policy.sessionRoot, fromExclusive, toInclusive: at, premiumModels: policy.premiumModels }); } catch (error) { return response("Reject", activity, { type: "SessionRsiSensorRefusal", reason: error.message, customerMutation: false }); }
  const opportunity = selectOpportunity(measurements, policy, at); let boardReceipt = null, disposition = "quiet";
  if (opportunity) {
    const publication = record({ "@context": CONTEXT, type: "Create", actor: ACTOR, target: policy.board.actor, object: opportunity });
    try { boardReceipt = await (options.publish ?? invokeBoard)(policy.board, publication); disposition = boardReceipt?.type === "Accept" ? "published" : "customer-refused"; }
    catch (error) { disposition = "transport-residue"; boardReceipt = { type: "TransportResidue", reason: error.message }; }
  }
  const tick = record({ type: "SessionRsiSensorTick", pulse: activity.id, fromExclusive, toInclusive: at, measuredSessions: measurements.length, selectedOpportunity: opportunity?.id ?? null, disposition, boardReceipt: boardReceipt?.id ?? null, transcriptDisclosed: false, inferenceCalls: 0, customerMutation: false }); await ledger.append(tick, at);
  return response("Accept", activity, { type: "SessionRsiSensorTickReceipt", tick: tick.id, fromExclusive, toInclusive: at, measuredSessions: measurements.length, opportunity: opportunity?.id ?? null, disposition, boardReceipt, nextTickRequired: true, transcriptDisclosed: false, inferenceCalls: 0, customerMutation: false });
}

if (isMain(import.meta.url)) { try { const argv = process.argv.slice(2); const { text } = await readJavascriptNodeStandardInputText({ type: "JavascriptNodeStandardInputTextReadRequest", version: 1 }, { standardInput: process.stdin }); const input = JSON.parse(text);
  process.stdout.write(`${JSON.stringify(await advanceSensor(input, { policyPath: argumentValue("--policy", argv), dialectName: argumentValue("--dialect", argv) }), null, 2)}\n`); } catch (error) { process.stderr.write(`${error.stack ?? error.message}\n`); process.exitCode = 1; } }
