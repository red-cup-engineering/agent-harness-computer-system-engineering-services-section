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

test("the Leader's interconnected Funday ideas retain separate source passages and an explicit systems request", () => {
  // A transcribed regression fixture, not an observed ChatGPT event or native
  // Actor/session receipt. The interpreter supplies these candidate readings;
  // exact-span binding preserves them without autonomous language classification.
  const text = `Three ideas:



- Me, Myself, and I as the 5, 6, and 1 of agency, the in, out, across
- Who Owns What? becoming an ongoing desk in Koios.News, and the economic research that it requires being services we sell through bazaars and other places, as well as using ourselves
- Doing more to operationalize our concepts of rendanheyi, huidu guanli, and especially, the four colored armies.



These are interconnected because the same underlying fabrication systems should facilitate each part of improving each of these: doing a serious scientific research paper into the mathematics of agency and our mathematics; doing serious intelligence research into world economics to find the beneficial parties of services and assets in the world; doing deep agentic operations over a piece of work.



The four armies part is of especial interest to us, because right now, it feels like we mostly just have the red army building lots of code, and we would greatly benefit from more attention on the systems that build stuff, so that what we build is more conformant with the rules and less vernacular. In fact, the difference between architected and vernacular might be useful in helping understand the settlements on territories, as we see this stuff in our deeper spatiotemporal semiotics ideas from Obsmetrologia and mathematics.



---



Have Funday Sunday with this long and rambly prompt, by making the systems that take in Prompt-Messages from the Leader of the 561 Group more robust and capable - again, feeding into the metacircular self-improving we're aiming toward across almost all sessions.`;
  const source = {
    address: "test-fixture:leader-funday-interconnected-ideas",
    session: "synthetic-fixture-session", at: "2026-10-25T00:00:00Z",
    carrier: "test-fixture", text,
  };
  const phrases = [
    "Me, Myself, and I as the 5, 6, and 1 of agency, the in, out, across",
    "Who Owns What? becoming an ongoing desk in Koios.News, and the economic research that it requires being services we sell through bazaars and other places, as well as using ourselves",
    "Doing more to operationalize our concepts of rendanheyi, huidu guanli, and especially, the four colored armies.",
    "These are interconnected because the same underlying fabrication systems should facilitate each part of improving each of these",
    "right now, it feels like we mostly just have the red army building lots of code",
    "Have Funday Sunday with this long and rambly prompt, by making the systems that take in Prompt-Messages from the Leader of the 561 Group more robust and capable - again, feeding into the metacircular self-improving we're aiming toward across almost all sessions.",
  ];
  const kinds = ["idea", "idea", "idea", "suggestion", "observation", "order"];
  const proposals = phrases.map((phrase, i) => ({
    start: text.indexOf(phrase), end: text.indexOf(phrase) + phrase.length, kind: kinds[i],
  }));
  const read = bindUtteranceSpeechActs(source, proposals, { interpretedBy: "test-fixture-reader" });
  assert.deepEqual(read.candidates.map(c => c.text), phrases);
  assert.deepEqual(read.candidates.map(c => c.proposedKind), kinds);
  assert.equal(read.candidates[1].proposedKind, "idea", "a question mark in the desk title does not change the supplied reading");
  assert.equal(read.source.carrier, "test-fixture");
  assert.equal(read.workAuthorized, false);
  assert.equal(read.requirementAdmitted, false);
  assert.equal(read.assessment, "candidate-only");
  assert.equal(source.text, text);
});
