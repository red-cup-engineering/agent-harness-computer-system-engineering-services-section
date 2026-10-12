import assert from "node:assert/strict";
import test from "node:test";
import { readFileText } from "@red-cup-engineering/file-services/read-file";
import { walkPosixPaths } from "@red-cup-engineering/path-walking-service";
import { ACTOR } from "../src/enterprise.mjs";
import { observeArchitecturalLoci } from "../src/locus-registry.mjs";

async function readLoci(root) {
  const walk = await walkPosixPaths({ root, maxDepth: 0, extensions: [".json"] });
  const files = walk.files.filter(({ kind }) => kind === "file").map(({ path }) => path).sort();
  return Promise.all(files.map(async (name) => JSON.parse(await readFileText(`${root}/${name}`))));
}

test("the bootloader is four content-addressed loci without replacing Codex identity", async () => {
  const registry = await observeArchitecturalLoci({ readLoci });
  assert.match(registry.id, /^ni:\/\/\/sha-256;/u);
  assert.equal(registry.owner, ACTOR);
  assert.equal(registry.loci.length, 4);
  assert.equal(new Set(registry.loci.map(({ actor }) => actor)).size, 4);
  assert.ok(registry.loci.every(({ owner, status, missingFaces }) => owner === ACTOR && status === "seed-not-advertised" && missingFaces.length === 5));
});
