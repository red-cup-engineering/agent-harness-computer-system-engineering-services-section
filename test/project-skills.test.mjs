// project-skills.test: the projection links exactly the skills its record names, each to its one home.

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readlinkSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { scratchRoot } from "./support/scratch.mjs";

const scratch = mkdtempSync(path.join(scratchRoot(), "project-skills-"));
process.on("exit", () => rmSync(scratch, { recursive: true, force: true }));
const SCRIPT = fileURLToPath(new URL("../scripts/project-skills.mjs", import.meta.url));

function colony(name, skills) {
  const root = path.join(scratch, name);
  for (const skill of skills) { mkdirSync(path.join(root, skill), { recursive: true }); writeFileSync(path.join(root, skill, "SKILL.md"), "---\nname: x\n---\n"); }
  return root;
}
const run = (record, root, target) => spawnSync(process.execPath, [SCRIPT, "--projection", record, "--root", root, "--write", target], { encoding: "utf8" });

test("named skills are linked to their homes and unnamed links are removed", () => {
  const root = colony("one", ["services/a-section/lib/agency/skills/first", "services/b-section/lib/agency/skills/second"]);
  const record = path.join(root, "projection.json"), target = path.join(root, ".claude", "skills");
  writeFileSync(record, JSON.stringify({ skills: ["services/a-section/lib/agency/skills/first", "services/b-section/lib/agency/skills/second"] }));
  assert.equal(run(record, root, target).status, 0);
  assert.equal(readlinkSync(path.join(target, "first")), path.join(root, "services/a-section/lib/agency/skills/first"));
  writeFileSync(record, JSON.stringify({ skills: ["services/b-section/lib/agency/skills/second"] }));
  assert.equal(run(record, root, target).status, 0);
  assert.equal(existsSync(path.join(target, "first")), false);
  assert.equal(readlinkSync(path.join(target, "second")), path.join(root, "services/b-section/lib/agency/skills/second"));
});

test("a skill without SKILL.md, a shared name or an escaping path is refused", () => {
  const root = colony("two", ["services/a-section/lib/agency/skills/same", "services/b-section/lib/agency/skills/same"]);
  const record = path.join(root, "projection.json"), target = path.join(root, ".claude", "skills");
  for (const skills of [["services/a-section/lib/agency/skills/missing"], ["services/a-section/lib/agency/skills/same", "services/b-section/lib/agency/skills/same"], ["../outside"]]) {
    writeFileSync(record, JSON.stringify({ skills }));
    assert.notEqual(run(record, root, target).status, 0);
  }
});
