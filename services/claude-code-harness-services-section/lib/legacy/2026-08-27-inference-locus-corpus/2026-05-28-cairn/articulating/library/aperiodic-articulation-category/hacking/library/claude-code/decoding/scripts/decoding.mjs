// decoding : (handler-class, payload) -> utterance | rejection | obstruction
//
// Locution -- the body's sensory transduction. Every channel the organism senses or acts through
// decodes into the SAME language: an utterance for articulating to consume. Senses (hooks, http,
// completions) and acts (tool calls) both speak utterances. The more of the I/O surface transduced,
// the more the swarm has to process. It NESTS INSIDE the structure (nothing is outside); it does not
// itself write logs or fire downstream. The 5-class enum realizes the previously-deferred D-H5
// extension (tool-call-envelope, llm-completion).

const HANDLER_CLASSES = ["script-argv", "hook-payload", "http-request", "tool-call-envelope", "llm-completion"];

export default function decoding(handlerClassName, payload) {
  if (!HANDLER_CLASSES.includes(handlerClassName))
    throw new TypeError(`decoding: handlerClassName must be one of ${HANDLER_CLASSES.join(", ")}`);

  if (handlerClassName === "hook-payload") {
    if (!payload || typeof payload !== "object" || Array.isArray(payload))
      return { kind: "rejection", reason: "hook-payload must be a JSON object" };
    const event = typeof payload.event === "string" && payload.event.length ? payload.event : "unknown";
    return { kind: "utterance", utterance: [`hook:${event}`, JSON.stringify(payload)] };
  }

  if (handlerClassName === "script-argv") {
    if (!Array.isArray(payload)) return { kind: "rejection", reason: "argv must be an array" };
    if (payload.length === 0) return { kind: "obstruction", reason: "empty argv" };
    return { kind: "utterance", utterance: ["cli:argv", JSON.stringify(payload)] };
  }

  if (handlerClassName === "tool-call-envelope") {
    if (!payload || typeof payload.tool !== "string" || !payload.tool)
      return { kind: "rejection", reason: "tool-call-envelope needs a tool name" };
    // an act (or its result) is an utterance: token names the tool, claim carries the input/result
    return { kind: "utterance", utterance: [`tool:${payload.tool}`, JSON.stringify(payload.result ?? payload.input ?? null)] };
  }

  if (handlerClassName === "llm-completion") {
    if (!payload || typeof payload.text !== "string" || !payload.text)
      return { kind: "rejection", reason: "llm-completion needs text" };
    return { kind: "utterance", utterance: [`llm:${payload.model ?? "model"}`, payload.text] };
  }

  // http-request
  if (!payload || typeof payload.method !== "string" || typeof payload.url !== "string")
    return { kind: "rejection", reason: "http-request needs method and url" };
  return { kind: "utterance", utterance: [`http:${payload.method}:${payload.url}`, JSON.stringify(payload.body ?? null)] };
}
