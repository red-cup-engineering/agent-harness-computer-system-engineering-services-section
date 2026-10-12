// invoking : tool-call-envelope -> tool-result   [HACKING: name + handler-class admitted]
//
// A constrained action: the conductor invoking a tool. Types the boundary -- the envelope names the
// tool and its input; the actual effect is enacted outside and supplied as `output`. The outcome is
// ok unless the output carries an error.

export default function invoking(envelope, output) {
  if (!envelope || typeof envelope.tool !== "string" || envelope.tool.length === 0)
    throw new TypeError("invoking: envelope.tool must be a non-empty string");
  const outcome = output && output.error ? "error" : "ok";
  return { tool: envelope.tool, outcome, output: output ?? null };
}
