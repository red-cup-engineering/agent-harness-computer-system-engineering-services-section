import assert from "node:assert/strict";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";

const PACKAGE_ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const INSTALLER = join(PACKAGE_ROOT, "scripts/install-codex-as-an-agent.mjs");

test("projects a canonical office duty when its named procedure is unavailable to Codex", () => {
  const root = mkdtempSync(join(tmpdir(), "codex-office-duty-"));
  try {
    const offices = join(root, "owner/offices");
    const duties = join(root, "owner/duties");
    mkdirSync(offices, { recursive: true });
    mkdirSync(duties, { recursive: true });
    writeFileSync(join(offices, "architecture.json"), `${JSON.stringify({
      kind: "office",
      id: "architecture",
      name: "Architecture",
      "normative-structure": "The office holds the architecture duty.",
      "bears-duty": ["emsenn/duty/write-architecture"],
    }, null, 2)}\n`);
    writeFileSync(join(duties, "write-architecture.json"), `${JSON.stringify({
      id: "write-architecture",
      skills: ["write-a-software-architecture-specification"],
    }, null, 2)}\n`);

    const result = spawnSync(process.execPath, [INSTALLER, join(offices, "architecture.json"), root, "--root", root, "--from", offices], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const projected = readFileSync(join(root, ".codex/agents/architecture.toml"), "utf8");
    assert.match(projected, /write-architecture/u);
    assert.match(projected, /declared procedures: write-a-software-architecture-specification; installed here: none/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("explicit shared skill custody excludes competing repository copies", () => {
  const root = mkdtempSync(join(tmpdir(), "codex-skill-custody-"));
  try {
    const office = join(root, "owner/offices/architecture.json");
    mkdirSync(join(root, "owner/offices"), { recursive: true });
    writeFileSync(office, JSON.stringify({ kind: "office", id: "architecture", name: "Architecture", "normative-structure": "Own architecture.", "provides-skill": ["procedure"] }));
    for (const [pool, text] of [["canonical", "USE_SHARED_METHOD"], ["obsolete", "STALE_METHOD"]]) {
      const dir = join(root, pool, "skills/procedure");
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, "SKILL.md"), "---\nname: procedure\ndescription: A procedure\n---\n" + text + "\n");
    }
    const result = spawnSync(process.execPath, [INSTALLER, office, root, "--root", root, "--skill-root", join(root, "canonical/skills")], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const projected = readFileSync(join(root, ".codex/agents/architecture.toml"), "utf8");
    assert.match(projected, /USE_SHARED_METHOD/);
    assert.doesNotMatch(projected, /STALE_METHOD/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("shared custody supplements both office-owned and separately duty-owned skills", () => {
  const root = mkdtempSync(join(tmpdir(), "codex-duty-owned-skills-"));
  try {
    const office = join(root, "firm/offices/code-lead.json");
    mkdirSync(join(root, "firm/offices"), { recursive: true });
    mkdirSync(join(root, "service/duties"), { recursive: true });
    writeFileSync(office, JSON.stringify({ kind: "office", id: "code-lead", name: "Code Lead", "normative-structure": "Hold code duties.", "bears-duty": ["emsenn/duty/operate"], "provides-skill": ["inspect", "normalize"] }));
    writeFileSync(join(root, "service/duties/operate.json"), JSON.stringify({ id: "operate", skills: ["operate"] }));
    for (const [pool, name, text] of [["canonical", "inspect", "CANONICAL_INSPECTION"], ["firm", "inspect", "SUPERSEDED_INSPECTION"], ["firm", "normalize", "OFFICE_NORMALIZATION"], ["service", "operate", "DUTY_OPERATION"]]) {
      const directory = join(root, pool, "skills", name);
      mkdirSync(directory, { recursive: true });
      writeFileSync(join(directory, "SKILL.md"), `---\nname: ${name}\ndescription: ${name}\n---\n${text}\n`);
    }
    const result = spawnSync(process.execPath, [INSTALLER, office, root, "--root", root, "--skill-root", join(root, "canonical/skills")], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const projected = readFileSync(join(root, ".codex/agents/code-lead.toml"), "utf8");
    for (const text of ["CANONICAL_INSPECTION", "OFFICE_NORMALIZATION", "DUTY_OPERATION"]) assert.ok(projected.includes(text), text);
    assert.doesNotMatch(projected, /SUPERSEDED_INSPECTION/u);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("adopts an unmanifested agent only when it is byte-identical to the rendered office projection", () => {
  const root = mkdtempSync(join(tmpdir(), "codex-agent-adoption-"));
  try {
    const office = join(root, "owner/offices/architecture.json");
    mkdirSync(join(root, "owner/offices"), { recursive: true });
    mkdirSync(join(root, "skills/procedure"), { recursive: true });
    writeFileSync(join(root, "skills/procedure/SKILL.md"), "---\nname: procedure\ndescription: Procedure\n---\nUSE_PROCEDURE\n");
    writeFileSync(office, JSON.stringify({ kind: "office", id: "architecture", name: "Architecture", "normative-structure": "Own architecture.", "provides-skill": ["procedure"] }));
    const args = [INSTALLER, office, root, "--root", root, "--skill-root", join(root, "skills")];
    const first = spawnSync(process.execPath, args, { encoding: "utf8" });
    assert.equal(first.status, 0, first.stderr || first.stdout);
    const target = join(root, ".codex/agents/architecture.toml");
    const manifest = join(root, ".codex/.codex-agent-manifest");
    const expected = readFileSync(target, "utf8");
    rmSync(manifest);

    const adopted = spawnSync(process.execPath, args, { encoding: "utf8" });
    assert.equal(adopted.status, 0, adopted.stderr || adopted.stdout);
    assert.match(adopted.stdout, /adopted/u);
    assert.equal(readFileSync(target, "utf8"), expected);
    assert.equal(readFileSync(manifest, "utf8"), "architecture\n");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("refuses a divergent unmanifested agent without creating a manifest", () => {
  const root = mkdtempSync(join(tmpdir(), "codex-agent-adoption-refusal-"));
  try {
    const office = join(root, "owner/offices/architecture.json");
    const target = join(root, ".codex/agents/architecture.toml");
    mkdirSync(join(root, "owner/offices"), { recursive: true });
    mkdirSync(join(root, ".codex/agents"), { recursive: true });
    mkdirSync(join(root, "skills/procedure"), { recursive: true });
    writeFileSync(join(root, "skills/procedure/SKILL.md"), "---\nname: procedure\ndescription: Procedure\n---\nUSE_PROCEDURE\n");
    writeFileSync(office, JSON.stringify({ kind: "office", id: "architecture", name: "Architecture", "normative-structure": "Own architecture.", "provides-skill": ["procedure"] }));
    writeFileSync(target, "unmanaged and divergent\n");

    const result = spawnSync(process.execPath, [INSTALLER, office, root, "--root", root, "--skill-root", join(root, "skills")], { encoding: "utf8" });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /refusing to overwrite/u);
    assert.equal(readFileSync(target, "utf8"), "unmanaged and divergent\n");
    assert.equal(existsSync(join(root, ".codex/.codex-agent-manifest")), false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
