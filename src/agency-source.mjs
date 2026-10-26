/** The harness receives the host's named source sections through Organizing's original reader. */
import { readAgency } from "@red-cup-engineering/organizing/agency";
import { agencyAt } from "@red-cup-engineering/organizing/agency/held";

function selection({ agencySections, environment = process.env }) {
  const declared = agencySections ?? (environment.METROPLAT_AGENCY_SECTIONS === undefined
    ? [""] : JSON.parse(environment.METROPLAT_AGENCY_SECTIONS));
  if (!Array.isArray(declared) || declared.some(section => typeof section !== "string")) {
    throw new TypeError("The harness host must declare its agency sections as an array of source-relative paths");
  }
  // Original Organizing admits the actual section paths and excludes data/vendor copies.
  return declared;
}

export function harnessAgencyAt(root, { agencySections, environment, ...options } = {}) {
  return agencyAt(root, { ...options, sections: selection({ agencySections, environment }) });
}

export function readHarnessAgency(root, { agencySections, environment, ...options } = {}) {
  return readAgency(root, { ...options, sections: selection({ agencySections, environment }) });
}
