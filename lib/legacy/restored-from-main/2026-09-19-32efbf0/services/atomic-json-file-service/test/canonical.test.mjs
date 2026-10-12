import test from "node:test";
import assert from "node:assert/strict";
import { canonicalizeJsonValue } from "../src/canonical.mjs";

test("canonicalizes objects regardless of key order", () => {
  assert.equal(
    canonicalizeJsonValue({ b: 1, a: 2 }),
    canonicalizeJsonValue({ a: 2, b: 1 }),
  );
});

test("distinguishes structurally different values", () => {
  assert.notEqual(canonicalizeJsonValue({ a: 1 }), canonicalizeJsonValue({ a: 2 }));
  assert.notEqual(canonicalizeJsonValue([1, 2]), canonicalizeJsonValue([2, 1]));
});

test("canonicalizes nested arrays and objects regardless of key order at any depth", () => {
  const left = { events: [{ matcher: "x", handler: { timeout: 5, event: "Stop" } }] };
  const right = { events: [{ handler: { event: "Stop", timeout: 5 }, matcher: "x" }] };
  assert.equal(canonicalizeJsonValue(left), canonicalizeJsonValue(right));
});

test("treats null and primitives literally", () => {
  assert.equal(canonicalizeJsonValue(null), "null");
  assert.equal(canonicalizeJsonValue(5), "5");
  assert.equal(canonicalizeJsonValue("x"), "\"x\"");
});
