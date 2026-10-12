// exploring : (subject, reader) -> claim-records   [OUTWARD: the sensing hand; network via reader]
//
// The "new exploring": dispatch sensing drones (being kind:"sensing") to crawl the environment
// (repo/web) for a subject and bring back claim-records. The reader is injected (enactors.reader for
// real endpoints, or a stub) -- so the morphism stays pure/testable; the network lives in the reader.
// This is the outward counterpart to remembering (inward): exploring fetches new sense from the world.

import being from "#script/being";

export default async function exploring(subject, reader, { drones = ["drone-1"] } = {}) {
  if (typeof subject !== "string" || subject.length === 0)
    throw new TypeError("exploring: subject must be a non-empty string");
  const out = [];
  for (const id of drones) {
    const agent = being({ id, kind: "sensing" });
    const r = reader ? await reader(agent, subject) : { value: "bottom", evidence: [`${id}:no-reader`] };
    out.push({ observer: agent.id, value: r.value, evidence: r.evidence });
  }
  return out;
}
