import assert from "node:assert/strict";
import test from "node:test";
import { bindMcpTools } from "../src/mcp-tools.mjs";
import { executeOpenAiCompatibleToolAgent, createToolAgentBudget } from "../src/openai-compatible-tool-agent.mjs";

const inputSchema = { type: "object", properties: { limit: { type: "integer", minimum: 1, maximum: 3 } }, required: ["limit"], additionalProperties: false };
const outputSchema = { type: "object", properties: { count: { type: "integer" } }, required: ["count"], additionalProperties: false };
const tool = { name: "work-read", inputSchema, outputSchema, annotations: { readOnlyHint: true } };
const envelope = { content: [{ type: "text", text: "One item" }, { type: "resource_link", name: "work", uri: "urn:work:1" }], structuredContent: { count: 1 }, _meta: { source: "measured" } };
function clientFor(result = envelope) {
  return { async listTools() { return { tools: [tool] }; }, async callTool() { return result; } };
}

test("MCP discovery traverses pages and grants only explicit names", async () => {
  const pages = [];
  const calls = [];
  const client = {
    async listTools(params) {
      pages.push(params);
      return params.cursor ? { tools: [tool] } : { tools: [{ ...tool, name: "ungranted", annotations: { readOnlyHint: true } }], nextCursor: "second" };
    },
    async callTool(...args) { calls.push(args); return envelope; },
  };
  const binding = await bindMcpTools({ client, allowlist: ["work-read"] });
  assert.deepEqual(pages, [{}, { cursor: "second" }]);
  assert.deepEqual(binding.tools.map((value) => value.function.name), ["work-read"]);
  assert.deepEqual(binding.tools[0].function.parameters, inputSchema);
  assert.equal(binding.toolHandlers.ungranted, undefined);
  assert.deepEqual(await binding.toolHandlers["work-read"]({ limit: 1 }), envelope);
  assert.deepEqual(calls[0][0], { name: "work-read", arguments: { limit: 1 } });
});

test("MCP refuses missing grants, duplicates and cursor cycles without execution", async () => {
  await assert.rejects(bindMcpTools({ client: clientFor(), allowlist: ["missing"] }), /not discovered/u);
  await assert.rejects(bindMcpTools({ client: clientFor(), allowlist: ["work-read", "work-read"] }), /unique/u);
  await assert.rejects(bindMcpTools({ client: { ...clientFor(), listTools: async () => ({ tools: [tool, tool] }) }, allowlist: ["work-read"] }), /ambiguous/u);
  await assert.rejects(bindMcpTools({ client: { ...clientFor(), listTools: async () => ({ tools: [], nextCursor: "repeat" }) }, allowlist: ["work-read"] }), /repeated/u);
  await assert.rejects(bindMcpTools({ client: { ...clientFor(), listTools: async () => ({ tools: [], nextCursor: "next" }) }, allowlist: ["work-read"], maximumPages: 1 }), /page bound/u);
  await assert.rejects(bindMcpTools({ client: clientFor(), allowlist: ["requires.lossy.rename"] }), /compatible/u);
});

test("MCP input is admitted before call; output schema applies to structured content", async () => {
  let calls = 0;
  const client = { ...clientFor(), async callTool() { calls += 1; return envelope; } };
  const binding = await bindMcpTools({ client, allowlist: ["work-read"] });
  await assert.rejects(binding.toolHandlers["work-read"]({ limit: 4 }), /input schema/u);
  assert.equal(calls, 0);
  assert.deepEqual(await binding.toolHandlers["work-read"]({ limit: 1 }), envelope);
  const invalid = await bindMcpTools({ client: clientFor({ content: [], structuredContent: { count: "unknown" } }), allowlist: ["work-read"] });
  await assert.rejects(invalid.toolHandlers["work-read"]({ limit: 1 }), /structured output/u);
});

test("MCP execution errors remain results; protocol errors are distinct and redact transport text", async () => {
  const failure = { content: [{ type: "text", text: "Unavailable" }], isError: true };
  const binding = await bindMcpTools({ client: clientFor(failure), allowlist: ["work-read"] });
  assert.deepEqual(await binding.toolHandlers["work-read"]({ limit: 1 }), failure);
  const protocol = await bindMcpTools({ client: { ...clientFor(), async callTool() { throw Object.assign(new Error("Bearer secret"), { code: -32602 }); } }, allowlist: ["work-read"] });
  await assert.rejects(protocol.toolHandlers["work-read"]({ limit: 1 }), (error) => error.message === "MCP protocol failure (-32602)");
});

test("receiver cancellation prevents MCP execution and empty grants cause no discovery", async () => {
  let calls = 0;
  const controller = new AbortController();
  const client = { ...clientFor(), async callTool() { calls += 1; return envelope; } };
  const binding = await bindMcpTools({ client, allowlist: ["work-read"], signal: controller.signal });
  controller.abort();
  await assert.rejects(binding.toolHandlers["work-read"]({ limit: 1 }), { name: "AbortError" });
  assert.equal(calls, 0);
  const empty = await bindMcpTools({ client: { ...clientFor(), listTools() { throw new Error("must not discover"); } }, allowlist: [] });
  assert.deepEqual(empty.tools, []);
});

test("a cloud model uses the standard MCP binding through the actual bounded loop", async () => {
  const binding = await bindMcpTools({ client: clientFor(), allowlist: ["work-read"] });
  let requests = 0;
  const budget = createToolAgentBudget({ maximumRequests: 2, maximumToolCalls: 1, maximumOutputTokens: 128 });
  const result = await executeOpenAiCompatibleToolAgent({
    ...binding, provider: "fixture", endpoint: "https://example.invalid/v1/chat/completions", apiKey: "fixture",
    model: "fixture", messages: [{ role: "user", content: "Read one work item." }],
    budget, maximumOutputTokens: 64, maximumToolCalls: 1,
    fetchImpl: async (_url, request) => {
      const body = JSON.parse(request.body);
      requests += 1;
      if (requests === 2) assert.deepEqual(JSON.parse(body.messages.at(-1).content), envelope);
      const message = requests === 1
        ? { role: "assistant", content: null, tool_calls: [{ id: "read-1", type: "function", function: { name: "work-read", arguments: '{"limit":1}' } }] }
        : { role: "assistant", content: "There is one work item." };
      return new Response(JSON.stringify({ choices: [{ message }], usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } }));
    },
  });
  assert.equal(result.text, "There is one work item.");
  assert.deepEqual(result.invocations[0].result, envelope);
  assert.equal(result.exchanges.length, 2);
  assert.deepEqual(budget.snapshot(), { requests: 0, toolCalls: 0, outputTokens: 0 });
});
