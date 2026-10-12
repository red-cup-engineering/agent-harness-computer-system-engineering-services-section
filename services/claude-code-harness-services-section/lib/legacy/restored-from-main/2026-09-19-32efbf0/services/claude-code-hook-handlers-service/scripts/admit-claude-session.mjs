#!/usr/bin/env node
// Stop: admits one Claude Code session to the work rail through MetroPlat's
// own `claude-session-admit` and `agent-session-token-usage-admit` verbs, and
// journals one receipt naming both results.
//
// The admission runs inside the hook, under the timeout its policy declares.
// It used to run in a detached, unreffed child of this script so the hook
// returned at once; that mechanism reached `node:child_process` directly and
// the capability registry has no effect owner for a detached background
// process, so it was dropped rather than smuggled. A rail that is slow or
// down now costs this hook its timeout and the admission, never the session.
//
// Every machine-specific value comes from the machine's own
// AgentHarnessPolicy, found through the AGENT_HARNESS_POLICY environment
// variable: the admitting actor is the policy's, and the receipt journal's
// custody root is the harness section the policy itself sits in.
import { CONTINUE } from "@red-cup-engineering/agent-lifecycle-hook-service";
import { processStreams, runAgentLifecycleHook } from "@red-cup-engineering/agent-lifecycle-hook-service/run-agent-lifecycle-hook";
import { resolveWorkRail } from "@red-cup-engineering/agent-work-computer-system-engineering-services-section/work-rail";
import { confinePath, toPosixPath } from "@red-cup-engineering/filepath-services-section";
import { argument } from "@red-cup-engineering/javascript-node-services-section/argv";
import { createSemanticRecordJournal } from "@red-cup-engineering/semantic-record-journal-service";
import { readMachineParameters, repositoryRootOf } from "./machine-parameters.mjs";

/**
 * The session id a transcript carrier names: its own basename without the
 * journal-line suffix.
 *
 * @param {string} transcriptPath
 * @returns {string}
 */
export function sessionIdOfTranscript(transcriptPath) {
  const name = toPosixPath(transcriptPath).split("/").at(-1) ?? "";
  return name.endsWith(".jsonl") ? name.slice(0, -".jsonl".length) : name;
}

export const OBJECT_KIND_SUFFIX = "session-admission";

/**
 * Admits one session and its token usage on the rail, then journals one receipt.
 * @param {object} options
 * @param {string} options.transcriptPath
 * @param {string} [options.sessionId] - defaults to the transcript basename.
 * @param {string} options.actor - the admitting actor, from the machine's own harness policy.
 * @param {string} options.journalRoot - the receipt journal's custody root.
 * @param {string} [options.objectKind] - defaults to `<policy owner>.session-admission`.
 * @param {ReturnType<typeof resolveWorkRail>} [options.work] - the rail; defaults to production.
 * @param {(verb: string, input: object) => unknown|Promise<unknown>} [options.runVerb] - overrides the rail's call (tests).
 * @param {() => Date} [options.now]
 * @returns {Promise<{root: string, id: string, sessionAdmission: unknown, tokenUsageAdmission: unknown}>}
 * @throws {Error} when `transcriptPath` is missing, or either verb refuses.
 */
export async function admitClaudeSession({ transcriptPath, sessionId, actor, journalRoot, objectKind, work, runVerb, now = () => new Date() } = {}) {
  if (typeof transcriptPath !== "string" || transcriptPath.trim() === "") throw new Error("admit-claude-session: names no transcriptPath");
  if (typeof actor !== "string" || actor.trim() === "") throw new Error("admit-claude-session: an admitting actor is required (from the harness policy)");
  if (typeof journalRoot !== "string" || journalRoot.trim() === "") throw new Error("admit-claude-session: a journal custody root is required (--journal-root)");
  const kind = objectKind ?? `agent-harness.${OBJECT_KIND_SUFFIX}`;
  const resolvedSessionId = sessionId ?? sessionIdOfTranscript(transcriptPath);
  const call = runVerb ?? (work ?? resolveWorkRail()).call;

  const sessionAdmission = await call("claude-session-admit", { sessionId: resolvedSessionId });
  const tokenUsageAdmission = await call("agent-session-token-usage-admit", { provider: "claude", sessionId: resolvedSessionId });
  // The rail's token-usage verb discovers transcripts from the rail host's
  // own session roots. A session whose transcript lives only on this machine
  // comes back with zero turns; that reading is the rail's blindness, never
  // this session's usage, so it is recorded as unseen rather than as zero.
  const usageSeenByRail = usageTurnsOf(tokenUsageAdmission) > 0;

  const recordedAt = now().toISOString();
  const journal = createSemanticRecordJournal({ root: confinePath({ root: journalRoot }).path, objectKind: kind });
  const result = journal.record({
    category: "metroplat.session-admit",
    recordedAt,
    record: {
      type: "ClaudeSessionRailAdmission",
      actor,
      sessionId: resolvedSessionId,
      transcriptPath,
      sessionAdmission,
      tokenUsageAdmission,
      usageSeenByRail,
    },
    charge: { support: true, refutation: !usageSeenByRail },
  });
  return Object.freeze({ root: journal.root, id: result.id, sessionAdmission, tokenUsageAdmission, usageSeenByRail });
}

/**
 * The turn count a token-usage admission reports, wherever the verb's
 * result shape puts it; 0 when it reports none.
 * @param {unknown} admission
 * @returns {number}
 */
export function usageTurnsOf(admission) {
  if (admission === null || typeof admission !== "object") return 0;
  const candidates = [admission.turns, admission.summary?.turns, admission.usage?.turns, admission.readout?.turns];
  for (const value of candidates) if (typeof value === "number" && Number.isFinite(value)) return value;
  return 0;
}

/**
 * Rules on one Stop event: the session is admitted to the rail and the
 * receipt journalled; nothing is added to the session and nothing blocked.
 *
 * @param {object} event - one AgentLifecycleEvent.
 * @param {object} options - the admission parameters (see {@link admitClaudeSession}).
 * @returns {Promise<object>} an AgentLifecycleResponse.
 * @throws {Error} when the event names no transcript.
 */
export async function admitClaudeSessionOnStop(event, { admit = admitClaudeSession, ...options } = {}) {
  const transcriptPath = event?.session?.transcriptPath;
  if (typeof transcriptPath !== "string" || transcriptPath.trim() === "") {
    throw new Error("admit-claude-session: the lifecycle event names no transcript path");
  }
  await admit({ transcriptPath, sessionId: sessionIdOfTranscript(transcriptPath), ...options });
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
      let work = null;
      try {
        work = resolveWorkRail();
        return await admitClaudeSessionOnStop(event, {
          actor: machine.actor,
          journalRoot: argument("--journal-root", streams.arguments) ?? machine.journalRoot,
          ...(objectKind === undefined ? {} : { objectKind }),
          work,
        });
      } finally {
        await work?.close();
      }
    },
    streams,
  });
  process.exitCode = result.exitCode;
}
