// inquiring : subject -> inquiry-utterance   [HACKING: conductor act]
//
// A conscious command to the swarm: pose a subject for it to study. Produces a well-formed utterance
// the conductor MCP turns into a swarmStudy on the subject. PURE: emits the utterance.

export default function inquiring(subject) {
  if (typeof subject !== "string" || subject.length === 0)
    throw new TypeError("inquiring: subject must be a non-empty string");
  return { utterance: [`inquiry:${subject}`, "study this subject"], subject };
}
