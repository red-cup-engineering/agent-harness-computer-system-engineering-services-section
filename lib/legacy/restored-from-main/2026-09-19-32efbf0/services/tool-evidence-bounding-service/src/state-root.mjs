// Where this package caches tool-output evidence on disk by default. The
// package owns its own state beside its own source; a caller that composes
// several actors' evidence into one store overrides it with `options.stateRoot`
// or the TOOL_EVIDENCE_STATE_ROOT environment variable.
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { dataCustodyDirectory } from "@red-cup-engineering/data-custody-directory-service";

const SECTION_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export function defaultStateRoot() {
  return dataCustodyDirectory(SECTION_ROOT, "state");
}

export function stateRoot(options = {}) {
  return resolve(options.stateRoot ?? process.env.TOOL_EVIDENCE_STATE_ROOT ?? defaultStateRoot());
}
