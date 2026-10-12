import test from "node:test";
import assert from "node:assert/strict";
import { emitPerTurnDuty, readIdentity, renderContext, withTimeout } from "../scripts/emit-claude-per-turn-duty.mjs";
import { lifecycleEvent, responseOf } from "./lifecycle-event.mjs";

const actor = "actor:bZH6KBOlPVWbYpqp04izN_Xtwykn0XgsMBStm_FkPPw";
const root = "/repo";

// One admitted AgentHarnessPolicy seating one role, exactly the authored input
// the projection platform reads; the per-turn duty speaks from it.
const policy = (roles = [{ id: "executive", office: "content/offices/executive.json", character: "content/character.json", incumbency: "content/seat.json" }]) => ({
  kind: "agent-harness-policy",
  version: 1,
  actor,
  runtime: "claude",
  instructions: { source: "CLAUDE.md" },
  mcpServers: {},
  hooks: [],
  skills: [],
  roles,
});

const records = {
  "/repo/content/character.json": JSON.stringify({ id: "claude", kind: "session" }),
  "/repo/content/seat.json": JSON.stringify({ id: "seat", holder: "claude", office: "content/offices/executive.json", recognition: "t", induction: "t" }),
  "/repo/.mcp.json": JSON.stringify({ mcpServers: { "jsnode-server": { url: "http://127.0.0.1:1/mcp" } } }),
};
const readText = async (path) => {
  if (path in records) return records[path];
  throw new Error(`ENOENT: ${path}`);
};

test("a recognized role reads its actor, office, character, and incumbency off the policy's own records", async () => {
  assert.deepEqual(await readIdentity({ policy: policy(), root, readText }), {
    state: "recognized",
    actor,
    office: "content/offices/executive.json",
    character: "claude",
    incumbency: "seat",
  });
});

test("an unseated policy, an unknown role, a mismatched seat, and an unreadable record all read as unavailable", async () => {
  assert.match((await readIdentity({ policy: policy([]), root, readText })).reason, /seats no role/);
  assert.match((await readIdentity({ policy: policy(), root, roleId: "other", readText })).reason, /seats no role 'other'/);
  const halfSeated = async (path) => (path.endsWith("seat.json")
    ? JSON.stringify({ id: "seat", holder: "claude", office: "content/offices/executive.json", recognition: "t", induction: "f" })
    : readText(path));
  assert.match((await readIdentity({ policy: policy(), root, readText: halfSeated })).reason, /not recognized and inducted/);
  assert.match((await readIdentity({ policy: policy(), root, readText: async () => { throw new Error("gone"); } })).reason, /gone/);
});

test("the turn's context names every declared invocation and export, whole entries only", () => {
  const rendered = renderContext({
    metadata: { root },
    packages: [{ package: "@x/tool", packagePath: "services/tool", bins: [{ bin: "tool", target: "./scripts/tool.mjs" }], exports: ["./tool"] }],
  });
  assert.match(rendered, /invoke tool: \/repo\/services\/tool\/scripts\/tool\.mjs/);
  assert.match(rendered, /export @x\/tool\/tool/);
  assert.equal(renderContext({ metadata: {}, packages: [] }), "context: no matching declared capability");
  assert.equal(renderContext(null), "context: unavailable");
  assert.equal(renderContext({ kind: "coding-context.unavailable", reason: "down" }), "context: unavailable (down)");
});

test("a refusal keeps the sizes the projector reported, so a context-less turn is diagnosable", () => {
  assert.equal(renderContext({ kind: "coding-context.relevance.refusal", reason: "budget" }), "context: refused (budget)");
  assert.equal(
    renderContext({ kind: "coding-context.relevance.refusal", reason: "output-budget-too-small", maxBytes: 4000, requiredBytes: 5230, promptBytes: 4512 }),
    "context: refused (output-budget-too-small; needed 5230b, budget 4000b, prompt 4512b)",
  );
});

test("the deadline aborts the call it is racing", async () => {
  let aborted = false;
  await assert.rejects(() => withTimeout((signal) => new Promise((_, reject) => signal.addEventListener("abort", () => {
    aborted = true;
    reject(signal.reason);
  })), 5));
  assert.equal(aborted, true);
});

test("the turn carries its identity line and the exact prompt's capability evidence", async () => {
  let asked;
  const response = responseOf(await emitPerTurnDuty(lifecycleEvent({ event: "UserPromptSubmit", prompt: "exact prompt" }), {
    policy: policy(),
    root,
    readText,
    callContext: async (prompt) => {
      asked = prompt;
      return { metadata: { root }, packages: [{ package: "@x/tool", packagePath: "services/tool", bins: [{ bin: "tool", target: "./scripts/tool.mjs" }] }] };
    },
  }));
  assert.equal(asked, "exact prompt");
  assert.equal(response.disposition, "continue");
  assert.match(response.additionalContext, new RegExp(`^actor: ${actor}; office: `));
  assert.match(response.additionalContext, /invoke tool: \/repo\/services\/tool\/scripts\/tool\.mjs/);
});

test("an unavailable identity or capability graph is stated, never invented, and never fatal", async () => {
  const response = responseOf(await emitPerTurnDuty(lifecycleEvent({ event: "UserPromptSubmit", prompt: "p" }), {
    policy: policy([]),
    root,
    readText: async () => { throw new Error("nothing readable"); },
    callContext: async () => { throw new Error("unreachable"); },
  }));
  assert.match(response.additionalContext, /identity: unavailable \(the policy seats no role\)/);
  assert.match(response.additionalContext, /context: unavailable \(nothing readable\)/);
});

test("the whole context block stays inside its byte budget, keeping whole Unicode entries", async () => {
  const target = `${"scripts/工具-".repeat(70)}run.mjs`;
  const response = responseOf(await emitPerTurnDuty(lifecycleEvent({ event: "UserPromptSubmit", prompt: "use the matching script" }), {
    policy: policy(),
    root,
    readText,
    callContext: async () => ({
      metadata: { root },
      scripts: [{ bin: "matching", packagePath: "services/tool", target: `./${target}` }],
      packages: Array.from({ length: 100 }, (_, index) => ({ package: `@x/${"説明".repeat(30)}-${index}`, packagePath: "services/ignored", exports: ["."] })),
    }),
  }));
  const text = response.additionalContext;
  assert.ok(Buffer.byteLength(text, "utf8") <= 4000);
  assert.ok(text.includes(`invoke matching: ${root}/services/tool/${target}`));
  assert.ok(text.indexOf("invoke matching:") < text.indexOf("@x/"));
});

test("an event carrying no prompt, or naming no root, continues with nothing added", async () => {
  assert.equal(responseOf(await emitPerTurnDuty(lifecycleEvent({ event: "UserPromptSubmit" }), { policy: policy(), root })).additionalContext, undefined);
  const priorProjectDirectory = process.env.CLAUDE_PROJECT_DIR;
  delete process.env.CLAUDE_PROJECT_DIR;
  try {
    assert.equal(responseOf(await emitPerTurnDuty(lifecycleEvent({ event: "UserPromptSubmit", prompt: "p", cwd: null }), { policy: policy() })).additionalContext, undefined);
  } finally {
    if (priorProjectDirectory !== undefined) process.env.CLAUDE_PROJECT_DIR = priorProjectDirectory;
  }
});
