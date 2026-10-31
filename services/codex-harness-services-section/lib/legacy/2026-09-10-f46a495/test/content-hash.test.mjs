import assert from "node:assert/strict";
import test from "node:test";

import { fileKey, identify, identifyBytes } from "../src/content-hash.mjs";

test("identify is deterministic for the same value", () => {
  const a = identify({ x: 1, y: 2 });
  const b = identify({ x: 1, y: 2 });
  assert.equal(a.id, b.id);
  assert.match(a.id, /^ni:\/\/\/sha-256;[A-Za-z0-9_-]{43}$/u);
});

test("identify differs for different values", () => {
  const a = identify({ x: 1 });
  const b = identify({ x: 2 });
  assert.notEqual(a.id, b.id);
});

test("identifyBytes is deterministic for the same bytes", () => {
  const a = identifyBytes(Buffer.from("hello"));
  const b = identifyBytes(Buffer.from("hello"));
  assert.equal(a.id, b.id);
});

test("fileKey rejects a token that is not a canonical NI identity", () => {
  assert.throws(() => fileKey("not-an-identity"), TypeError);
});

test("fileKey round-trips into a stable hex string", () => {
  const { id } = identify({ any: "value" });
  const key = fileKey(id);
  assert.match(key, /^[0-9a-f]+$/u);
  assert.equal(fileKey(id), key);
});
