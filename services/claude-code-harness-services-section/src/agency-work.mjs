/**
 * The work rail's Claude Code carrier: the carrier contract (agent-harness
 * `carrier/agency-carrier.mjs`) in the Claude Code dialect, on the subscription this host is
 * signed in to. A ready office duty allocated to the Claude character is done by one headless
 * session that wears the allocated office's own projection (`--agent`, the office record rendered
 * as installing-claude-as-an-agent renders it), reaches only this node's MetroPlat, and returns its
 * outcome under the work item's response constraint (`--json-schema`), so a result is typed by the
 * provider before the rail reads it.
 *
 * Effects follow the duty: a duty whose method uses duty worktrees writes, and then only inside
 * its own task worktree, whose change the runner commits and names a candidate to the merge queue;
 * every other duty and every receiving act reads, in a read-only tree of its own. No session runs
 * in the repository's shared checkout (carrier/workspace.mjs).
 */
import { resolve } from "@red-cup-engineering/organizing/agency";
import { readHarnessAgency } from "../../../src/agency-source.mjs";

import { agencyOutcomeSchema, agencyWorkCarrier, RECEIVING_JUDGEMENT_SCHEMA } from "../../../src/carrier/agency-carrier.mjs";
import { carrierWorkspaces } from "../../../src/carrier/workspace.mjs";
import { claudeCodeDialect } from "./claude-code-session.mjs";
import { projectOfficeAgent } from "./install-claude-as-an-agent.mjs";

/** The effects a duty needs from its session: writing where its method keeps duty worktrees. */
export const claudeEffectsOf = (item) => (item.requiresCapabilities ?? []).some((verb) => typeof verb === "string" && verb.startsWith("duty-worktree-"))
  ? "workspace-write" : "read-only";

/** An office as a Claude Code agent definition: the projection installing-claude-as-an-agent
 *  renders, as `{ name, description, prompt }`. `agency` is the registry the host reads offices
 *  from; the office is resolved there by id or key. */
export function officeAgentDefinition({ repoRoot, agencySections, environment, agency = readHarnessAgency(repoRoot, { agencySections, environment }), office }) {
  const record = resolve(agency, "offices", office);
  if (record === undefined) throw new TypeError(`Claude Code carrier: office ${office} is absent or ambiguous`);
  const { id, text } = projectOfficeAgent({ repoRoot, agency, office: record.key });
  const match = /^---\n([\s\S]*?)\n---\n\n?([\s\S]*)$/u.exec(text);
  if (match === null) throw new TypeError(`Claude Code carrier: the projection of ${office} has no frontmatter`);
  const description = /^description: (.*)$/mu.exec(match[1])?.[1];
  return Object.freeze({ name: id, description: description === undefined ? id : JSON.parse(description), prompt: match[2].trim() });
}

/** The task worktree of each act: opened for writing when the duty writes, read-only otherwise. */
export const claudeWorkspaces = ({ repository, repositoryOf, commandRunner, bindGit, publishSourceCandidate, sourcePreparationOf, environment = process.env, retired = [] }) => carrierWorkspaces(claudeCodeDialect, {
  repository, repositoryOf, commandRunner, bindGit, publishSourceCandidate, sourcePreparationOf, environment, retired,
  effectsOf: ({ item, receiving }) => (receiving || repositoryOf?.({ item, receiving })?.mode === "no-source" || claudeEffectsOf(item) === "read-only" ? "read-only" : "repository-write"),
});

/** `executeAgencyWork(item)` for a node whose Claude Code character is `workerId`.
 *  `officeAgent(office)` projects an office; `cwd` is the repository each act's task worktree borrows
 *  from, and no act runs in it. `retired` names shared roots (the former duty-worktrees root) pruned once. */
export function claudeCodeAgencyWorkProvider({ mcpServer = "metroplat", mcpConfig, officeAgent, addDirs = [], claude, cwd, repositoryOf, commandRunner, bindGit, publishSourceCandidate, sourcePreparationOf, environment, retired, ...options }) {
  return agencyWorkCarrier({
    ...options, cwd, dialect: claudeCodeDialect, mcpServer, ...(claude === undefined ? {} : { executable: claude }),
    workspaceOf: claudeWorkspaces({ repository: cwd, repositoryOf, commandRunner, bindGit, publishSourceCandidate, sourcePreparationOf, ...(environment === undefined ? {} : { environment }), ...(retired === undefined ? {} : { retired }) }),
    sessionOptions: ({ item, receiving }) => {
      const effects = receiving || repositoryOf?.({ item, receiving })?.mode === "no-source" ? "read-only" : claudeEffectsOf(item);
      return {
        effects, mcpServer, ...(mcpConfig === undefined ? {} : { mcpConfig }),
        ...(addDirs.length === 0 ? {} : { addDirs }),
        ...(officeAgent === undefined || item.office === undefined ? {} : { office: officeAgent(item.office) }),
        outputSchema: receiving ? RECEIVING_JUDGEMENT_SCHEMA : agencyOutcomeSchema(item.returns),
      };
    },
  });
}
