---
name: reading-a-schema
description: "Reads a schema from the pool and validates data against it, returning every violation with the JSON pointer it occurred at. Use whenever anything must be checked against a contract — an office record, a skill's declarations, a term, a work item. This is the one validator: a script that carries its own copy of it will drift from the pool it claims to enforce."
requires-capabilities:
  - read
  - schema-conformance
---

One validator, one home. Every script that needs to check something against a
contract runs this one, rather than carrying its own copy — because copies
drift, and a validator that has drifted from the pool reports conformance
against a contract nobody wrote.

## It implements the keywords, so schemas can say what they mean

The pool used to be written *around* a validator that silently ignored
`allOf`, `if`, `then`, `not`, `contains`, `uniqueItems` and `format`, and
returned early on `oneOf`. Schemas were therefore written as flat conjunctions
and their real rules were pushed into `$comment` prose as "residual
obligations owned by a script" — which is to say, owned by nothing that runs.

That was backwards. A schema is the contract; the validator implements it.
This implements `allOf`, `anyOf`, `oneOf`, `not`, `if`/`then`/`else`, and
`$ref` — so `status implies succeeded-by` is a rule in the schema and not a
sentence in a comment.

An unimplemented keyword is **refused, not skipped**. A schema that reports
itself enforced while enforcing nothing is worse than no schema, because it
reads as proof.

## Run it

```sh
echo '{...}' | node .../read-a-schema.js office        # validate against office.schema.json
echo '{...}' | node .../read-a-schema.js emsenn/schema/office
node .../read-a-schema.js --list                       # every schema in the pool
node .../read-a-schema.js office --show                # print the schema
```

`--pool` names the pool directly and wins outright. Otherwise resolution
walks up from `--from` (default: the caller's working directory), and only
where that walk finds nothing does it walk up from this script's own file
location before refusing — so a bare invocation run from above the pool,
such as the repository root the standing obligation loop runs from, still
finds the pool this script is seated beside.

Exits 0 when the data conforms, 1 when it does not. Output is JSON.

## When NOT to use

- Not for writing a schema — that is writing-a-schema.
- Not for deciding what a record should say. This checks shape, never meaning.
