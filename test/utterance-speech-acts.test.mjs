import assert from "node:assert/strict";
import test from "node:test";
import {
  SPEECH_ACT_KINDS, bindUtteranceSpeechActs, attachUtteranceSpeechActs,
} from "../src/utterance-speech-acts.mjs";

const words = "Could we make this faster? I suggest using the existing source. Please implement the correction.";
const observed = (at = "2026-10-22T19:00:00Z") => Object.freeze({
  address: "ni:///sha-256;source-" + at,
  session: "actual-carrier-session",
  at,
  carrier: "metroplat-arrival",
  text: words,
});
const span = (phrase, kind) => ({
  start: words.indexOf(phrase),
  end: words.indexOf(phrase) + phrase.length,
  kind,
});

test("bind several proposed acts to exact source passages without inferring office authority", () => {
  const source = observed();
  const acts = [
    span("Could we make this faster?", "question"),
    span("I suggest using the existing source.", "suggestion"),
    span("Please implement the correction.", "order"),
  ];
  const readout = bindUtteranceSpeechActs(source, acts, { interpretedBy: "source-reader" });
  assert.deepEqual(readout.candidates.map(c => c.proposedKind), ["question", "suggestion", "order"]);
  assert.deepEqual(readout.candidates.map(c => c.text), acts.map(a => words.slice(a.start, a.end)));
  assert.equal(readout.source.address, source.address);
  assert.equal(readout.source.session, source.session);
  assert.equal(readout.assessment, "candidate-only");
  assert.equal(readout.workAuthorized, false);
  assert.equal(readout.requirementAdmitted, false);
  assert.equal(source.speechActs, undefined, "projection must not modify original testimony");
  assert.ok(SPEECH_ACT_KINDS.includes("quotation"));
});

test("quoted orders and multiple distinct readings of a span remain candidates, not commands", () => {
  const source = observed();
  const statement = span("Please implement the correction.", "quotation");
  const proposed = bindUtteranceSpeechActs(source, [statement, { ...statement, kind: "order" }],
    { interpretedBy: "analyst" });
  assert.equal(proposed.candidates.length, 2);
  assert.deepEqual(proposed.candidates.map(c => c.proposedKind), ["quotation", "order"]);
  assert.equal(proposed.workAuthorized, false);
});

test("same words from different observed occurrences never inherit each other's classifications", () => {
  const first = observed("2026-10-22T19:00:00Z");
  const repeat = observed("2026-10-22T19:01:00Z");
  const sourceMap = { [first.address]: [span("Could we make this faster?", "question")] };
  const attached = attachUtteranceSpeechActs([first, repeat], sourceMap, { interpretedBy: "analyst" });
  assert.notEqual(first.address, repeat.address);
  assert.equal(attached[0].speechActs.candidates.length, 1);
  assert.equal(attached[1].speechActs, null, "unassessed is distinct from zero proposals");
  assert.equal(first.speechActs, undefined);
  assert.throws(() => attachUtteranceSpeechActs([repeat], sourceMap, { interpretedBy: "analyst" }),
    /unobserved or excluded source occurrence/u);
});

test("empty assessed proposal list is distinct from the unassessed state", () => {
  const first = observed();
  const assessed = attachUtteranceSpeechActs([first], { [first.address]: [] }, { interpretedBy: "analyst" });
  assert.deepEqual(assessed[0].speechActs.candidates, []);
  assert.equal(assessed[0].speechActs.assessment, "candidate-only");
  const unassessed = attachUtteranceSpeechActs([first], {});
  assert.equal(unassessed[0].speechActs, null);
});

test("only exact in-bounds source spans are usable, including Unicode scalar boundaries", () => {
  const source = observed();
  for (const invalid of [
    { start: -1, end: 5, kind: "question" },
    { start: 4, end: 4, kind: "question" },
    { start: 0, end: words.length + 1, kind: "question" },
    { start: 0.5, end: 8, kind: "question" },
    { start: 0, end: 5, kind: "new-authorized-work" },
    { start: 0, end: 5, kind: "order", approved: true },
  ]) assert.throws(() => bindUtteranceSpeechActs(source, [invalid], { interpretedBy: "analyst" }), TypeError);
  const unicode = { ...source, text: "Do 🦉 work." };
  assert.throws(() => bindUtteranceSpeechActs(unicode, [{ start: 0, end: 4, kind: "order" }],
    { interpretedBy: "analyst" }), /valid exact UTF-16/u);
  const okay = bindUtteranceSpeechActs(unicode, [{ start: 0, end: 5, kind: "order" }],
    { interpretedBy: "analyst" });
  assert.equal(okay.candidates[0].text, "Do 🦉");
});

test("bad provenance, unknown analyst, duplicate candidates or forged approval fields refuse", () => {
  const source = observed();
  const candidate = span("Please implement the correction.", "order");
  assert.throws(() => bindUtteranceSpeechActs({ ...source, at: undefined }, [candidate],
    { interpretedBy: "analyst" }), /occurrence-addressed/u);
  assert.throws(() => bindUtteranceSpeechActs(source, [candidate]), /interpretedBy/u);
  assert.throws(() => bindUtteranceSpeechActs(source, [candidate, candidate],
    { interpretedBy: "analyst" }), /repeats an earlier/u);
  assert.throws(() => attachUtteranceSpeechActs([source, source], {},
    { interpretedBy: "analyst" }), /duplicate source occurrence/u);
  assert.throws(() => bindUtteranceSpeechActs(source, [{ ...candidate, authority: "leader" }],
    { interpretedBy: "analyst" }), /exactly/u);
});


test("conflicted arrival identity cannot be given a confident speech-act label", () => {
  const source = { ...observed(), sourceOccurrence: {
    status: "ambiguous-distinct-arrival-ids-share-legacy-address",
    witnessedEventCount: 2,
  } };
  assert.throws(() => bindUtteranceSpeechActs(source,
    [span("Please implement the correction.", "order")], { interpretedBy: "reader" }),
    /original source disambiguation/u);
  const unassessed = attachUtteranceSpeechActs([source], {}, { interpretedBy: "reader" });
  assert.equal(unassessed[0].speechActs, null);
  assert.equal(source.speechActs, undefined);
});
