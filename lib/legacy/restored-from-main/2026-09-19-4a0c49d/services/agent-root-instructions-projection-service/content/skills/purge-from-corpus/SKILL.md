---
name: purge-from-corpus
description: Completely remove a false claim, coinage, or contaminating idea from the entire corpus when the owner says "remove X completely" / "purge X" / "X is slop, get rid of it." Total removal across ALL files and ALL contexts — live, legacy, records, logs, code, tests, comments — leaving ZERO trace. Load and execute IMMEDIATELY on such an instruction; never argue, never partial-purge, never exempt a context on the session's own reasoning.
---

# Purge from corpus

When the owner says "remove X completely," "purge X," or "X is slop, get rid
of it," that means total removal, the first time. Do not scope the purge
narrowly, exempt `lib/legacy`/append-only logs/"fiction" on your own
reasoning, or strip-and-keep instead of deleting.

## The instruction that triggers this

Any owner statement of the form "remove X completely from the corpus,"
"purge X," "X is slop / made up / a falsehood, get rid of it," "I never want
to see X again," "delete all mention of X." Treat X as if an AI had written
"monkeys have seven legs" into the tree: there is no version of it worth
keeping, no context where it is true, no hint to preserve.

## The law of total removal (do not narrow it)

1. **ALL contexts. No exemptions the owner did not name.** live tree AND
   `lib/legacy` (legacy is read-only for NORMAL work — a purge is not normal
   work, it is the owner ordering contamination out; purge law overrides the
   legacy-read-only habit); markdown, JSON, JSONL, code, tests, comments,
   fixtures, records, and append-only logs. **Append-only is overridden by a
   direct purge order** — the owner's live order beats the format convention
   (authority law). Do not spare "fiction," "historical record," "provenance,"
   or "a receipt of what we used to think" unless the owner explicitly carved
   it out. When unsure whether something is an instance of X, it is — err
   toward removal, report what you removed.
2. **Falsehood-removed-never-annotated.** Delete the false claim or replace it
   with the truth. NEVER add "corrected:", "formerly said X", a dated note, or
   any residue that names X. Zero trace: after the purge, grepping X returns
   nothing (except this skill's own description of the procedure, and any
   owner-named exception).
3. **Delete machinery built on the falsehood.** If scripts, tests, packages,
   or records exist ONLY to serve the false premise (e.g. a "recovery"
   migration for a key that was never lost), delete them wholesale — do not
   strip-and-keep a shell. If a real thing merely mentions X, excise only X
   from it.
4. **Keep only what the owner names as the truth.** Often there is a
   correct counter-rule to preserve (e.g. "keys are valid, never suggest
   rotating"). Keep exactly that; purge everything else.

## Procedure

1. Restate X and the truth that replaces it in one line (from the owner's
   words), and the owner-named exceptions if any.
2. `grep -rilE '<all surface forms of X>'` across the WHOLE tree — NO
   node_modules exclusion of the claim itself, and INCLUDE lib/legacy. Cast
   the pattern wide (synonyms, euphemisms, the coinage and its paraphrases).
3. For each hit: delete the false claim / replace with truth / delete the
   whole file if it exists only to carry X. JSON must still parse; JSONL
   per-line; tests must still pass or be deleted with their subject.
4. Re-run the grep across the WHOLE tree including lib/legacy. **Zero hits is
   the done condition** (bar owner-named exceptions + this skill). Quote the
   clean grep.
5. Commit exactly-scoped; report every file changed/deleted and the clean
   grep. No new note that names X anywhere.

## Dispatch shape

For a wide purge, one general-purpose agent with this skill and an EXPLICIT
"include lib/legacy, edit append-only, delete false-premise machinery, zero
hints, prove with clean grep" brief. Never a brief that pre-exempts a context
on the session's reasoning — only the owner exempts.
