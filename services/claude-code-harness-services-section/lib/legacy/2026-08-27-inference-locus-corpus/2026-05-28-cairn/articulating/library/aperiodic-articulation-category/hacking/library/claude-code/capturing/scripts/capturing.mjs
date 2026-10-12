// capturing : (handler-class, payload) -> captured claim(s)   [IO-ARTICULATION rule]
//
// external I/O -> utterance -> articulating -> claim. Every tool call / prompt / completion / hook
// event the body senses or effects is transduced (decoding) into an utterance, articulated into a
// potential aperiodic cell, and captured as a claim the swarm can process. This is "capture ALL
// activity": the more of the surface that flows through here, the more the swarm has to learn from.
// PURE: returns rows; the durable write is the capture entrypoint's job (codeRemainsProbe).

import decoding from "#script/decoding";
import articulating from "#script/articulating";

export default function capturing(handlerClass, payload, { now } = {}) {
  const decoded = decoding(handlerClass, payload);
  if (decoded.kind !== "utterance") return { kind: decoded.kind, reason: decoded.reason, claims: [] };
  const cell = articulating(decoded.utterance); // [utterance, [null, null]] -- potential aperiodic cell
  const [token, claim] = decoded.utterance;
  const t = (now && now()) || new Date().toISOString();
  return { kind: "utterance", cell, claims: [{ e: token, a: "uttered", v: claim, t }] };
}
