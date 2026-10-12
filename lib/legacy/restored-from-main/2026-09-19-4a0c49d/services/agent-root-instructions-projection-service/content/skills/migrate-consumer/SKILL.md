---
name: migrate-consumer
description: Move the authorized consumer family to its shared models and operations, preserve real data and external contracts, and remove superseded executable mechanics.
---

# Complete the family cutover

Use this after an already-grounded decision establishes the intended capability and receiving contract.

The family includes necessary producers, consumers, and descendants sharing
meaning, operations, representations, state, or effects. It can span different
identity spaces and packages. Do not reduce a broad authorized overhaul to one
convenient caller; do not widen beyond the current request.

On any request to modify or add an operation, first census equivalent operations
and their consumers across live nonlegacy code. Route a duplicate family to the
Computer Code Development Services Lead through the COO's existing
work-allocation boundary; for JSNode, use the existing
`@red-cup-engineering/jsnode-engineering-cli` `duplication` and
`duplication-migration` capability, not a new analyzer or codemod. Treat all
equivalent implementations and consumers as one family: clean-room rewrite the
shared typed functional owner, convert persisted records once, move every
consumer, and remove copied mechanics. Do not repair or add one local copy.

## Make the cut

Before moving code, classify the named package itself: retained consumer,
shared owner, or superseded implementation to cannibalize. A decommissioned or
cannibalized package is not a repair, release, compatibility, or completion
target. Identify its real consumers before any work in it, move those consumers
directly to the retained non-decommissioned owner, verify their receivers, then
remove only the obsolete executable mechanics and pins. Do not "cut over" by
importing or re-exporting the new owner from inside the decommissioned package.
An interface-only package may retain presentation composition only; it must
not retain domain, storage, inference, or proxy logic merely to preserve its
former API.

Architecture classifications are derived nouns, not package identities. Put a
classification such as a flatfile resource operation graph in the owning
package's `keywords`; do not fabricate a package, API, or compatibility layer
solely to carry that name. Put an owned action in its services section as
`scripts/<action>-<target>.mjs`, with typed input/output at its boundary.
Reserve `apps/<name>-engine.mjs`, `-server.mjs`, `-client.mjs`,
`-platform.mjs`, and `-application.mjs` for a composed executable face; an
app does not become the owner of the actions it composes.

1. Identify real consumers and repeated mechanics through imports, exports,
   registry pins, CLI calls, configuration, generated inputs, and runtime
   resolution. Inspect the receiving owner's actual public behavior against the
   selected contract; fix observed owner defects before moving consumers.
2. Verify the selected owner's actual behavior against its contract. Keep
   justified distinct operations and required external policy around shared
   mechanics; correct unsupported drift instead of inventing compatibility options.
3. Move the family to the owner's public API. Use existing scripts, generators,
   or AST-aware codemods for decided mechanical changes; judge exceptions
   explicitly. Keep only contract-required consumer orchestration. For a
   cross-package owner use an available exact registry pin, not `file:`, a
   source-relative import, or edited `node_modules` as a bridge.
4. Remove copied mechanics, wrappers, old pins, and superseded definitions as
   consumers move. A new facade around competing implementations is incomplete.
   Update authored inputs and reproject generated consumers.
5. Verify the receiving contract, required specialized constraints, and actual
   affected consumers. Check runtime resolution and remaining duplicate
   mechanics; measure source added and removed and assess total operating cost.
   Report installation, publication, deployment, and receiver acceptance
   separately when those gates belong to the request.

## Data and scope boundaries

Preserve user data, credentials, and persisted records. In this early-alpha
system, convert each affected persisted-record family once to the retained
owner's representation and verify the conversion at its receiving boundary;
continued data access does not require keeping a bad executable implementation
or its old read/write path. Preserve Founder sources and non-retired legacy
records; move durable active records once into canonical custody before
removing the retired format and its read/write path.
Respect real external contracts throughout the cutover.

An explicit stop or scope restriction stops affected migration work. A
harness-only request changes authored harness sources and their projections;
named applications remain examples for evaluating future behavior.

## Forward cases

- Consumers with different object names but shared operations migrate together;
  one upstream implementation remains.
- A real authorization or retention difference survives as policy around shared
  mechanics; an unsupported legacy quirk does not become a compatibility mode.
- Persisted records remain accessible after their executable path is replaced.
- A harness-only request or explicit stop prevents application migration.
