import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { scratchRoot } from "./support/scratch.mjs";
import path from "node:path";
import test from "node:test";
import { projectClaudeHarness } from "../services/claude-code-harness-services-section/src/claude-harness-projection.mjs";

const write = (file, text) => { mkdirSync(path.dirname(file), { recursive: true }); writeFileSync(file, text); };

/** Two sections that each hold a skill `shared-skill` and a vacant office `analyst` providing it. */
function corpusAt(root) {
  for (const section of ["alpha", "beta"]) {
    const agency = path.join(root, "services", section, "lib", "agency");
    write(path.join(agency, "skills", "shared-skill", "SKILL.md"),
      `---\nname: shared-skill\nid: shared-skill\ndescription: The ${section} way of doing the shared work.\n---\n\n# Shared skill\n\nDo the ${section} work.\n`);
    write(path.join(agency, "offices", "analyst.json"), `${JSON.stringify({
      id: "analyst", name: `${section} analyst`, kind: "office",
      "normative-structure": `The ${section} analyst does the ${section} work.`,
      "deontic-profile": { "doing-the-work": "duty" },
      "provides-skill": ["shared-skill"],
    }, null, 2)}\n`);
  }
  write(path.join(root, "services", "README.md"), "# Services\n");
  return { node: root, agencyRoot: root, agencySections: ["services/alpha", "services/beta"], settlementRoot: root };
}

test("every skill of the corpus is a native skill and every office holding skills an agent naming them, none dropped for a shared id", (t) => {
  const root = mkdtempSync(path.join(scratchRoot(), "claude-harness-corpus-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const projection = projectClaudeHarness(corpusAt(root));
  assert.deepEqual(projection.obstructions, []);
  assert.equal(projection.counts.skills, 2);
  assert.equal(projection.counts.agents, 2, "a vacant office holding skills is an agent");

  const skills = [...projection.files.keys()].filter((file) => file.startsWith(".claude/skills/")).sort();
  assert.equal(skills.length, 2);
  assert.ok(skills.includes(".claude/skills/shared-skill/SKILL.md"));
  const other = skills.find((file) => file !== ".claude/skills/shared-skill/SKILL.md");
  assert.match(other, /^\.claude\/skills\/shared-skill-[0-9a-f]{6}\/SKILL\.md$/u);
  for (const file of skills) {
    const text = projection.files.get(file);
    assert.match(text, /^---\nname: shared-skill(-[0-9a-f]{6})?\ndescription: "The (alpha|beta) way of doing the shared work\."\n---\n/u);
    assert.match(text, /Do the (alpha|beta) work\./u);
  }

  const agents = [...projection.files.keys()].filter((file) => file.startsWith(".claude/agents/")).sort();
  assert.equal(agents.length, 2);
  for (const file of agents) {
    const text = projection.files.get(file);
    assert.match(text, /\nskills:\n {2}- shared-skill(-[0-9a-f]{6})?\n/u, "an agent names its skills instead of carrying their text");
    assert.doesNotMatch(text, /Do the (alpha|beta) work\./u);
  }

  assert.match(projection.files.get(".claude/CLAUDE.md"), /^@services\/README\.md$/mu);
  assert.deepEqual(projection.hooks, {}, "no hook is projected");
  assert.deepEqual(projectClaudeHarness(corpusAt(root)).files, projection.files, "the projection is the same every time");
});
