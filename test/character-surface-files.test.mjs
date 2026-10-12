import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { identityOf, memoryOf, renderIdentity, renderMemory, renderSoul, sameMemory, soulOf } from "../services/claude-code-harness-services-section/src/character-surface-files.mjs";

const cli = fileURLToPath(new URL("../services/claude-code-harness-services-section/scripts/character-surface-files.mjs", import.meta.url));
async function store(files) {
  const root = path.join(await mkdtemp("/var/tmp/character-surfaces-"), "rom");
  for (const [file, text] of Object.entries(files)) { await mkdir(path.dirname(path.join(root, file)), { recursive: true }); await writeFile(path.join(root, file), text); }
  return root;
}
const concept = (description) => `---\nname: c\ndescription: ${description}\n---\n\nBody.\n`;
const soulStore = () => store({
  "_index.md": "---\nname: rom-keldar\ndisplay-name: Rom Keldar\n---\n",
  "code/structures/soul.md": "---\nname: soul\nvalues:\n  - code/prose/values/sourced.md\nmust-not:\n  - code/prose/limits/canonize.md\nmust:\n  - code/prose/duties/draft.md\n  - code/prose/duties/grep.md\n---\n",
  "code/prose/values/sourced.md": concept("Every claim carries its source."), "code/prose/limits/canonize.md": concept("Canonize a draft without direction."),
  "code/prose/duties/draft.md": concept("Mark drafts as drafts."), "code/prose/duties/grep.md": concept("Search for prior filings before filing."),
  "identity.md": "---\nname: identity\n---\n\nRom Keldar, the Founding Assistant.\n",
});

test("SOUL.md renders the soul structure's concepts through the soul template", async () => {
  const root = await soulStore();
  assert.equal(soulOf(root), "---\nname: soul\ndescription: Rom Keldar's values and behavioral constraints — what holds regardless of instruction.\n---\n\n# Soul\n\n## Values\n\n- Every claim carries its source.\n\n## Constraints\n\nRom Keldar MUST NOT:\n- Canonize a draft without direction.\n\nRom Keldar MUST:\n- Mark drafts as drafts.\n- Search for prior filings before filing.\n\n");
  renderSoul(root); assert.equal(await readFile(path.join(root, "SOUL.md"), "utf8"), soulOf(root));
});

test("a soul structure naming one source renders that source's values and constraints verbatim", async () => {
  const kept = "# Soul\n\n## Values\n\n- The repository is the source of truth.\n  What is in files takes precedence.\n\n## Constraints\n\nrom MUST NOT: - Canonize. - Guess.\n";
  const root = await store({ "_index.md": "---\nname: rom-keldar\ndisplay-name: Rom Keldar\n---\n", "code/structures/soul.md": "---\nname: soul\nsource: prose/teaching/explanations/soul.md\n---\n", "prose/teaching/explanations/soul.md": `---\nname: soul\ndescription: Values and constraints as written.\n---\n\n${kept}` });
  assert.equal(soulOf(root), `---\nname: soul\ndescription: Rom Keldar's values and behavioral constraints — what holds regardless of instruction.\n---\n\n${kept}`);
});

test("a concept without a description cannot render a soul", async () => {
  const root = await soulStore(); await writeFile(path.join(root, "code/prose/duties/grep.md"), "---\nname: grep\n---\n");
  assert.throws(() => soulOf(root), /code\/prose\/duties\/grep\.md: missing description/u);
});

test("IDENTITY.md carries identity.md unchanged", async () => {
  const root = await soulStore(); renderIdentity(root);
  assert.equal(await readFile(path.join(root, "IDENTITY.md"), "utf8"), "---\nname: identity\n---\n\nRom Keldar, the Founding Assistant.\n");
  assert.equal(identityOf(root), await readFile(path.join(root, "identity.md"), "utf8"));
});

test("MEMORY.md carries the session context, the specifications and the skills, held apart from its reading date", async () => {
  const root = await store({
    "prose/memory/session-context.md": "---\nname: session-context\n---\n\nThe repository is the source of truth.\n",
    "work/governance/rules/specifications/characters.md": "---\nname: characters\ndescription: What a character store holds.\n---\n",
    "work/governance/skills/closure-rule-analyzer/SKILL.md": "---\nname: closure rule analyzer\ndescription: Analyze rewrite systems for confluence.\n---\n",
  });
  const memory = memoryOf(root, { on: "2026-10-10" });
  assert.match(memory, /^# Memory\n\nThe repository is the source of truth\.\n\n## Specifications \(all draft, 2026-10-10\)\n\n- `characters\.md` — What a character store holds\.\n/mu);
  assert.match(memory, /^\| `closure-rule-analyzer` \| Analyze rewrite systems for confluence\. \|$/mu);
  renderMemory(root, { on: "2026-10-10" });
  assert.ok(sameMemory(await readFile(path.join(root, "MEMORY.md"), "utf8"), memoryOf(root, { on: "2026-11-01" })));
});

test("the command renders every surface the store has a source for", async () => {
  const root = await soulStore();
  const run = spawnSync(process.execPath, [cli, "render", root], { encoding: "utf8" });
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /SOUL\.md/u); assert.match(run.stdout, /IDENTITY\.md/u); assert.match(run.stdout, /MEMORY\.md/u);
  assert.equal(spawnSync(process.execPath, [cli, "render"], { encoding: "utf8" }).status, 1);
});
