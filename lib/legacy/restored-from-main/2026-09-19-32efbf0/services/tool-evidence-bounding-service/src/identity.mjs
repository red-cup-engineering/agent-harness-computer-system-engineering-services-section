import { EMPTY_WITNESS_ROOT, identifyJsonSemanticContent } from "@red-cup-engineering/semantic-content-identify-service";

// This package's own content-addressing for its own evidence store. The
// object kinds below name only this package's internal cache entries (raw
// carriers, receipts, observation trajectory); they carry no meaning outside
// this package's evidence store and a caller never needs to match them.
export function identity(value, objectKind = "tool-evidence.material") {
  return identifyJsonSemanticContent({ objectKind, value, witnessRoot: EMPTY_WITNESS_ROOT }).id;
}

export function byteIdentity(bytes, objectKind = "tool-evidence.byte-carrier") {
  const carrier = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  return identity({ encoding: "base64", bytes: carrier.toString("base64") }, objectKind);
}
