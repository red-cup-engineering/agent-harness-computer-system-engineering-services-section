import { EMPTY_WITNESS_ROOT, identifyJsonSemanticContent } from "@red-cup-engineering/semantic-content-identify-service";
import { ACTOR } from "./enterprise.mjs";
import { codexEnterpriseConfiguration } from "./configuration.mjs";
import { OBJECT_KIND_NAMESPACE } from "./semiotic-circuit.mjs";
import { canonicalJson as canonical } from "@red-cup-engineering/computer-data-engine/identity";

const configuration = codexEnterpriseConfiguration();
const LOCI_ROOT = `${configuration.agentsRoot}/loci`;
const PROFILE_NAMESPACE = `org.${configuration.machine}.codex-architectural-locus`;
const PROFILE = `${PROFILE_NAMESPACE}-seed.v1`;
const EXPECTED = new Set(["semiovoxel-composition", "unionification-criticality", "thermodynamic-metabolism", "foam-registry-diagnostics"]);
const FACES = new Set(["activitypub", "evm", "a2a", "ocap", "x402"]);

function identity(value) { return identifyJsonSemanticContent({ objectKind: `${OBJECT_KIND_NAMESPACE}.architectural-locus`, value, witnessRoot: EMPTY_WITNESS_ROOT }).token; }

/**
 * Pure architectural-locus registry assembly: never touches the filesystem
 * itself. The caller (a script, sitting on an effect-owner package) reads the
 * locus JSON carriers under root and hands them to `readLoci`.
 */
export async function observeArchitecturalLoci({ root = LOCI_ROOT, readLoci } = {}) {
  if (typeof readLoci !== "function") throw new TypeError("observeArchitecturalLoci requires a readLoci(root) reader that lists and parses the locus JSON carriers");
  const loci = await readLoci(root);
  if (loci.length !== EXPECTED.size || new Set(loci.map(({ locus }) => locus)).size !== loci.length || loci.some(({ locus }) => !EXPECTED.has(locus))) throw new Error("architectural locus registry must contain exactly the four bootloader sections");
  for (const locus of loci) {
    if (locus.profile !== PROFILE || locus.owner !== ACTOR || locus.status !== "seed-not-advertised") throw new Error(`${locus.locus} cannot advertise an unowned or undeployed actor`);
    if (!/^urn:ame:codex-[a-z-]+-locus$/u.test(locus.actor) || locus.actor === ACTOR) throw new Error(`${locus.locus} must remain distinct from the stable Codex identity`);
    if (!/^ni:\/\/\/sha-256;[A-Za-z0-9_-]{43}$/u.test(locus.source)) throw new Error(`${locus.locus} must retain its exact semantic source identity`);
    if (!Array.isArray(locus.executableBindings) || locus.executableBindings.length === 0) throw new Error(`${locus.locus} must name executable growth faces`);
    if (!Array.isArray(locus.missingFaces) || locus.missingFaces.some((face) => !FACES.has(face))) throw new Error(`${locus.locus} has an invalid face defect`);
  }
  const body = Object.freeze({ profile: `${PROFILE_NAMESPACE}-registry.v1`, owner: ACTOR, loci: Object.freeze(loci.map((locus) => Object.freeze({ id: identity(locus), ...locus }))) });
  return Object.freeze({ id: identity(body), ...body });
}
