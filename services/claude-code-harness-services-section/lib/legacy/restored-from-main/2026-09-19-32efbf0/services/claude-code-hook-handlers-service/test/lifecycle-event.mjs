// One constructed AgentLifecycleEvent per test, exactly as the lifecycle-hook
// platform's decoder would deliver it. Handlers are exercised directly; no
// child process, no stdin, no wire shape.
// `cwd: null` names an event that carries no workspace at all, which
// `cwd: undefined` cannot express (an explicit undefined takes the default).
export function lifecycleEvent({ event, tool, toolInput, toolResponse, prompt, source, cwd = "/repo", sessionId = "session", transcriptPath, runtime = "claude" } = {}) {
  const record = {
    kind: "agent-lifecycle-event",
    version: 1,
    runtime,
    event,
    session: { id: sessionId, ...(typeof cwd === "string" ? { cwd } : {}), ...(transcriptPath === undefined ? {} : { transcriptPath }) },
    native: {},
  };
  if (tool !== undefined) record.tool = { name: tool, input: toolInput ?? {}, ...(toolResponse === undefined ? {} : { response: toolResponse }) };
  if (prompt !== undefined) record.prompt = prompt;
  if (source !== undefined) record.source = source;
  return record;
}

/** The response a handler returned, whether it came back bare or inside a Result. */
export function responseOf(returned) {
  if (returned !== null && typeof returned === "object" && returned.kind === "agent-lifecycle-response") return returned;
  if (returned?.ok === true) return returned.value;
  throw new Error(`handler refused: ${JSON.stringify(returned?.refusal ?? returned)}`);
}

/** One JavascriptNodeCommandExecutionReceipt, for a handler's injected command effect. */
export function commandReceipt(result = {}) {
  return {
    type: "JavascriptNodeCommandExecutionReceipt",
    version: 1,
    request: null,
    result: { type: "JavascriptNodeCommandExecutionResult", version: 1, status: 0, signal: null, stdout: "", stderr: "", error: "", ...result },
  };
}

/** One admitted AgentHarnessPolicy, as a machine's own record. */
export function harnessPolicy({ actor = "actor:bZH6KBOlPVWbYpqp04izN_Xtwykn0XgsMBStm_FkPPw", instructions = "lib/machine-section/content/harness/root-instructions.md", roles = [] } = {}) {
  return {
    kind: "agent-harness-policy",
    version: 1,
    actor,
    runtime: "claude",
    instructions: { source: instructions },
    mcpServers: {},
    hooks: [],
    skills: [],
    roles,
  };
}

/** A read-text function over an in-memory file set, refusing anything absent. */
export function textReader(files) {
  return async (path) => {
    if (path in files) return files[path];
    throw new Error(`ENOENT: no such file or directory, open '${path}'`);
  };
}
