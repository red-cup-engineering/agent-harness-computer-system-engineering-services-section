import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { installClaudeAsAnAgent } from "../src/install-claude-as-an-agent.mjs";

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "office-installer-"));
  mkdirSync(join(root, "content/offices"), { recursive: true });
  mkdirSync(join(root, "lib/duties"), { recursive: true });
  mkdirSync(join(root, "lib/skills/verifying-a-work-product"), { recursive: true });
  mkdirSync(join(root, "node"), { recursive: true });
  writeFileSync(
    join(root, "content/offices/verifier.json"),
    JSON.stringify({
      kind: "office",
      id: "verifier",
      name: "Verifier",
      "normative-structure": "Verifies a completed work product.",
      "bears-duty": ["emsenn/duty/attesting-a-work-product"],
    }),
  );
  writeFileSync(
    join(root, "lib/duties/attesting-a-work-product.json"),
    JSON.stringify({ id: "attesting-a-work-product", skills: ["verifying-a-work-product"] }),
  );
  writeFileSync(
    join(root, "lib/skills/verifying-a-work-product/SKILL.md"),
    "---\nname: verifying-a-work-product\n---\nVerify the work product against its stated criteria.\n",
  );
  return { root, node: join(root, "node") };
}

function argv(root, node, ...flags) {
  return [process.execPath, "install-claude-as-an-agent.js", "verifier", node, "--root", root, ...flags];
}

test("installs a canonical office as a byte-deterministic agent projection", async () => {
  const { root, node } = fixture();
  try {
    await installClaudeAsAnAgent({ argv: argv(root, node), cwd: root });
    const target = join(node, ".claude/agents/verifier.md");
    const content = readFileSync(target, "utf8");
    assert.match(content, /^---\nname: verifier\ndescription: "The Verifier office\. Verifies a completed work product\."\nmodel: sonnet\n---\n\n/);
    assert.match(content, /## The office\n\nVerifies a completed work product\.\n\n/);
    assert.match(content, /## Duties and their skills\n\n- \*\*attesting-a-work-product\*\* — discharged by: verifying-a-work-product\n\n/);
    assert.match(content, /### verifying-a-work-product\n\nVerify the work product against its stated criteria\./);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("--check confirms a fresh install and refuses drift, without writing", async () => {
  const { root, node } = fixture();
  try {
    await installClaudeAsAnAgent({ argv: argv(root, node), cwd: root });
    const target = join(node, ".claude/agents/verifier.md");
    const installed = readFileSync(target, "utf8");

    await installClaudeAsAnAgent({ argv: argv(root, node, "--check"), cwd: root });

    writeFileSync(target, "hand-edited, no longer the projection\n");
    await assert.rejects(() => installClaudeAsAnAgent({ argv: argv(root, node, "--check"), cwd: root }), /has drifted from the projection/);
    // --check makes no effect: the hand-edit is still there, untouched.
    assert.equal(readFileSync(target, "utf8"), "hand-edited, no longer the projection\n");
    assert.notEqual(readFileSync(target, "utf8"), installed);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("--check refuses an office that was never installed", async () => {
  const { root, node } = fixture();
  try {
    await assert.rejects(() => installClaudeAsAnAgent({ argv: argv(root, node, "--check"), cwd: root }), /is absent from the agent manifest/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("--clean removes the installed agent and its manifest entry", async () => {
  const { root, node } = fixture();
  try {
    await installClaudeAsAnAgent({ argv: argv(root, node), cwd: root });
    const target = join(node, ".claude/agents/verifier.md");
    await installClaudeAsAnAgent({ argv: argv(root, node, "--clean"), cwd: root });
    assert.throws(() => readFileSync(target, "utf8"), /ENOENT/);
    await assert.rejects(() => installClaudeAsAnAgent({ argv: argv(root, node, "--check"), cwd: root }), /is absent from the agent manifest/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
