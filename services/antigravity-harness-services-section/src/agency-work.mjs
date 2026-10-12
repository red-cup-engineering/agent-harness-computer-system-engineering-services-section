/**
 * The work rail's Antigravity carrier: the carrier contract (agent-harness
 * `carrier/agency-carrier.mjs`) in the Antigravity dialect, on the Google AI Pro subscription this
 * host is signed in to. A ready office duty allocated to an Antigravity character is done by one
 * headless `agy` session that returns its outcome under the work item's response constraint
 * (`--json-schema`), so a result is typed by the provider before the rail reads it.
 *
 * Effects follow the duty as in the Claude Code carrier: a duty whose method uses duty worktrees
 * writes, and then only inside its own task worktree (the runner commits it and names a candidate to
 * the merge queue); every other duty and every receiving act reads, in a read-only tree of its own.
 * No session runs in the repository's shared checkout. The runner's unit, whose working directory is
 * that task worktree, holds every session to that (the dialect's `confinement`).
 *
 * agy configures MCP servers and permissions per home, not per session: `home` is the carrier's own
 * (scripts/antigravity-carrier-home.mjs provisions it), so its MetroPlat client is its character's.
 */
import { agencyOutcomeSchema, agencyWorkCarrier, RECEIVING_JUDGEMENT_SCHEMA } from "../../../src/carrier/agency-carrier.mjs";
import { carrierWorkspaces } from "../../../src/carrier/workspace.mjs";
import { antigravityDialect } from "./antigravity-session.mjs";

/** The effects a duty needs from its session: writing where its method keeps duty worktrees. */
export const antigravityEffectsOf = (item) => (item.requiresCapabilities ?? []).some((verb) => typeof verb === "string" && verb.startsWith("duty-worktree-"))
  ? "workspace-write" : "read-only";

/** The task worktree of each act: opened for writing when the duty writes, read-only otherwise. */
export const antigravityWorkspaces = ({ repository, commandRunner, environment = process.env, retired = [] }) => carrierWorkspaces(antigravityDialect, {
  repository, commandRunner, environment, retired,
  effectsOf: ({ item, receiving }) => (receiving || antigravityEffectsOf(item) === "read-only" ? "read-only" : "repository-write"),
});

/** `executeAgencyWork(item)` for a node whose Antigravity character is admitted. `home` is its carrier
 *  home and `cwd` the repository each act's task worktree borrows from; no act runs in it. `retired`
 *  names shared roots (the former duty-worktrees root) pruned once. */
export function antigravityAgencyWorkProvider({ home, addDirs = [], agy, cwd, commandRunner, environment, retired, ...options }) {
  return agencyWorkCarrier({
    ...options, cwd, dialect: antigravityDialect, ...(agy === undefined ? {} : { executable: agy }),
    workspaceOf: antigravityWorkspaces({ repository: cwd, commandRunner, ...(environment === undefined ? {} : { environment }), ...(retired === undefined ? {} : { retired }) }),
    sessionOptions: ({ item, receiving }) => {
      const effects = receiving ? "read-only" : antigravityEffectsOf(item);
      return {
        effects, home,
        ...(addDirs.length === 0 ? {} : { addDirs }),
        outputSchema: receiving ? RECEIVING_JUDGEMENT_SCHEMA : agencyOutcomeSchema(item.returns),
      };
    },
  });
}
