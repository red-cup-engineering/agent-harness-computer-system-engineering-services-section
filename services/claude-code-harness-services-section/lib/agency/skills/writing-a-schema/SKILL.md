---
name: writing-a-schema
description: Writes a JSON Schema into the schema pool from data, refusing one that is unsatisfiable, self-contradictory, or names references that do not resolve; and with --check, validates every seated schema. Use when adding a record type, changing a type's contract, or proving the pool still says what it claims. A schema is a record like any other, so it is written by a script and checked by a machine rather than typed and hoped over.
requires-capabilities:
  - read
  - write
  - schema-conformance
  - realize
id: writing-a-schema

---
A schema is a record. It is not a special thing that lives outside the system
that governs records — that exemption is what let the pool reach a state where
`office.schema.json` required a key its own `properties` did not declare under
`additionalProperties: false`, which is a contract **no document can satisfy**,
sitting in the pool reading as authority.

## What it refuses, and why that is the skill

Writing JSON is trivial. These are the states a schema can reach that read as
correct and are not:

- **Unsatisfiable.** `additionalProperties: false` plus a `required` key that
  `properties` does not declare. Every document fails; the failure looks like
  the documents' fault. This has already happened here.
- **A dangling `$ref`.** A `$ref` to a `$def` that does not exist, or to a
  sibling `$id` not in the pool. The reference reads as a constraint and
  constrains nothing.
- **`$id` disagreeing with its filename.** The pool resolves a schema by the
  name it is filed under; a mismatch means a record validated against a
  contract other than the one its author named.
- **An unparseable sibling.** A schema mid-write breaks every schema that
  refs it, so the pool is checked whole rather than one file at a time.

## The validator

This script carries its own, in Node builtins, and depends on nothing. The
firm's daily operations do not run on experimental alpha software, and a
schema pool that cannot be checked without first building a submodule is a
schema pool that will not be checked.

It implements the subset this pool actually uses — type, required, properties,
additionalProperties, enum, const, pattern, minLength, minItems, minProperties,
uniqueItems, items, propertyNames, $ref, $defs, oneOf — and **refuses a schema
using a keyword it does not implement**, rather than ignoring it. Silently
ignoring an unimplemented keyword is how a schema comes to report itself
enforced while enforcing nothing.

## Run it

```sh
node .../write-a-schema.js --check                 # validate the whole pool
echo '{...}' | node .../write-a-schema.js          # seat a new schema
echo '{...}' | node .../write-a-schema.js --amend  # change a seated one
```

`--pool` names the pool directly. Otherwise resolution walks up from
`--from` (default: the caller's working directory), and only where that
walk finds nothing does it walk up from this script's own file location
before refusing — a bare invocation run from above the pool, such as the
repository root, still finds the pool this script is seated beside.

Input is JSON. Output is JSON.

## When NOT to use

- Not for writing a record against a schema — that is write-an-office and its
  siblings.
- Not for inventing a record type nobody asked for. A schema is a claim that a
  kind of thing exists; making one is a decision, and this only performs it.
