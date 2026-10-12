import { test } from "node:test";
import assert from "node:assert/strict";
import { lintDispatchBrief } from "../src/brief-lint.mjs";

test("flags a missing prompt", () => {
  const warnings = lintDispatchBrief({});
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /no prompt text found/);
});

test("flags a missing prompt for an empty string", () => {
  const warnings = lintDispatchBrief({ prompt: "   " });
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /no prompt text found/);
});

test("flags a short prompt", () => {
  const warnings = lintDispatchBrief({ prompt: "Fix the bug in the parser." });
  assert.ok(warnings.some((w) => /is short/.test(w)));
});

test("flags a prompt with no done-signal even when long enough", () => {
  const prompt =
    "Look through the whole authentication module and think about whether " +
    "the token refresh logic could be cleaner or more idiomatic overall.";
  const warnings = lintDispatchBrief({ prompt });
  assert.ok(warnings.some((w) => /what "done" looks like/.test(w)));
});

test("returns no warnings for a complete brief", () => {
  const prompt =
    "Fix the off-by-one error in src/pagination.mjs where the last page " +
    "of results is dropped when the total count is an exact multiple of " +
    "the page size. Add a regression test covering that exact-multiple " +
    "case. Report the exact `node --test` counts before and after the fix " +
    "so we can verify the regression is real and the fix closes it.";
  const warnings = lintDispatchBrief({ prompt });
  assert.deepEqual(warnings, []);
});

test("tolerates a missing toolInput argument", () => {
  assert.deepEqual(lintDispatchBrief(), [
    "no prompt text found -- a dispatched agent has no memory of this " +
      "conversation and needs the full brief written out",
  ]);
});
