---
date: 2026-05-28
kind: derivation
$thing: claude-code-harness
---

# Self-studying claim-lattice: memory as settled consensus, not stored assertion

## The frame (emsenn)

Input dissolves into many small claims (this is that; that is part of that).
Committed claims (positing, knowledge-order join) ARE the knowledge-lattice. settling resolves the lattice: the consistent core is true, and every contradiction (top) is not a terminal but a DEMAND that kicks the swarm to add claims (read files, infer) until a subject's truth is acceptable within threshold.
Crucially, the SESSION itself is a subject of study: the swarm settles claims about what a session established, and only the settled truth is projected into context.
Memory is therefore SETTLED consensus, never asserted -- which is the final form of the drift cure: nobody writes memory, the swarm settles it against the files.

## What was built (additive; nothing thrown out)

Inside the claude-code carrier, under `hacking/studying/`: - `claim-record` (object): one observer's FOUR value for a subject, with evidence (provenance). - `studied-subject` (object): a subject after settling -- consensus (knowledge-order meet), truth (resolved FOUR; top if still contradictory after budget), confidence, accepted, rounds, claimCount. - `studying` (morphism): subject + claim-record[] + swarm -> studied-subject.
Contradiction = demand; the injected swarm satisfies it by positing more claims; re-settle until accepted or budget spent. - `lifecycle.studySubject`: runs studying and posts the accepted truth as a memory row -- and ONLY when accepted.
An unsettled (contradictory) subject is not written; its contradiction stays open.

## Honest boundary: the Laplacian is NOT done here

emsenn corrected an overreach: I had labelled a hand-rolled dispersion sum a "sheaf Laplacian / H^1."
It is not.
The real consensus/disagreement measure -- the sheaf Laplacian over the observer network sheaf (`moduli-descent-laplacian`; Hansen-Ghrist, the same apparatus the `swarm` schema cites) -- is a separate, derived thing and is DEFERRED, not reimplemented.
What `studying` uses now is an explicit STUB: acceptance by `|mean truth-lean| >= threshold`, with a crude `dissent` dispersion number that is labelled, in code and schema, as NOT the Laplacian.
Wiring the real measure in is the next pass; until then this is admitted, not claimed.

## Verified facts

`npm test` green.
The studying laws: unanimous claims settle in 0 rounds with 0 dissent; a true/false split is contradictory (truth=top) and emits a demand; the swarm RESOLVES the split into accepted true as it posts trues from files (rounds > 0, claimCount grows); the round budget bounds the loop (an exhausted swarm leaves the subject top); `studySubject` posts memory ONLY for accepted subjects.
Demo: `node lifecycle.mjs --study <subject>` shows a true/false contradiction resolved by swarm into an accepted settled truth.

## Admitted (`hacking/`), flagged

- The morphism name `studying` and `claim-record`/`studied-subject` as objects (coinages).
- The acceptance heuristic is a stub; the real sheaf-Laplacian consensus is the deferred wire-in.
- Threshold/budget are fixed demo values; governing them by the real operations/budget math is later.
