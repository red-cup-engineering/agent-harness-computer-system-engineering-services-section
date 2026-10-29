import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import { budgetOfRoute, contextLines, resolveIngress, resolveSessionBudget, sessionMeter, stoppedForBudget, taskRootOf, tokensDrawn } from "../src/carrier/flow-bounds.mjs";
import { proposalContext, workContext } from "../src/carrier/work-context.mjs";
import { scratchRoot } from "./support/scratch.mjs";

const dialect = Object.freeze({ label: "fixture", pool: "fixture-provider" });
const scratch = (t) => {
  const root = mkdtempSync(path.join(scratchRoot(), "flow-bounds-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
};

test("a session budget is the caller's, else the dialect's, else the environment's, and never unbounded", () => {
  assert.deepEqual({ ...resolveSessionBudget(dialect, { turns: 3, tokens: 900 }, {}) }, { turns: 3, tokens: 900 });
  assert.deepEqual({ ...resolveSessionBudget({ ...dialect, budget: { turns: 6, tokens: 5000 } }, { turns: 2 }, {}) }, { turns: 2, tokens: 5000 });
  assert.deepEqual({ ...resolveSessionBudget(dialect, undefined, { METROPLAT_FIXTURE_PROVIDER_SESSION_TURNS: "4", METROPLAT_FIXTURE_PROVIDER_SESSION_TOKENS: "700" }) }, { turns: 4, tokens: 700 });
  // Infinity is not a budget: the carrier configuration answers for it.
  assert.equal(resolveSessionBudget({ ...dialect, budget: { turns: 6, tokens: 5000 } }, { turns: Infinity, tokens: Infinity }, {}).turns, 6);
  assert.throws(() => resolveSessionBudget(dialect, { turns: Infinity, tokens: 10 }, {}), /finite turns budget/u);
});

test("a route's token budget becomes the session's token budget", () => {
  assert.deepEqual({ ...budgetOfRoute({ share: 0.2, amount: 12345.9, unit: "token" }, { turns: 4 }) }, { turns: 4, tokens: 12345 });
  assert.deepEqual({ ...budgetOfRoute({ share: 0.2, amount: 3, unit: "flash-turn" }) }, {});
  assert.deepEqual({ ...budgetOfRoute({ share: null, amount: null, unit: "token" }, { turns: 2 }) }, { turns: 2 });
});

test("the meter counts launched turns and drawn tokens, keeps them in the task directory and says when the budget is spent", (t) => {
  const root = scratch(t);
  const meter = sessionMeter(dialect, root, { budget: { turns: 3, tokens: 100 } });
  assert.equal(meter.exhausted(), undefined);
  meter.charge({ usage: { input_tokens: 30, output_tokens: 10, cached_input_tokens: 9_000_000 } });
  assert.equal(meter.exhausted(), undefined);
  assert.deepEqual({ ...meter.drawn() }, { turns: 1, tokens: 40 });
  // A recovery opens the same task and finds what it drew; the budget is not renewed.
  const again = sessionMeter(dialect, path.join(root, "turns", "turn-000001"), { budget: { turns: 3, tokens: 100 } });
  assert.deepEqual({ ...again.drawn() }, { turns: 1, tokens: 40 });
  again.charge({ usage: { output_tokens: 70 } });
  assert.match(again.exhausted(), /110 of 100 tokens/u);
  assert.equal(taskRootOf(path.join(root, "turns", "turn-000002")), root);
  const stopped = stoppedForBudget(dialect, { ok: true, errors: [] }, again.exhausted());
  assert.equal(stopped.ok, false);
  assert.match(stopped.errors[0], /budget spent/u);
});

test("a dialect reads its own turn's tokens", () => {
  assert.equal(tokensDrawn({ tokensOf: (usage) => usage.n * 2 }, { n: 4 }), 8);
  assert.equal(tokensDrawn(dialect, { input_tokens: 5, output_tokens: 7, reasoning_output_tokens: 3, cached_input_tokens: 1e9 }), 15);
  assert.equal(tokensDrawn(dialect, undefined), 0);
});

test("an ingress ceiling is a parameter of the carrier, never assumed", () => {
  assert.deepEqual({ ...resolveIngress({ ...dialect, ceiling: 800, bytesPerToken: 4 }) }, { ceiling: 800, bytesPerToken: 4 });
  assert.deepEqual({ ...resolveIngress({ ...dialect, ceiling: 800, bytesPerToken: 4 }, { ceiling: 50 }) }, { ceiling: 50, bytesPerToken: 4 });
  assert.throws(() => resolveIngress(dialect, { bytesPerToken: 4 }, {}), /context ceiling/u);
  assert.throws(() => resolveIngress({ ...dialect, ceiling: 10 }, {}, {}), /bytesPerToken/u);
});

test("context within the ceiling is inlined as before; the rest is written once and named by path, digest and summary", (t) => {
  const directory = scratch(t);
  const small = { verb: "work-open" };
  const large = { blob: "x".repeat(40_000) };
  const lines = contextLines([
    { key: "small", label: "Small thing", value: small },
    { key: "large", label: "Large thing", value: large, summary: "one blob" },
  ], { ceiling: 100, bytesPerToken: 4, directory });
  assert.equal(lines.get("small"), `Small thing: ${JSON.stringify(small)}`);
  const text = JSON.stringify(large);
  const digest = createHash("sha256").update(text).digest("hex");
  const line = lines.get("large");
  assert.ok(!line.includes("xxxx"), "the large value is not in the prompt");
  assert.ok(line.length - directory.length < 600);
  assert.match(line, new RegExp(`sha256 ${digest}`, "u"));
  assert.match(line, /Summary: one blob/u);
  const file = path.join(directory, "context", `large-${digest.slice(0, 16)}.json`);
  assert.ok(line.includes(file));
  assert.equal(readFileSync(file, "utf8"), text);
  // The same context again writes nothing new.
  contextLines([{ key: "large", label: "Large thing", value: large }], { ceiling: 100, bytesPerToken: 4, directory });
  assert.equal(readdirSync(path.join(directory, "context")).length, 1);
});

test("the ceiling bounds the inlined context in total, smallest first", (t) => {
  const directory = scratch(t);
  const lines = contextLines([
    { key: "a", label: "A", value: "a".repeat(400) },
    { key: "b", label: "B", value: "b".repeat(400) },
    { key: "c", label: "C", value: "c".repeat(40) },
  ], { ceiling: 120, bytesPerToken: 4, directory });
  assert.equal(lines.get("c"), `C: ${"c".repeat(40)}`);
  assert.equal(lines.get("a"), `A: ${"a".repeat(400)}`);
  assert.match(lines.get("b"), /not inlined/u);
});

test("an allocated duty's 80 KB method contracts and 111 KB signed Action are named, not inlined", (t) => {
  const directory = scratch(t);
  const item = {
    methodResources: Array.from({ length: 40 }, (_, i) => ({ verb: `verb-${i}`, input: { contract: "c".repeat(2000) } })),
    signedAction: { kind: "action", resources: Array.from({ length: 30 }, (_, i) => ({ id: `r${i}`, witness: "w".repeat(3600) })) },
    governing: [{ term: "t", revision: "r1" }],
    source: "a plain source string",
  };
  const ingress = { ceiling: 6000, bytesPerToken: 4 };
  const context = workContext(item, { ingress, directory });
  const prompt = [...context.values()].join("\n");
  assert.ok(Buffer.byteLength(prompt) < 4000 + 4 * directory.length, `prompt context is ${Buffer.byteLength(prompt)} bytes`);
  assert.match(context.get("method-resources"), /40 Resources: verb-0, verb-1/u);
  assert.match(context.get("signed-action"), /30 witnessed Resources/u);
  assert.equal(context.get("governing"), `Canonical governing terms at allocation, with their source revisions: ${JSON.stringify(item.governing)}`);
  assert.equal(context.has("source"), false);
  assert.equal(readdirSync(path.join(directory, "context")).length, 2);
});

test("a receiver is given a large proposal by reference and a small one in the prompt", (t) => {
  const directory = scratch(t);
  const ingress = { ceiling: 500, bytesPerToken: 4 };
  const small = { receipt: "r", scope: "s", work: "w" };
  assert.equal(proposalContext(small, { ingress, directory }), `Review only this exact immutable proposal: ${JSON.stringify(small)}`);
  const large = { receipt: "r2", scope: "s2", work: "w".repeat(30_000), origin: { office: "o" } };
  const line = proposalContext(large, { ingress, directory });
  assert.ok(line.length - directory.length < 900);
  assert.match(line, /"receipt":"r2"/u);
  assert.equal(readdirSync(path.join(directory, "context")).length, 1);
});
