// Content-addressed identity for JSON values and raw bytes, built on
// @red-cup-engineering/semantic-content-identify-service's SHA-256 hashing.
// Used throughout this package to name cached tool output and to build
// stable, collision-resistant filenames on disk.
import { EMPTY_WITNESS_ROOT, identifyJsonSemanticContent } from "@red-cup-engineering/semantic-content-identify-service";

const NI = /^ni:\/\/\/sha-256;[A-Za-z0-9_-]{43}$/u;

/** Content-address a JSON-serializable value. Returns { id, bytes, ... }. */
export function identify(value, objectKind = "bare-cedar-fog-codex.material") {
  return identifyJsonSemanticContent({ objectKind, value, witnessRoot: EMPTY_WITNESS_ROOT });
}

/** Content-address raw bytes by base64-wrapping them as a JSON value. */
export function identifyBytes(bytes, objectKind = "bare-cedar-fog-codex.byte-carrier") {
  const buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  return identify({ encoding: "base64", bytes: buffer.toString("base64") }, objectKind);
}

/** Turn one `ni:///sha-256;...` identity token into a filesystem-safe hex key. */
export function fileKey(token) {
  if (!NI.test(token)) throw new TypeError("file key requires one SHA-256 NI identity token");
  return Buffer.from(token.slice("ni:///sha-256;".length), "base64url").toString("hex");
}
