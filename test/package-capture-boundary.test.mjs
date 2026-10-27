import assert from "node:assert/strict";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { scratchRoot } from "./support/scratch.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";

const root = fileURLToPath(new URL("../", import.meta.url));
const legacy = "services/claude-code-harness-services-section/lib/legacy/2026-08-27-inference-locus-corpus/2026-05-28-cairn";
const stream = "articulating/library/aperiodic-articulation-category/hacking/library/claude-code/capturing/capturing.jsonl";
const relativeStream = `${legacy}/${stream}`;
const ignore = `${path.posix.dirname(relativeStream)}/.npmignore`;

function pack(directory, cache) {
  const result = spawnSync("npm", ["pack", "--dry-run", "--ignore-scripts", "--json", "--offline", "--cache", cache], {
    cwd: directory, encoding: "utf8", maxBuffer: 16 * 1024 * 1024,
  });
  assert.equal(result.status, 0, result.stderr);
  const [artifact] = JSON.parse(result.stdout);
  return artifact.files.sort((a, b) => a.path.localeCompare(b.path));
}

test("native parent and Cairn packs exclude only actual capture state, preserving reusable carriers", () => {
  const temporary = mkdtempSync(path.join(scratchRoot(), "harness-capture-pack-"));
  try {
    const fixture = path.join(temporary, "source");
    // Never read or copy the actual captured conversation, even in a full checkout.
    cpSync(root, fixture, { recursive: true, filter(source) {
      const relative = path.relative(root, source).split(path.sep).join("/");
      return relative !== relativeStream && !relative.split("/").some(part => part === "node_modules" || part === ".git");
    } });
    const sentinel = path.join(fixture, relativeStream);
    mkdirSync(path.dirname(sentinel), { recursive: true });
    writeFileSync(sentinel, '{"e":"synthetic-session","a":"uttered","v":"pack boundary sentinel"}\n');
    const rule = path.join(fixture, ignore);
    assert.equal(readFileSync(rule, "utf8").split("\n").filter(line => line && !line.startsWith("#")).join("\n"), "/capturing.jsonl");
    const cache = path.join(temporary, "npm-cache");
    const contexts = [[fixture, relativeStream], [path.join(fixture, legacy), stream]];
    const protectedLists = contexts.map(([directory]) => pack(directory, cache));
    rmSync(rule);
    contexts.forEach(([directory, excluded], index) => {
      const original = pack(directory, cache);
      assert.ok(original.some(file => file.path === excluded), "the sentinel must prove the original inclusion");
      assert.deepEqual(protectedLists[index], original.filter(file => file.path !== excluded), "only the actual stream's path may leave the complete native inventory");
      assert.ok(protectedLists[index].some(file => file.path.endsWith("capturing.schema.json")));
      assert.ok(protectedLists[index].some(file => file.path.endsWith("scripts/capturing.mjs")));
      assert.ok(protectedLists[index].some(file => file.path === "package.json"));
    });
    assert.ok(existsSync(sentinel), "packaging does not delete instance custody");
    const manifest = JSON.parse(readFileSync(path.join(fixture, "package.json"), "utf8"));
    for (const target of [...Object.values(manifest.exports), ...Object.values(manifest.bin)]) {
      assert.ok(protectedLists[0].some(file => file.path === target.replace(/^\.\//u, "")), `published entrypoint retained: ${target}`);
    }
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});
