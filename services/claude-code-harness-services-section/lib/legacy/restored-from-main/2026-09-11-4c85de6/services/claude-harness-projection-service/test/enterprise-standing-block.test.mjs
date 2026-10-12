import test from "node:test";
import assert from "node:assert/strict";
import { createEnterpriseStandingBlock } from "../src/enterprise-standing-block.mjs";

test("spliceBlock/removeBlock round-trip across all three modes, and markerIndices refuses a torn pair", () => {
  const files = new Map();
  const filesystem = {
    existsSync: (p) => files.has(p),
    readFileSync: (p) => files.get(p),
    mkdirSync: () => {},
    writeFileSync: (p, text) => files.set(p, text),
  };
  const { spliceBlock, removeBlock, markerIndices } = createEnterpriseStandingBlock({ repoRoot: "/repo", filesystem });
  const block = "<!-- installing-an-enterprise-in-claude: begin -->\nBODY\n<!-- installing-an-enterprise-in-claude: end -->\n";

  // created: the file did not exist.
  {
    const { next, mode } = spliceBlock("/repo/node/CLAUDE.md", block);
    assert.equal(mode, "created");
    assert.equal(next, block);
    assert.equal(removeBlock(next, "/repo/node/CLAUDE.md", "created"), "");
  }

  // separator: the file existed with neither marker.
  {
    files.set("/repo/node/CLAUDE.md", "# Pre-existing content\n");
    const before = files.get("/repo/node/CLAUDE.md");
    const { next, mode } = spliceBlock("/repo/node/CLAUDE.md", block);
    assert.equal(mode, "separator");
    assert.equal(next, before + "\n" + block);
    assert.equal(removeBlock(next, "/repo/node/CLAUDE.md", "separator"), before);
  }

  // in-place: re-splicing between markers already there replaces the block,
  // touching no byte on either side.
  {
    files.set("/repo/node/CLAUDE.md", "BEFORE\n" + block + "AFTER\n");
    const changed = block.replace("BODY", "CHANGED");
    const { next, mode } = spliceBlock("/repo/node/CLAUDE.md", changed);
    assert.equal(mode, "in-place");
    assert.equal(next, "BEFORE\n" + changed + "AFTER\n");
    assert.equal(removeBlock(next, "/repo/node/CLAUDE.md", "in-place"), "BEFORE\nAFTER\n");
  }

  // a torn pair (begin with no end) is refused, not repaired silently.
  assert.throws(
    () => markerIndices("<!-- installing-an-enterprise-in-claude: begin -->\nno end marker\n", "/repo/node/CLAUDE.md"),
    /holds one marker of the pair and not the other/,
  );
});

test("recordInManifest keeps the block entry singular and preserves office entries", () => {
  const files = new Map();
  const filesystem = {
    existsSync: (p) => files.has(p),
    readFileSync: (p) => files.get(p),
    mkdirSync: () => {},
    writeFileSync: (p, text) => files.set(p, text),
  };
  const { readManifest, recordInManifest, isBlockEntry } = createEnterpriseStandingBlock({ repoRoot: "/repo", filesystem });

  recordInManifest("/repo/node", "verifier");
  recordInManifest("/repo/node", "CLAUDE.md:created");
  recordInManifest("/repo/node", "CLAUDE.md:in-place");

  const entries = readManifest("/repo/node");
  assert.deepEqual(entries.filter(isBlockEntry), ["CLAUDE.md:in-place"]);
  assert.ok(entries.includes("verifier"));
});
