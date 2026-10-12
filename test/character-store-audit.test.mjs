import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { auditCharacterStore } from "../services/claude-code-harness-services-section/src/character-store-audit.mjs";
import { makeWorkItem, renderHeartbeat } from "../services/claude-code-harness-services-section/src/character-work-items.mjs";
import { renderSoul } from "../services/claude-code-harness-services-section/src/character-surface-files.mjs";

const cli = fileURLToPath(new URL("../services/claude-code-harness-services-section/scripts/character-store-audit.mjs", import.meta.url));
async function store(name, files) {
  const root = path.join(await mkdtemp("/var/tmp/character-audit-"), name);
  for (const [file, text] of Object.entries(files)) { await mkdir(path.dirname(path.join(root, file)), { recursive: true }); await writeFile(path.join(root, file), text); }
  return root;
}
const complete = (name) => ({
  [`${name}.md`]: `---\nname: ${name}\n---\n`, "DREAMS.md": "", "MEMORY.md": "", "TOOLS.md": "", "USER.md": "",
  "code/structures/soul.md": "---\nname: soul\nvalues:\n  - code/prose/values/honesty.md\n---\n", "code/prose/values/honesty.md": "---\nname: honesty\ndescription: Says what is so, sourced.\n---\n",
  "governance/skills/making-a-skill/making-a-skill.md": "---\nname: making a skill\n---\n",
  "governance/rules/specifications/characters.md": "---\nname: characters\ndescription: The character spec.\n---\n",
});

test("a complete store whose HEARTBEAT is the witness reading audits clean", async () => {
  const root = await store("rom", complete("rom"));
  makeWorkItem(root, "write-agents-md", "Write AGENTS.md.", { raisedBy: "emsenn" });
  renderSoul(root);
  const { violations, warnings } = auditCharacterStore(root);
  assert.equal(violations, 0); assert.equal(warnings, 0);
  assert.equal(spawnSync(process.execPath, [cli, root], { encoding: "utf8" }).status, 0);
});

test("missing identity, soul concepts, skill records and spec fields are violations; tags and milestones warn", async () => {
  const root = await store("rom", {
    "code/structures/soul.md": "---\nmust:\n  - code/prose/missing.md\n---\n",
    "work/governance/skills/orphan/notes.md": "", "work/governance/skills/stray.md": "",
    "work/governance/work/milestones/m1.md": "Level 2 maturity\n",
    "work/governance/rules/specifications/s.md": "---\ntype: surface\n---\n",
  });
  const messages = auditCharacterStore(root).results.map(({ level, message }) => `${level} ${message}`);
  for (const expected of ["FAIL missing identity file (rom.md)", "FAIL soul must: code/prose/missing.md not found", "FAIL skill orphan: missing orphan.md", "WARN work/governance/skills/stray.md: file at skills root (expected directory)", "WARN milestones/m1.md: contains maturity-model level framing", "FAIL spec s.md: missing name:", "FAIL spec s.md: missing description:", "WARN spec s.md: has type: field — ungrounded classification tag", "WARN HEARTBEAT.md missing"]) assert.ok(messages.includes(expected), expected);
  assert.equal(spawnSync(process.execPath, [cli, root], { encoding: "utf8" }).status, 1);
});

test("a hand-kept HEARTBEAT that disagrees with the witnesses is a violation until it is rendered", async () => {
  const root = await store("karen", { ...complete("karen"), "HEARTBEAT.md": "---\nname: heartbeat\n---\n\nNo open tasks.\n" });
  await mkdir(path.join(root, "governance/work/items"), { recursive: true });
  await writeFile(path.join(root, "governance/work/items/t1.md"), "---\nname: t1\ndescription: An open task.\n---\n");
  const before = auditCharacterStore(root);
  assert.ok(before.results.some(({ level, message }) => level === "FAIL" && message.startsWith("HEARTBEAT.md is not the witness reading") && message.includes("(1 open, 0 settled)")));
  renderHeartbeat(root); renderSoul(root);
  assert.equal(auditCharacterStore(root).violations, 0);
});

test("a hand-kept SOUL that is not the rendering of the soul structure is a violation until rendered", async () => {
  const root = await store("rom", { ...complete("rom"), "SOUL.md": "# Soul\n\nWhatever I feel like.\n" });
  assert.ok(auditCharacterStore(root).results.some(({ level, message }) => level === "FAIL" && message === "SOUL.md is not the rendering of code/structures/soul.md; render it, never keep it by hand"));
  renderSoul(root);
  assert.ok(auditCharacterStore(root).results.some(({ level, message }) => level === "pass" && message === "SOUL.md is rendered from code/structures/soul.md"));
});

test("a soul structure naming one source holds the source to exist and SOUL.md to be its rendering", async () => {
  const files = { ...complete("rom"), "code/structures/soul.md": "---\nname: soul\nsource: prose/teaching/explanations/soul.md\n---\n" };
  delete files["code/prose/values/honesty.md"];
  const root = await store("rom", files);
  assert.ok(auditCharacterStore(root).results.some(({ level, message }) => level === "FAIL" && message === "soul source: prose/teaching/explanations/soul.md not found"));
  await mkdir(path.join(root, "prose/teaching/explanations"), { recursive: true });
  await writeFile(path.join(root, "prose/teaching/explanations/soul.md"), "---\nname: soul\n---\n\n# Soul\n\n## Values\n\n- Says what is so.\n");
  renderSoul(root);
  const { results, violations } = auditCharacterStore(root);
  assert.ok(results.some(({ level, message }) => level === "pass" && message === "soul source: prose/teaching/explanations/soul.md"));
  assert.ok(results.some(({ level, message }) => level === "pass" && message === "SOUL.md is rendered from code/structures/soul.md"));
  assert.equal(violations, 0);
});
