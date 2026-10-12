import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { ACTOR, TERRITORY, appendObservation, identity, readTrajectory } from "./enterprise.mjs";
import { codexEnterpriseConfiguration } from "./configuration.mjs";

const STAGES = new Set(["analyze", "plan"]);
const ARTIFACTS = new Set(["data-table", "json", "code", "report"]);
// Where the NotebookLM supplier deposits its exchanges, and the schema
// namespace this enterprise admits JSON results under: both are facts about
// the territory this enterprise trades in, so both come from its
// configuration rather than from a walk up this package's own path.
const configuration = codexEnterpriseConfiguration();
const EXCHANGE_ROOT = resolve(TERRITORY, configuration.notebookExchangeRoot);
const RESULT_SCHEMA_NAMESPACE = configuration.resultSchemaNamespace;

function text(value, label) { if (typeof value !== "string" || value.trim() === "") throw new TypeError(`${label} is required`); return value.trim(); }
function positive(value, label) { if (!Number.isSafeInteger(value) || value < 1) throw new TypeError(`${label} must be a positive integer`); return value; }
function cycle(cycleId, options) { const found = readTrajectory(options).find((row) => row.type === "PromptMapeCycleStarted" && row.cycle === cycleId); if (!found) throw new TypeError("known prompt MAPE cycle is required"); return found; }

export function openNotebookResearchJob(input, options = {}) {
  const cycleId = text(input?.cycle, "cycle"); cycle(cycleId, options);
  const stage = text(input?.stage, "stage"); if (!STAGES.has(stage)) throw new TypeError("research job stage must be analyze or plan");
  const artifactType = input?.artifactType ?? "data-table"; if (!ARTIFACTS.has(artifactType)) throw new TypeError("unsupported NotebookLM artifact type");
  const resultSchema = input?.resultSchema ?? null;
  if (artifactType === "json" && (!resultSchema || !resultSchema.startsWith(RESULT_SCHEMA_NAMESPACE))) throw new TypeError("JSON research jobs require an admitted resultSchema");
  if (artifactType !== "json" && resultSchema !== null) throw new TypeError("resultSchema is valid only for JSON research jobs");
  const body = { type: "NotebookResearchJobOpened", actor: ACTOR, cycle: cycleId, stage, match: text(input.match, "match"), question: text(input.question, "question"), artifactType, resultSchema, sourceLimit: positive(input.sourceLimit ?? 12, "sourceLimit"), requestedBy: text(input.requestedBy ?? ACTOR, "requestedBy"), observedAt: text(input.observedAt, "observedAt") };
  return appendObservation(body, options).record;
}

export function notebookResearchJobBoard(options = {}) {
  const rows = readTrajectory(options);
  const settled = new Map(rows.filter((row) => row.type === "NotebookResearchJobSettled").map((row) => [row.job, row]));
  return Object.freeze(rows.filter((row) => row.type === "NotebookResearchJobOpened").map((job) => Object.freeze({ ...job, state: settled.has(job.id) ? settled.get(job.id).outcome : "queued", settlement: settled.get(job.id) ?? null })).sort((a, b) => String(b.observedAt).localeCompare(String(a.observedAt))));
}

export function settleNotebookResearchJob(input, options = {}) {
  const job = notebookResearchJobBoard(options).find((row) => row.id === text(input?.job, "job"));
  if (!job) throw new TypeError("known notebook research job is required");
  if (job.state !== "queued") return job.settlement;
  const exchangePath = resolve(text(input.exchangePath, "exchangePath"));
  if (!exchangePath.startsWith(`${EXCHANGE_ROOT}/`) || !existsSync(exchangePath)) throw new TypeError("exchangePath must be a seated NotebookLM exchange record");
  const exchange = JSON.parse(readFileSync(exchangePath, "utf8"));
  if (!["artifact", "refusal"].includes(exchange.outcome)) throw new TypeError("NotebookLM exchange has no settled outcome");
  const body = { type: "NotebookResearchJobSettled", actor: ACTOR, cycle: job.cycle, job: job.id, stage: job.stage, outcome: exchange.outcome, exchange: identity(exchange), exchangePath, artifact: exchange.artifact?.path ?? null, refusal: exchange.refusal?.unmet ?? null, observedAt: text(input.observedAt, "observedAt") };
  return appendObservation(body, options).record;
}
