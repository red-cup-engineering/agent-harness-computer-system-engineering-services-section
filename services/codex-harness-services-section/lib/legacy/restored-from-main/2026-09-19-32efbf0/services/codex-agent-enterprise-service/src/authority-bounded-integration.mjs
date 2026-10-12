// The Codex actuation office's own EXECUTE-stage gate. Thin caller of Red
// Cup Engineering's authority-bounded-integration-service — the same
// mechanics the seated Claude peer now hires too, rather than each
// enterprise hand-copying them under its own name. This file supplies only
// this enterprise's own actor/customer identity, hash functions, and the
// actuator sub-identity distinct from the enterprise's own main actor; it
// never re-implements the gate itself.

import { pathToFileURL } from "node:url";

import { ACTOR, CUSTOMER, DEFAULT_STATE_ROOT, TERRITORY, identity } from "./enterprise.mjs";
import { OBJECT_KIND_NAMESPACE, semanticByteIdentity } from "./semiotic-circuit.mjs";

// The gate itself belongs to Red Cup Engineering's
// authority-bounded-integration-service. Its location is a fact about the
// territory the machine enterprise works in, so the territory comes from the
// enterprise configuration rather than from a walk up this package's own path.
const SERVICE_SHAPE =
  "lib/emsenn/services/561-group/services/engineering-services-section/services/computer-engineering-services-section/services/computer-systems-engineering-services-section/services/computer-inference-system-services-section/services/llm-services-section/services/authority-bounded-integration-service/src/client.mjs";

function byteDigest(bytes) {
  return semanticByteIdentity(bytes, `${OBJECT_KIND_NAMESPACE}.authority-carrier`).id;
}

export const AUTHORITY_BOUNDED_INTEGRATION_ACTOR = "urn:ame:codex-authority-bounded-integration-actuator";
export const AUTHORITY_BOUNDED_INTEGRATION_OFFER = "urn:offer:codex-authority-bounded-integration";

// The territory's own filesystem shape is observed only by attempting the
// import: a missing module surfaces as ERR_MODULE_NOT_FOUND, which this file
// turns into the same clear refusal an existsSync guard used to give, without
// this src module reaching for a filesystem effect owner itself.
let createAuthorityBoundedIntegration;
try {
  ({ createAuthorityBoundedIntegration } = await import(pathToFileURL(`${TERRITORY}/${SERVICE_SHAPE}`).href));
} catch (error) {
  if (error?.code === "ERR_MODULE_NOT_FOUND") throw new Error(`configured territory does not contain ${SERVICE_SHAPE}`);
  throw error;
}

const client = createAuthorityBoundedIntegration({
  actor: ACTOR,
  customer: CUSTOMER,
  identity,
  byteDigest,
  defaultStateRoot: DEFAULT_STATE_ROOT,
  provider: AUTHORITY_BOUNDED_INTEGRATION_ACTOR,
  offer: AUTHORITY_BOUNDED_INTEGRATION_OFFER,
});

export const AUTHOR_PROCESS_DIGEST = client.AUTHOR_PROCESS_DIGEST;
export const codexMutationIntent = client.mutationIntent;
export const leaderAuthority = client.leaderAuthority;

// The shared client only ever sees an explicit workspaceRoot/claimsRoot — it
// carries no knowledge of any provider's own env var convention. Resolving
// CODEX_AUTHORIZED_WORKSPACE_ROOT / CODEX_AUTHORITY_CLAIMS_ROOT is this
// enterprise's own business, done here, once, before delegating.
export function executeAuthorityBoundIntegration(input, options = {}) {
  return client.executeAuthorityBoundIntegration(input, {
    ...options,
    workspaceRoot: options.workspaceRoot ?? process.env.CODEX_AUTHORIZED_WORKSPACE_ROOT ?? process.cwd(),
    claimsRoot: options.claimsRoot ?? process.env.CODEX_AUTHORITY_CLAIMS_ROOT ?? `${DEFAULT_STATE_ROOT}/authority-claims`,
  });
}
