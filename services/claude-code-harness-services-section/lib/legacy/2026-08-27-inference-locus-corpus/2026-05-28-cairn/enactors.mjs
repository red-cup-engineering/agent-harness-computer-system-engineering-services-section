// enactors.mjs -- THIN ADAPTER onto @561/swarm-intelligence. Inference is the SWARM's (the aperiodic
// skill); per docs/GENEALOGY.md §2-§4 the harness does not own the network. This file used to carry a
// hard-coded three-provider table + fetch -- a blind duplicate of swarm `inferring` + key resolution.
// It now maps the harness's historical chat/reader/infer surface onto swarm `inferring`. No fetch, no
// provider table, no API keys here: the conductor delegates the aperiodic corner to the swarm.

import { inferring } from "@561/development.experimental.swarm-intelligence";

// harness provider name -> swarm endpointId
const ENDPOINT = { groq: "endpoint:groq", nvidia: "endpoint:nvidia-nim", cerebras: "endpoint:cerebras" };
const endpointOf = (provider = "groq") => ENDPOINT[provider] ?? provider;

// chat: prompt -> completion text. (system is folded into the claim; swarm inferring takes one user msg.)
export async function chat(prompt, { provider = "groq", model, system } = {}) {
  const claim = system ? `${system}\n\n${prompt}` : String(prompt);
  const r = await inferring(["harness:chat", claim], { endpointId: endpointOf(provider), model });
  return r.completion ?? "";
}

// a real swarm read: ask an endpoint to settle a subject as a FOUR value, with its answer as evidence.
// returns { value, evidence } -- the shape `working` consumes.
export function reader({ provider = "groq", model } = {}) {
  return async (agent, subject) => {
    const claim =
      'You are a careful evaluator in a swarm. Answer with ONE word only: true, false, or unknown. ' +
      'true = the statement is correct; false = incorrect; unknown = insufficient basis.\n' +
      `Statement: "${subject}"\nIs it true?`;
    const r = await inferring([`${agent.id}:read`, claim], { endpointId: endpointOf(provider), model });
    const text = (r.completion ?? "").trim().toLowerCase();
    const value = text.startsWith("true") ? "true" : text.startsWith("false") ? "false" : "bottom";
    return { value, evidence: [`${agent.id}@${provider}:${text.slice(0, 40)}`] };
  };
}

// a real inferring enactor: context -> inference (message + actions).
export async function infer(context, { provider = "groq", model, system } = {}) {
  const message = await chat(String(context?.input ?? ""), {
    provider, model, system: system || "You are the conductor. Reply concisely."
  });
  return { message, actions: [] };
}
