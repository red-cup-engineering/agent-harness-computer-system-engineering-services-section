/**
 * The work rail's Codex carrier: the carrier contract (agent-harness `carrier/agency-carrier.mjs`)
 * in the Codex dialect. A ready office duty allocated to the Codex character is done by one Codex
 * session on this machine; the session's artifacts are the codex node's, in the node's root
 * (`dataRoot`). Codex sandboxes the session itself: an execution may write its workspace, a
 * receiving act only reads, and the node's MetroPlat server is required to start.
 */
import { agencyWorkCarrier, agencyWorkSuit } from "../../../src/carrier/agency-carrier.mjs";
import { carrierWorkspaces } from "../../../src/carrier/workspace.mjs";
import { codexDialect } from "./codex-exec.mjs";

/** The suit a Codex session wears for one duty. */
export const codexWorkSuit = (item, options) => agencyWorkSuit(item, { ...options, dialect: codexDialect, mcpServer: options.metroplatServer });

/** The worktree of each act of the work rail's Codex carrier: an execution works in a worktree of its
 *  own (its change is committed and named a candidate to the merge queue, then the tree is removed, or
 *  kept when the act failed), a receiving act reads in one of its own. Opening fails closed: the act
 *  fails and nothing runs in `repository`, the shared checkout. */
export const codexWorkspaces = ({ repository, repositoryOf, commandRunner, bindGit, publishSourceCandidate, sourcePreparationOf, environment = process.env }) => carrierWorkspaces(codexDialect, { repository, repositoryOf, commandRunner, bindGit, publishSourceCandidate, sourcePreparationOf, environment, effectsOf: spec => spec.receiving || repositoryOf?.(spec)?.mode === "no-source" ? "read-only" : "repository-write" });

/** `executeAgencyWork(item)` for a node whose Codex character is `workerId`. `cwd` is the repository the
 *  acts' worktrees borrow from; no act runs in it. */
export function codexAgencyWorkProvider({ metroplatServer, codex, sandbox = "workspace-write", cwd, repositoryOf, commandRunner, bindGit, publishSourceCandidate, sourcePreparationOf, systemRunner, environment, ...options }) {
  return agencyWorkCarrier({
    ...options, cwd, workspaceOf: codexWorkspaces({ repository: cwd, repositoryOf, commandRunner, bindGit, publishSourceCandidate, sourcePreparationOf, ...(environment === undefined ? {} : { environment }) }),
    dialect: codexDialect, mcpServer: metroplatServer, ...(codex === undefined ? {} : { executable: codex }),
    sessionOptions: ({ item, receiving }) => ({ sandbox: receiving || repositoryOf?.({ item, receiving })?.mode === "no-source" ? "read-only" : sandbox, ...(systemRunner === undefined ? {} : { systemRunner }), ...(metroplatServer === undefined ? {} : { requiredMcpServer: metroplatServer }) }),
  });
}
