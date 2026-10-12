import { pathToFileURL } from "node:url";

import { walkPosixPathsSync } from "@red-cup-engineering/path-walking-service";
import { EMPTY_WITNESS_ROOT, identifyJsonSemanticContent } from "@red-cup-engineering/semantic-content-identify-service";

// This module is otherwise pure (a baseline record and a repository root in,
// a position out). It carries two real reads:
//   - the baseline record itself is JSON, read through the language's own
//     JSON module-import attribute (no fs/path substrate, no effect-owner
//     package) rather than a local reimplementation of file-services;
//   - each preserved source file's bytes, for the tree-content digest, are
//     arbitrary (not JSON), so no import-attribute type covers them. That
//     read has no owner reachable from src/ (file-services' scripts/ export
//     has no src/ counterpart, and src-never-imports-scripts forbids
//     reaching it from here even dynamically), so sourceTreeDigest takes an
//     injected readFile(path) from its caller instead of reading itself.

// A parity baseline is a record about one harness on one machine: it names the
// capabilities preserved, the source sets whose tree digests are pinned, and
// the object-kind namespace those digests were minted under. All three are read
// from the baseline record a caller hands in; this package holds none of them.
const DEFAULT_OBJECT_KIND_NAMESPACE = "harness-parity";

function jsonIdentity(value, objectKind) {
  return identifyJsonSemanticContent({ objectKind, value, witnessRoot: EMPTY_WITNESS_ROOT }).id;
}
function byteIdentity(bytes, objectKind) {
  return jsonIdentity({ encoding: "base64", bytes: Buffer.from(bytes).toString("base64") }, objectKind);
}

function toAbsolute(path) {
  return path.startsWith("/") ? path : `${process.cwd()}/${path}`;
}
function joinAbsolute(root, segment) {
  return segment.startsWith("/") ? segment : `${root}/${segment}`;
}
function stripRoot(root, path) {
  return path.slice(root.length + 1);
}

/** Read one harness parity baseline record from an explicit path. */
export async function loadHarnessParityBaseline(path) {
  if (typeof path !== "string" || path.trim() === "") throw new TypeError("a harness parity baseline path is required");
  const record = await import(pathToFileURL(toAbsolute(path)).href, { with: { type: "json" } });
  return record.default;
}

/** The repository root a baseline's source sets are relative to. */
function requiredRepositoryRoot(repositoryRoot) {
  if (typeof repositoryRoot !== "string" || repositoryRoot.trim() === "") throw new TypeError("options.repositoryRoot naming the territory the baseline's source sets live in is required");
  const root = toAbsolute(repositoryRoot);
  try { walkPosixPathsSync({ root, maxDepth: 0 }); }
  catch { throw new TypeError(`repository root does not exist: ${root}`); }
  return root;
}

function filesBelow(root) {
  const walk = walkPosixPathsSync({ root, missing: "empty", paths: "absolute" });
  return walk.files.filter(({ kind }) => kind === "file").map(({ path }) => path).sort();
}

/**
 * @param {string} sourceRoot
 * @param {string} repositoryRoot
 * @param {string} [objectKindNamespace]
 * @param {(path: string) => Buffer|Uint8Array|Promise<Buffer|Uint8Array>} readFile
 *   Reads one file's raw bytes. This module has no filesystem effect owner it
 *   can reach from src/, so the caller (a script, sitting on an effect owner
 *   such as file-services) supplies this.
 */
export async function sourceTreeDigest(sourceRoot, repositoryRoot, objectKindNamespace = DEFAULT_OBJECT_KIND_NAMESPACE, readFile) {
  if (typeof readFile !== "function") throw new TypeError("sourceTreeDigest requires a readFile(path) byte reader");
  const root = requiredRepositoryRoot(repositoryRoot);
  const absoluteRoot = joinAbsolute(root, sourceRoot);
  const entries = await Promise.all(filesBelow(absoluteRoot).map(async (path) => ({
    path: stripRoot(root, path),
    content: byteIdentity(await readFile(path), `${objectKindNamespace}.harness-source-file`),
  })));
  return jsonIdentity({ root: sourceRoot, entries }, `${objectKindNamespace}.harness-source-tree`);
}

function covered(path, rule) {
  return rule.path === path || (typeof rule.prefix === "string" && path.startsWith(rule.prefix));
}

function capabilityEvidencePosition(capability, policy) {
  const missingEvidence = policy.requiredEvidence.filter((key) => typeof capability.evidence?.[key] !== "string" || capability.evidence[key].trim() === "");
  const accepted = capability.actuator.implementationState === policy.requiredCapabilityState && missingEvidence.length === 0;
  return Object.freeze({ id: capability.id, state: capability.actuator.implementationState, missingEvidence, accepted });
}

async function sourceSetDeprecationPosition(source, baseline, repositoryRoot, objectKindNamespace, readFile) {
  const absoluteRoot = joinAbsolute(repositoryRoot, source.root);
  const files = filesBelow(absoluteRoot).map((path) => stripRoot(repositoryRoot, path));
  // Keep the typed preservation relation even after a historical tree has
  // been removed; absence is an obstruction, not loss of capability scope.
  const rules = baseline.backupCoverageRules.filter((rule) => {
    const target = rule.path ?? rule.prefix;
    return typeof target === "string" && (target === source.root || target.startsWith(`${source.root}/`));
  });
  const mappedCapabilities = [...new Set(rules.flatMap((rule) => rule.capabilities ?? []))].sort();
  const capabilityById = new Map(baseline.capabilities.map((capability) => [capability.id, capability]));
  const capabilityPositions = mappedCapabilities.map((id) => capabilityEvidencePosition(capabilityById.get(id), baseline.deprecationPolicy));
  const observedTreeIdentity = await sourceTreeDigest(source.root, repositoryRoot, objectKindNamespace, readFile);
  const uncoveredFiles = files.filter((path) => !baseline.backupCoverageRules.some((rule) => covered(path, rule)));
  const eligible = observedTreeIdentity === source.treeIdentity && uncoveredFiles.length === 0 && capabilityPositions.every(({ accepted }) => accepted);
  return Object.freeze({
    root: source.root,
    baselineTreeIdentity: source.treeIdentity,
    observedTreeIdentity,
    mappedCapabilities,
    blockingCapabilities: capabilityPositions.filter(({ accepted }) => !accepted).map(({ accepted: _accepted, ...position }) => position),
    uncoveredFiles,
    eligible,
    disposition: eligible ? "eligible-for-leader-authorized-deprecation" : "preserve-source-evidence",
    removalAuthority: baseline.deprecationPolicy.authority,
    removalAuthorized: false,
  });
}

/**
 * @param {object} baseline
 * @param {object} options
 * @param {string} options.repositoryRoot
 * @param {(path: string) => Buffer|Uint8Array|Promise<Buffer|Uint8Array>} options.readSourceFile
 *   Reads one preserved source file's raw bytes, for the source-tree content
 *   digests below. Required for the same reason sourceTreeDigest requires it:
 *   no filesystem effect owner is reachable from this src/ module.
 */
export async function evaluateHarnessParity(baseline, { repositoryRoot, readSourceFile } = {}) {
  if (!baseline || typeof baseline !== "object") throw new TypeError("a harness parity baseline record is required");
  const root = requiredRepositoryRoot(repositoryRoot);
  if (typeof readSourceFile !== "function") throw new TypeError("options.readSourceFile(path) byte reader is required");
  const objectKindNamespace = baseline.objectKindNamespace ?? DEFAULT_OBJECT_KIND_NAMESPACE;
  const capabilityIds = new Set(baseline.capabilities.map(({ id }) => id));
  const duplicateCapabilities = baseline.capabilities.map(({ id }) => id).filter((id, index, ids) => ids.indexOf(id) !== index);
  const duplicateActors = baseline.capabilities.map(({ actuator }) => actuator?.actor).filter((actor, index, actors) => actors.indexOf(actor) !== index);
  const invalidActuators = baseline.capabilities.filter(({ actuator }) => !actuator?.actor || !actuator?.operation || !actuator?.inputType || !actuator?.outputType || !actuator?.offer).map(({ id }) => id);
  const invalidRules = baseline.backupCoverageRules.filter((rule) => rule.capabilities?.some((id) => !capabilityIds.has(id)) || (!rule.capabilities && !rule.exclusion));
  const sourceDrift = (await Promise.all(baseline.sourceSets.map(async (source) => {
    const observed = await sourceTreeDigest(source.root, root, objectKindNamespace, readSourceFile);
    return observed === source.treeIdentity ? [] : [{ root: source.root, expected: source.treeIdentity, observed }];
  }))).flat();
  const uncoveredSources = baseline.sourceSets.flatMap((source) => filesBelow(joinAbsolute(root, source.root)).map((path) => stripRoot(root, path))).filter((path) => !baseline.backupCoverageRules.some((rule) => covered(path, rule)));
  const closureEvidencePolicy = { requiredCapabilityState: baseline.closurePolicy.requiredImplementationState, requiredEvidence: baseline.closurePolicy.requiredEvidence };
  const unclosableCapabilities = baseline.capabilities.map((capability) => capabilityEvidencePosition(capability, closureEvidencePolicy)).filter(({ accepted }) => !accepted).map(({ accepted: _accepted, ...position }) => position);
  const sourceSetDeprecation = await Promise.all(baseline.sourceSets.map((source) => sourceSetDeprecationPosition(source, baseline, root, objectKindNamespace, readSourceFile)));
  return Object.freeze({
    type: "CodexHarnessParityPosition",
    baselineDemand: baseline.demand,
    capabilityCount: baseline.capabilities.length,
    sourceSetCount: baseline.sourceSets.length,
    duplicateCapabilities,
    duplicateActors,
    invalidActuators,
    invalidRules,
    sourceDrift,
    uncoveredSources,
    unclosableCapabilities,
    sourceSetDeprecation,
    deprecationEligibleSourceSets: sourceSetDeprecation.filter(({ eligible }) => eligible).map(({ root }) => root),
    deprecationPolicy: baseline.deprecationPolicy,
    disposition: duplicateCapabilities.length || duplicateActors.length || invalidActuators.length || invalidRules.length || sourceDrift.length || uncoveredSources.length || unclosableCapabilities.length ? "demand-open" : "eligible-for-customer-closure-review"
  });
}

export async function assertHarnessParityClosable(baseline, options) {
  const position = await evaluateHarnessParity(baseline, options);
  if (position.disposition !== "eligible-for-customer-closure-review") {
    throw new Error(`Codex harness parity demand is not closable: ${JSON.stringify(position)}`);
  }
  return position;
}
