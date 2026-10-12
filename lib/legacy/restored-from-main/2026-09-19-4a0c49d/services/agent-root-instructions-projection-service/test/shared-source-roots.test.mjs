import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { checkSharedInstructionSources, projectSharedInstructionSources } from "../src/shared-source-roots.mjs";

test("each runtime receives its own readable sources from the installed package", () => {
  for (const runtime of [".claude", ".agents"]) {
    const target = mkdtempSync(join(tmpdir(), "shared-instructions-"));
    const options = { target, skillsPath: runtime + "/skills", rulesPath: runtime + "/rules" };
    const result = projectSharedInstructionSources(options);
    assert.ok(result.files.length > 0);
    assert.deepEqual(checkSharedInstructionSources(options), result);
    const path = join(target, runtime, "skills/mine-transcripts/SKILL.md");
    const body = readFileSync(path, "utf8");
    assert.ok(body.startsWith("---\n"));
    assert.match(body, /Generated from @red-cup-engineering/);
    assert.ok(body.includes(runtime + "/skills/mine-transcripts/scripts/"));
    if (runtime === ".agents") assert.ok(!body.includes(".claude/skills/"));
    const before = statSync(path).mtimeMs;
    projectSharedInstructionSources(options);
    assert.equal(statSync(path).mtimeMs, before);
    writeFileSync(path, "stale");
    assert.throws(() => checkSharedInstructionSources(options), /projection is stale/);
    assert.equal(readFileSync(path, "utf8"), "stale", "checking must not repair silently");
  }
});

test("projection rejects escaping or overlapping destinations before writing", () => {
  const target = mkdtempSync(join(tmpdir(), "shared-instructions-boundary-"));
  for (const skillsPath of ["../outside", "/outside", ".", "same/nested"]) {
    assert.throws(() => projectSharedInstructionSources({ target, skillsPath, rulesPath: "same" }), TypeError);
  }
});
