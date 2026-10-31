import assert from "node:assert/strict";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
    // Never read or copy the actual captured conversation, even in a full checkout. The section's own
    // data/state and data/logs are not source (the repository ignores them), and the scratch this
    // fixture is made in lies under data/state.
    // Copied entry by entry: the scratch is inside the root, which cpSync refuses before any filter runs.
    const source = (relative) => relative !== relativeStream && !relative.split("/").some(part => part === "node_modules" || part === ".git")
      && !/^data\/(state|logs)(\/|$)/u.test(relative);
    const entries = (dir) => readdirSync(path.join(root, dir)).map(name => dir ? `${dir}/${name}` : name);
    for (const relative of [...entries("").filter(entry => entry !== "data"), ...(existsSync(path.join(root, "data")) ? entries("data") : [])].filter(source))
      cpSync(path.join(root, relative), path.join(fixture, relative), { recursive: true, filter: (from) => source(path.relative(root, from).split(path.sep).join("/")) });
    const sentinel = path.join(fixture, relativeStream);
    mkdirSync(path.dirname(sentinel), { recursive: true });
    writeFileSync(sentinel, '{"e":"synthetic-session","a":"uttered","v":"pack boundary sentinel"}\n');
    const rule = path.join(fixture, ignore);
    assert.equal(readFileSync(rule, "utf8").split("\n").filter(line => line && !line.startsWith("#")).join("\n"), "/capturing.jsonl");
    const cache = path.join(temporary, "npm-cache");
    // The parent package ships no lib/legacy tree at all (`files`, since 0.2.6); the Cairn package
    // ships its own carriers and leaves out only the capture stream.
    const parent = pack(fixture, cache);
    assert.ok(!parent.some(file => file.path.includes("/lib/legacy/")), "the parent pack holds no legacy tree");
    const cairn = path.join(fixture, legacy);
    const protectedList = pack(cairn, cache);
    rmSync(rule);
    const original = pack(cairn, cache);
    assert.ok(original.some(file => file.path === stream), "the sentinel must prove the original inclusion");
    assert.deepEqual(protectedList, original.filter(file => file.path !== stream), "only the actual stream's path may leave the complete native inventory");
    assert.ok(protectedList.some(file => file.path.endsWith("capturing.schema.json")));
    assert.ok(protectedList.some(file => file.path.endsWith("scripts/capturing.mjs")));
    assert.ok(protectedList.some(file => file.path === "package.json"));
    const protectedLists = [parent];
    assert.ok(existsSync(sentinel), "packaging does not delete instance custody");
    const manifest = JSON.parse(readFileSync(path.join(fixture, "package.json"), "utf8"));
    for (const target of [...Object.values(manifest.exports), ...Object.values(manifest.bin)]) {
      assert.ok(protectedLists[0].some(file => file.path === target.replace(/^\.\//u, "")), `published entrypoint retained: ${target}`);
    }
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});
