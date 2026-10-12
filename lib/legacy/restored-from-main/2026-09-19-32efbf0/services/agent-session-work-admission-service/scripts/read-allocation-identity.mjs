// The office and incumbent actor an admitter charges its allocations to,
// read off the calling harness's own policy record. The reading lives in the
// scripts tier because it reaches the world; src/work-allocation.mjs holds
// the pure algebra it hands the record to.
import { readFileText } from "@red-cup-engineering/file-services/read-file";
import { resolveFilepath } from "@red-cup-engineering/resolve-filepath-service";
import { allocationIdentityOf } from "../src/work-allocation.mjs";

/**
 * Reads one harness policy record and reports the identity its allocations
 * are charged to.
 *
 * @param {string} policyPath - a harness policy JSON naming `actor` and `rootOffice`.
 * @param {typeof readFileText} [readText]
 * @returns {Promise<{actor: string, office: string}>}
 * @throws {Error} when no path is given, or the record names neither.
 */
export async function readAllocationIdentity(policyPath, readText = readFileText) {
  if (typeof policyPath !== "string" || policyPath === "") throw new TypeError("readAllocationIdentity: a harness policy path is required");
  return allocationIdentityOf(JSON.parse(await readText(resolveFilepath([policyPath]))), policyPath);
}
