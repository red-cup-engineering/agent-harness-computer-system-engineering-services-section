import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { compileContext } from "../services/claude-code-harness-services-section/src/character-context.mjs";

const hook = fileURLToPath(new URL("../services/claude-code-harness-services-section/scripts/character-context-hook.mjs", import.meta.url));
const record = (name, description) => `---\nname: ${name}\ndescription: ${description}\n---\n\nBody.\n`;
async function store() {
  const root = path.join(await mkdtemp("/var/tmp/character-context-"), "rom-keldar");
  const files = {
    "code/structures/soul.md": "---\nname: soul\nvalues:\n  - prose/teaching/explanations/sourced.md\n---\n",
    "code/structures/ledger.md": record("ledger", "How the main ledger is booked and reconciled."),
    "prose/teaching/explanations/sourced.md": record("sourced", "Every claim cites its source element."),
    "prose/concepts/drafting.md": record("drafting", "Drafts stay drafts until emsenn settles them."),
    "prose/memory/2026-10-01.md": record("first", "Oldest."), "prose/memory/2026-10-02.md": record("second", "Middle."),
    "prose/memory/2026-10-03.md": record("third", "Recent."), "prose/memory/2026-10-04.md": record("fourth", "Newest."),
  };
  for (const [file, text] of Object.entries(files)) { await mkdir(path.dirname(path.join(root, file)), { recursive: true }); await writeFile(path.join(root, file), text); }
  return root;
}

test("context is the soul, the matching concepts, the recent memories and the matching lore, in lane order", async () => {
  const root = await store();
  const context = compileContext(root, "Please reconcile the ledger and cite your source for each claim");
  const labels = [...context.matchAll(/^=== (.+) ===$/gmu)].map((match) => match[1]);
  assert.deepEqual(labels, ["soul", "concept:sourced", "memory:fourth", "memory:third", "memory:second", "lore:ledger"]);
  assert.match(context, /^\[Compiled context from the rom-keldar character store\]/u);
  assert.match(context, /=== lore:ledger ===\nledger: How the main ledger is booked and reconciled\.\n/u);
  assert.doesNotMatch(context, /concept:drafting/u);
});

test("concepts from prose/concepts match too, a closer match ranks first, and an empty prompt compiles nothing", async () => {
  const root = await store();
  await writeFile(path.join(root, "prose/concepts/citing.md"), record("citing", "Cite the source element for every claim, every time."));
  const labels = [...compileContext(root, "cite the source element of every claim; drafts stay drafts").matchAll(/^=== (concept:.+) ===$/gmu)].map((match) => match[1]);
  assert.equal(labels[0], "concept:citing"); assert.ok(labels.includes("concept:drafting")); assert.ok(labels.includes("concept:sourced"));
  assert.equal(compileContext(root, "   "), "");
});

test("the hook reads the prompt payload, writes the context and never blocks", async () => {
  const root = await store();
  const run = spawnSync(process.execPath, [hook, root], { input: JSON.stringify({ prompt: "reconcile the ledger" }), encoding: "utf8" });
  assert.equal(run.status, 0); assert.match(run.stdout, /=== lore:ledger ===/u);
  const broken = spawnSync(process.execPath, [hook, root], { input: "not json", encoding: "utf8" });
  assert.equal(broken.status, 0); assert.equal(broken.stdout, "");
});

test("a soul structure that names a source brings the source's text into lane 1", async () => {
  const root = await store();
  await writeFile(path.join(root, "code/structures/soul.md"), "---\nname: soul\nsource: prose/soul.md\n---\n");
  await writeFile(path.join(root, "prose/soul.md"), "---\nname: soul\n---\n\nThe repository is the source of truth.\n");
  assert.match(compileContext(root, "anything"), /source: prose\/soul\.md[\s\S]*The repository is the source of truth\./u);
});
