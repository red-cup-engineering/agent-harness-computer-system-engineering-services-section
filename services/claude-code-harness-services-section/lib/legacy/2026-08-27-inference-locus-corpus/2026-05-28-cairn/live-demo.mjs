#!/usr/bin/env node
// live-demo.mjs -- proves the harness DOES something with REAL free endpoints. Impure (network).
// Three real observers on three free providers settle a subject through the actual morphisms
// (being -> working -> studying), then the settled frontier is projected to an SHP packet.
//   node live-demo.mjs "<subject>"

import { reader } from "#enactors";
import being from "#script/being";
import working from "#script/working";
import studying from "#script/studying";
import { project } from "#script/projecting";

const subject = process.argv.slice(2).join(" ")
  || "The Fibonacci substitution has closure ordinal omega (the Scott-continuous regime).";

const SCOUTS = [["groq-scout", "groq"], ["nvidia-scout", "nvidia"], ["cerebras-scout", "cerebras"]];

console.log(`subject: ${subject}\n`);
const claims = [];
for (const [id, provider] of SCOUTS) {
  const agent = being({ id, kind: "sensing" });           // an outward (sensing) drone, real model behind it
  try {
    const r = await reader({ provider })(agent, subject);  // real LLM call
    const wp = working(agent, subject, () => r);           // pure morphism over the real read
    claims.push(wp.claim);
    console.log(`  ${id}@${provider}: ${wp.claim.value}   (${wp.claim.evidence[0]})`);
  } catch (e) {
    console.log(`  ${id}@${provider}: skipped (${e.message})`);
  }
}

const studied = studying(subject, claims, null, { threshold: 0.5, maxRounds: 1 });
console.log("\nswarm settled:", JSON.stringify({
  truth: studied.truth, consensus: studied.consensus,
  confidence: studied.confidence, accepted: studied.accepted, observers: studied.claimCount
}));

const packet = project([{ e: "subject", a: "swarm-settled", v: studied.truth }]);
console.log("\nSHP packet span:");
console.log(packet.split("\n").filter((l) => /span class/.test(l)).join("\n"));
