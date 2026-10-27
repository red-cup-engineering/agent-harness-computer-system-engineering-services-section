import { mkdirSync } from "node:fs";
import { dataKindDirectory } from "@red-cup-engineering/eavt-services-section/data-artifact-address";
import { SECTION_ROOT } from "../../src/section-root.mjs";

/** The directory tests make their scratch in: the harness's own state, which the repository ignores. */
export function scratchRoot() {
  const directory = dataKindDirectory(SECTION_ROOT, "state", "test-scratch");
  mkdirSync(directory, { recursive: true });
  return directory;
}
