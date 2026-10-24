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


test("separate admitted CloudEvent IDs at one legacy timestamp do not silently become replay", () => {
  const first = { ...prompt(at1, "metroplat-arrival"), arrivalIdentity: "urn:event:a" };
  const second = { ...prompt(at1, "metroplat-arrival"), arrivalIdentity: "urn:event:b" };
  assert.equal(utterance(first).address, utterance(second).address,
    "preserve the original v2 source address pending independent source migration");
  const prior = deriveUtterances([first]);
  assert.equal(prior.length, 1);
  assert.equal(prior[0].sourceOccurrence, undefined);
  const repeated = deriveUtterances([first, { ...first }]);
  assert.equal(repeated.length, 1);
  assert.equal(repeated[0].sourceOccurrence, undefined, "one replayed CloudEvent is not another event");
  const collided = deriveUtterances([first, second]);
  assert.equal(collided.length, 1, "a legacy NI cannot falsely address two distinct occurrences");
  assert.equal(collided[0].sourceOccurrence.status,
    "ambiguous-distinct-arrival-ids-share-legacy-address");
  assert.equal(collided[0].sourceOccurrence.witnessedEventCount, 2);
  assert.deepEqual(collided[0].sourceOccurrence.sourceEventIds, ["urn:event:a", "urn:event:b"]);
  assert.equal(collided[0].sourceOccurrence.omittedEventIds, 0);
});

test("bounded collision evidence preserves count without exposing an unbounded event-id preview", () => {
  const collided = deriveUtterances(Array.from({ length: 12 }, (_, n) =>
    ({ ...prompt(at1, "metroplat-arrival"), arrivalIdentity: "urn:event:" + n })));
  assert.equal(collided.length, 1);
  assert.equal(collided[0].sourceOccurrence.witnessedEventCount, 12);
  assert.equal(collided[0].sourceOccurrence.sourceEventIds.length, 8);
  assert.equal(collided[0].sourceOccurrence.omittedEventIds, 4);
  const distinct = deriveUtterances([
    { ...prompt(at1), arrivalIdentity: "urn:event:one" },
    { ...prompt(at2), arrivalIdentity: "urn:event:two" },
  ]);
  assert.equal(distinct.length, 2);
  assert.equal(distinct[0].sourceOccurrence, undefined);
  assert.equal(distinct[1].sourceOccurrence, undefined);
  assert.throws(() => utterance({ ...prompt(at1), arrivalIdentity: "" }),
    /bounded source-reported event identity/u);
  assert.throws(() => utterance({ ...prompt(at1), arrivalIdentity: "x".repeat(513) }),
    /bounded source-reported event identity/u);
});