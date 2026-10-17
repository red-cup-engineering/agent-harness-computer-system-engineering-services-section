// harness-world-verbs — the agent harness's three world operations as a plain verbs module: every
// named export is one verb function carrying `.spec` ({args, returns, refusal}) and `.effects`, the
// shape computer-system-engine's generic stdio verb server loads with
// `--verbs @red-cup-engineering/agent-harness-computer-system-engineering-services-section/harness-world-verbs`.
//
//   seed-offices             one office per harness actor, its actor moved in, one workbench per
//                            instrument the actor wields (from actor-genesis + mcpServers carriers)
//   fold-harness-lifecycle   skill-selected / provider-commissioned events as duties reported-by an
//                            actor and reported-at its office
//   fold-harness-turns       prompt/stop turns as utterances and sessions
//
// Revived from @red-cup-engineering/lagoon 0.2.2's seed-offices / fold-harness-lifecycle /
// fold-harness-turns into the section that owns harness records. Each is idempotent. Roots and
// sources default to the in-tree harness sections when this package is run inside the enterprise
// tree (or LAGOON_REPO_ROOT is declared); from an installed package they must be passed.

import { REFUSAL_SCHEMA } from "@red-cup-engineering/computer-data-engineering-services-section/operation-refusal-schema";
import { DEFAULT_HARNESS_SOURCES, deriveOfficeSeeds, seed as seedOfficesInTrace } from "../scripts/seed-offices.mjs";
import { DEFAULT_JOURNAL_ROOTS, fold as foldLifecycleInTrace } from "../scripts/fold-harness-lifecycle.mjs";
import { fold as foldTurnsInTrace } from "../scripts/fold-harness-turns.mjs";

const RESULTS = {
  type: "object",
  properties: { results: { type: "array", items: { type: "object", properties: { kind: { type: "string" }, skipped: { type: "boolean" }, detail: { type: "string" } }, required: ["kind", "skipped", "detail"] } } },
  required: ["results"],
};
const ROOTS = { type: "array", items: { type: "string" } };
const SOURCE = {
  type: "object",
  properties: { harness: { type: "string" }, officeName: { type: "string" }, genesisPath: { type: "string" }, mcpServersPath: { type: "string" } },
  required: ["harness", "officeName", "genesisPath", "mcpServersPath"],
};

function requireNonEmpty(list, what, verb) {
  if (list.length === 0) throw new TypeError(`${verb}: no ${what} given and none found in a tree (set LAGOON_REPO_ROOT or pass them)`);
  return list;
}

function seedOffices({ path, sources, measuredAt, machineName }) {
  const seeds = deriveOfficeSeeds(requireNonEmpty(sources ?? DEFAULT_HARNESS_SOURCES, "sources", "seed-offices"));
  return { results: seedOfficesInTrace(seeds, path, { ...(measuredAt === undefined ? {} : { measuredAt }), ...(machineName === undefined ? {} : { machineName }) }) };
}
seedOffices.spec = {
  args: { type: "object", properties: { path: { type: "string" }, sources: { type: "array", items: SOURCE }, measuredAt: { type: "string" }, machineName: { type: "string" } }, required: ["path"] },
  returns: RESULTS,
  refusal: REFUSAL_SCHEMA,
};
seedOffices.effects = ["filesystem:read", "filesystem:write"];

function foldHarnessLifecycle({ path, roots }) {
  return { results: foldLifecycleInTrace(requireNonEmpty(roots ?? DEFAULT_JOURNAL_ROOTS, "roots", "fold-harness-lifecycle"), path) };
}
foldHarnessLifecycle.spec = {
  args: { type: "object", properties: { path: { type: "string" }, roots: ROOTS }, required: ["path"] },
  returns: RESULTS,
  refusal: REFUSAL_SCHEMA,
};
foldHarnessLifecycle.effects = ["filesystem:read", "filesystem:write"];

function foldHarnessTurns({ path, roots, placeName, sources }) {
  const officeSeeds = deriveOfficeSeeds(requireNonEmpty(sources ?? DEFAULT_HARNESS_SOURCES, "sources", "fold-harness-turns"));
  return { results: foldTurnsInTrace(requireNonEmpty(roots ?? DEFAULT_JOURNAL_ROOTS, "roots", "fold-harness-turns"), path, { ...(placeName === undefined ? {} : { placeName }), officeSeeds }) };
}
foldHarnessTurns.spec = {
  args: { type: "object", properties: { path: { type: "string" }, roots: ROOTS, placeName: { type: "string" }, sources: { type: "array", items: SOURCE } }, required: ["path"] },
  returns: RESULTS,
  refusal: REFUSAL_SCHEMA,
};
foldHarnessTurns.effects = ["filesystem:read", "filesystem:write"];

export {
  seedOffices as "seed-offices",
  foldHarnessLifecycle as "fold-harness-lifecycle",
  foldHarnessTurns as "fold-harness-turns",
};
