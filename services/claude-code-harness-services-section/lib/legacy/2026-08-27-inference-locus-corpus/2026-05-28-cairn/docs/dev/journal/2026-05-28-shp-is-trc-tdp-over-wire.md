---
date: 2026-05-28
kind: derivation
$thing: claude-code-harness
---

# SHP is a TRC/TDP over the wire (the operational, Scott-continuous inhabitant)

## The correction

I had built SHP as script-free (SHP.md §6).
That is only the FINITE inhabitant. emsenn: SHP can carry scripts -- including the schema + scripts is how SHP becomes a TRC/TDP packaged over the wire, and that is what makes it Scott-continuous, if the recipient is capable.

## The duality (RESEARCH-LEDGER.md)

"TRC and TDP are one on-disk object read in two ways."
The TRC reading is the memory contract (co-located schema + trace-log witnesses; morphisms have script witnesses).
The TDP reading is the SAME tree as the running Theory Derivation Program (closure-rule scripts execute by iteration to a least fixed point).
So:

- ship only the settled data -> the TRC/finite reading (settled rows, nothing to run);
- ship the schema + scripts too -> the TDP/program reading -- the recipient can RUN the closure rules and continue the derivation.
  That execution is what makes the packet Scott-continuous.

## Built (`projecting`)

Two inhabitants, marked by `data-regime`: - **finite** (`project(claims)`): data spans only -- `class`=morphism, `data-e/a/v`=coordinates.
No scripts. - **scott-continuous** (`project(claims, { operational, schemas, morphisms })`): also embeds each morphism's schema and script as NON-EXECUTABLE `<script>` blocks (`application/schema+json`, `application/spotcomp-morphism+javascript`).
A browser never runs these (inspection stays script-free per SHP.md §6), but a capable SPOTCOMP recipient extracts and runs them.
Embedded source is guarded (`</` -> `<\/`) so it cannot break out of the script element.

Two readings on ingress: - `parse(html)` -> claims (the finite/memory reading; an incapable recipient stops here -- graceful degradation). - `extract(html)` -> `{ claims, schemas, scripts, regime }` (the TDP reading; a TRC/TDP lifted off the wire).

## Verified facts

`npm test` green.
A finite packet has `data-regime="finite"` and no scripts.
An operational packet has `data-regime="scott-continuous"`, embeds schema + script with non-executable types, and still parses to the same claims for an incapable recipient.
A capable recipient `extract`s the packet and **executes the embedded closure rule** (imported from a data: URL, run, correct result) -- demonstrating the packet is Scott-continuous when the recipient can run it.

## Admissions (`hacking/`, flagged)

- The embedded-script media types are candidate-unregistered names; IANA/RFC discipline is later.
- Running extracted source uses a data: import here; a hardened recipient would sandbox/capability-gate execution (governance) before running wire-delivered TDP.
- The finite-vs-scott-continuous choice is the recipient-capability question; negotiating capability over the wire is future work.
