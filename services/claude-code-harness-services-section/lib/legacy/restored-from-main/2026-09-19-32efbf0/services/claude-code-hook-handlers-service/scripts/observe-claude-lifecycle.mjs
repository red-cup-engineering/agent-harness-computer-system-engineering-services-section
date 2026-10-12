#!/usr/bin/env node
// Every lifecycle event this harness is wired for, recorded as one charged
// semantic record chained to the session's prior spine row: SessionStart is
// the chain root, each UserPromptSubmit and Stop follows the session's prior
// spine row, and a SubagentStop both follows its turn's UserPromptSubmit and
// commissions a provider on the harness lifecycle journal.
//
// Nothing of the session's content is retained: identities, prompts, and
// transcript paths are digested, never stored. Every machine-specific value
// comes from the machine's own AgentHarnessPolicy, found through the
// AGENT_HARNESS_POLICY environment variable: the observing actor is the
// policy's, and the journal custody root is the harness section the policy
// itself sits in. `--policy`, `--journal-root` and `--object-kind` remain as
// overrides only, for a caller that is not the wired hook.
import { createHash } from "node:crypto";
import { CONTINUE } from "@red-cup-engineering/agent-lifecycle-hook-service";
import { processStreams, runAgentLifecycleHook } from "@red-cup-engineering/agent-lifecycle-hook-service/run-agent-lifecycle-hook";
import { confinePath } from "@red-cup-engineering/filepath-services-section";
import { recordProviderCommission } from "@red-cup-engineering/harness-lifecycle-journal-service";
import { argument } from "@red-cup-engineering/javascript-node-services-section/argv";
import { readMachineParameters, repositoryRootOf } from "./machine-parameters.mjs";
import { termToJson } from "@red-cup-engineering/relation-model-notation-json-codec";
import { EMPTY_WITNESS_ROOT, identifyJsonSemanticContent } from "@red-cup-engineering/semantic-content-identify-service";
import { createSemanticRecordJournal } from "@red-cup-engineering/semantic-record-journal-service";
import { readSeavt } from "@red-cup-engineering/witness-journal-log-service";

const OBSERVED_EVENTS = new Set(["SessionStart", "UserPromptSubmit", "Stop", "SubagentStop"]);
const START_SOURCES = new Set(["startup", "resume", "clear", "compact", "fork"]);
export const DEFAULT_OBJECT_KIND = "agent-harness.lifecycle-observation";
// Feed name is the semantic-record-journal-service's own dated content
// partition (`<root>/data/logs/YYYY/MM/DD/<this>.jsonl`) -- not exported by
// that package, but stable across the corpus's existing content.
const CONTENT_FEED = "witness-journal-seavt";
// The turn-chain spine. SubagentStop rows are excluded so a subagent event
// never displaces the turn a Stop should chain to.
const TURN_CHAIN_CATEGORIES = new Set(["lifecycle.SessionStart", "lifecycle.UserPromptSubmit", "lifecycle.Stop"]);
const DAY_MS = 24 * 60 * 60 * 1000;

function digest(value) {
  return typeof value === "string" && value !== "" ? `sha256:${createHash("sha256").update(value).digest("hex")}` : null;
}

/**
 * Finds the most recent lifecycle content-feed row for a session, reading only
 * today's and yesterday's dated journal partitions (per `now`) instead of
 * scanning the whole journal.
 *
 * @param {object} options
 * @param {string} options.root - journal custody root.
 * @param {string|null} options.sessionDigest - the digested session id to match.
 * @param {() => Date} options.now - clock, so tests can pin "today".
 * @param {(category: string) => boolean} options.admit - row-category filter.
 * @returns {{id: string, occurredAt: string}|null} the latest matching row, or null.
 */
function latestSessionRecord({ root, sessionDigest, now, admit }) {
  const today = now();
  const yesterday = new Date(today.getTime() - DAY_MS);
  const rows = [...readSeavt(root, CONTENT_FEED, today.toISOString()), ...readSeavt(root, CONTENT_FEED, yesterday.toISOString())];
  let latest = null;
  for (const { entry: row } of rows) {
    const category = termToJson(row.a), value = termToJson(row.v), id = termToJson(row.e);
    if (!admit(category) || value?.sessionDigest !== sessionDigest || typeof id !== "string") continue;
    if (latest === null || row.t > latest.occurredAt) latest = { id, occurredAt: row.t };
  }
  return latest;
}

/** The content address this observation will settle to, so it can be named as a relation subject before the write. */
function selfIdentity(objectKind, value) {
  return identifyJsonSemanticContent({ objectKind, value, witnessRoot: EMPTY_WITNESS_ROOT }).id;
}

/**
 * Records one lifecycle observation and returns its receipt.
 *
 * @param {object} options
 * @param {object} options.event - one AgentLifecycleEvent.
 * @param {string} options.actor - the observing actor's constituted address.
 * @param {string} options.journalRoot - the journal custody root observations are written under.
 * @param {string} [options.objectKind] - defaults to {@link DEFAULT_OBJECT_KIND}.
 * @param {string} [options.projectRoot] - the workspace root; defaults to CLAUDE_PROJECT_DIR or the event's cwd.
 * @param {() => Date} [options.now]
 * @returns {object} a frozen receipt naming the journal root, record id, observation, relation, and any commission.
 * @throws {Error} when a required parameter is absent, or a SubagentStop has no turn to follow.
 */
export function observeLifecycle({ event, actor, journalRoot, objectKind = DEFAULT_OBJECT_KIND, projectRoot, now = () => new Date() }) {
  if (typeof actor !== "string" || !/^actor:[A-Za-z0-9_-]+$/u.test(actor)) throw new Error("observe-claude-lifecycle: a constituted actor address is required (--policy)");
  if (typeof journalRoot !== "string" || journalRoot === "") throw new Error("observe-claude-lifecycle: a journal custody root is required (--journal-root)");
  if (!OBSERVED_EVENTS.has(event.event)) throw new Error(`unsupported observed lifecycle event '${event.event}'`);
  const rootInput = projectRoot ?? process.env.CLAUDE_PROJECT_DIR ?? event.session?.cwd;
  if (typeof rootInput !== "string" || rootInput.trim() === "") throw new Error("lifecycle event names no project root");
  const root = confinePath({ root: rootInput }).path;
  const custodyRoot = confinePath({ root: journalRoot }).path;
  const recordedAt = now().toISOString();
  const sessionDigest = digest(event.session?.id);
  const promptDigest = event.event === "UserPromptSubmit" ? digest(event.prompt) : null;
  const transcriptDigest = event.event === "Stop" || event.event === "SubagentStop" ? digest(event.session?.transcriptPath) : null;
  const observation = {
    type: "ClaudeLifecycleObservation",
    version: 2,
    actor,
    event: event.event,
    occurredAt: recordedAt,
    sessionDigest,
    workspaceDigest: digest(root),
    ...(promptDigest !== null ? { promptDigest } : {}),
    ...(transcriptDigest !== null ? { transcriptDigest } : {}),
    ...(event.event === "SessionStart" && START_SOURCES.has(event.source) ? { source: event.source } : {}),
  };

  let turn = null;
  if (event.event === "SubagentStop") {
    turn = latestSessionRecord({ root: custodyRoot, sessionDigest, now, admit: (category) => category === "lifecycle.UserPromptSubmit" });
    if (!turn) throw new Error("SubagentStop observed with no UserPromptSubmit record for this session in the last two days");
  }

  let relation;
  if (event.event === "SubagentStop") {
    relation = { subject: selfIdentity(objectKind, observation), predicate: "follows", object: turn.id };
  } else if (event.event === "UserPromptSubmit" || event.event === "Stop") {
    const previous = latestSessionRecord({ root: custodyRoot, sessionDigest, now, admit: (category) => TURN_CHAIN_CATEGORIES.has(category) });
    if (previous) relation = { subject: selfIdentity(objectKind, observation), predicate: "follows", object: previous.id };
  }

  const journal = createSemanticRecordJournal({ root: custodyRoot, objectKind });
  const result = journal.record({
    category: `lifecycle.${event.event}`,
    recordedAt,
    record: observation,
    charge: { support: true, refutation: false },
    ...(relation ? { relation } : {}),
  });

  let commission = null;
  if (event.event === "SubagentStop") {
    const commissionResult = recordProviderCommission({
      root: custodyRoot,
      actor,
      turnId: turn.id,
      agent: "claude-subagent",
      task: transcriptDigest,
      recordedAt,
    });
    commission = Object.freeze({ id: commissionResult.id, turnId: turn.id });
  }

  return Object.freeze({
    root: journal.root,
    id: result.id,
    observation,
    relation: relation ? Object.freeze({ ...relation }) : null,
    ...(commission ? { commission } : {}),
  });
}

/**
 * Rules on one lifecycle event: record the observation, add nothing, block
 * nothing.
 *
 * @param {object} event - one AgentLifecycleEvent.
 * @param {object} options - the observation parameters (see {@link observeLifecycle}).
 * @returns {object} an AgentLifecycleResponse.
 */
export function observeClaudeLifecycle(event, options = {}) {
  observeLifecycle({ event, ...options });
  return CONTINUE;
}

if (import.meta.main) {
  const streams = processStreams();
  const result = await runAgentLifecycleHook({
    handler: async (event) => {
      const root = repositoryRootOf(event, { root: argument("--root", streams.arguments) });
      if (root === undefined) throw new Error("no repository root: the lifecycle event names no working directory");
      const machine = await readMachineParameters({ root, policyPath: argument("--policy", streams.arguments) });
      const objectKind = argument("--object-kind", streams.arguments);
      return observeClaudeLifecycle(event, {
        actor: machine.actor,
        journalRoot: argument("--journal-root", streams.arguments) ?? machine.journalRoot,
        ...(objectKind === undefined ? {} : { objectKind }),
      });
    },
    streams,
  });
  process.exitCode = result.exitCode;
}
