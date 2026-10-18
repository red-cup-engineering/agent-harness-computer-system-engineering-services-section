import assert from "node:assert/strict";
import test from "node:test";
import { deriveUtterances, utterance } from "../src/utterances.mjs";

const session = "urn:session:observed";
const at1 = "2026-10-18T14:00:00.000Z";
const at2 = "2026-10-18T14:01:00.000Z";
const prompt = (at, carrier = "codex-history", text = "Actually fabricate the missing consumer.") =>
  ({ session, at, text, carrier });

test("repeating a prompt in one session yields distinct source-positioned utterances", () => {
  const first = utterance(prompt(at1));
  const repeated = utterance(prompt(at2));
  assert.notEqual(first.address, repeated.address);
  const derived = deriveUtterances([prompt(at2), prompt(at1)]);
  assert.equal(derived.length, 2);
  assert.deepEqual(derived.map(({ at }) => at), [at1, at2]);
  assert.notEqual(derived[0].address, derived[1].address);
});

test("a second carrier observing the same source coordinate is not double counted", () => {
  const first = utterance(prompt(at1, "metroplat-arrival"));
  const second = utterance(prompt(at1, "claude-code-transcript"));
  assert.equal(first.address, second.address);
  assert.equal(deriveUtterances([prompt(at1, "metroplat-arrival"), prompt(at1, "claude-code-transcript")]).length, 1);
});

test("real UTC chronology wins over lexical display of timestamp offsets", () => {
  const earlier = "2026-10-18T09:30:00-05:00";
  const later = "2026-10-18T09:00:00-06:00";
  const derived = deriveUtterances([prompt(later), prompt(earlier)]);
  assert.deepEqual(derived.map(({ at }) => at), [earlier, later]);
});

test("an unobserved source coordinate must not be invented into a content identity", () => {
  assert.throws(() => utterance({ session, at: undefined, text: "same", carrier: "codex-history" }), /source occurrence timestamp/u);
  assert.throws(() => utterance({ session: "", at: at1, text: "same" }), /source session/u);
  assert.throws(() => utterance({ session, at: at1, text: "" }), /nonempty claim text/u);
  assert.deepEqual(deriveUtterances([prompt(undefined), prompt(at1)]).map(({ at }) => at), [at1]);
});

test("same text from one session at different source times stays distinct inside a bounded window", () => {
  assert.deepEqual(deriveUtterances([prompt(at1), prompt(at2)], { since: at2, until: at2 }).map(({ at }) => at), [at2]);
});
