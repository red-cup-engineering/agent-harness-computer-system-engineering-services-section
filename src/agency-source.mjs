/** The harness receives the host's named source sections through Organizing's original reader. */
import { readAgency } from "@red-cup-engineering/organizing/agency";
import { agencyAt } from "@red-cup-engineering/organizing/agency/held";
import { admitAgencySections } from "@red-cup-engineering/agentic-computer-system-organization-services-section-engineering-services-section/agency-layout";

function selection({ agencySections, environment = process.env }) {
  if (agencySections !== undefined) return admitAgencySections(agencySections);
  if (environment.METROPLAT_AGENCY_SECTIONS === undefined) return undefined;
  return admitAgencySections(JSON.parse(environment.METROPLAT_AGENCY_SECTIONS));
}

export function harnessAgencyAt(root, { agencySections, environment, ...options } = {}) {
  return agencyAt(root, { ...options, sections: selection({ agencySections, environment }) });
}

export function readHarnessAgency(root, { agencySections, environment, ...options } = {}) {
  return readAgency(root, { ...options, sections: selection({ agencySections, environment }) });
}
