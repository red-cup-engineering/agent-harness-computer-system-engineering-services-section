import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeFileAtomically, writeJsonAtomically } from "../src/write.mjs";

test("writes a new file, creating parent directories, and reports changed", () => {
  const root = mkdtempSync(join(tmpdir(), "atomic-write-"));
  try {
    const path = join(root, "nested/dir/file.txt");
    const result = writeFileAtomically(path, "hello\n");
    assert.equal(result.changed, true);
    assert.equal(readFileSync(path, "utf8"), "hello\n");
    assert.equal(statSync(path).mode & 0o777, 0o644);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("skips the write and reports unchanged when bytes already match", () => {
  const root = mkdtempSync(join(tmpdir(), "atomic-write-"));
  try {
    const path = join(root, "file.txt");
    writeFileAtomically(path, "same\n");
    const before = statSync(path).ino;
    const result = writeFileAtomically(path, "same\n");
    assert.equal(result.changed, false);
    assert.equal(statSync(path).ino, before);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("honors an explicit mode", () => {
  const root = mkdtempSync(join(tmpdir(), "atomic-write-"));
  try {
    const path = join(root, "secret.json");
    writeFileAtomically(path, "{}\n", { mode: 0o600 });
    assert.equal(statSync(path).mode & 0o777, 0o600);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("writeJsonAtomically serializes with two-space indent and a trailing newline", () => {
  const root = mkdtempSync(join(tmpdir(), "atomic-write-json-"));
  try {
    const path = join(root, "value.json");
    const result = writeJsonAtomically(path, { b: 1, a: 2 });
    assert.equal(result.changed, true);
    assert.equal(readFileSync(path, "utf8"), `${JSON.stringify({ b: 1, a: 2 }, null, 2)}\n`);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
