---
name: review-service-data-custody
description: Classify service data by operational role and verify its producer, consumers, provenance, and retention needs before moving, converting, or deleting records and logs.
---

# Review service data custody

Use this skill before changing files under a service's `data/` tree or turning
session output into repository data. Treat the directory name, extension, and
an agent-authored record's claims as leads, not proof of durable custody.

## Classify before disposition

Classify each carrier from its content, producer, consumers, and update model.
Do not force one label onto a mixed carrier: classify its durable claims,
operational events, living knowledge, and session telemetry separately, then
split or induct them before retiring the wrapper.

- **Durable record or state**: authoritative facts, decisions, identities, or
  current operational state with a defined producer, receiver, and replacement
  rule. A dated filename does not make session narration a durable record.
- **Operational service log**: append-only observations or events emitted by a
  capability during operation, where entry order and event time matter. Prefer
  a producer-owned JSONL log whose entries use the repository's existing EAVT
  event contract; locate that contract rather than inventing field names.
- **Living knowledge carrier**: maintained prose, questions, hypotheses,
  definitions, or models whose current meaning matters more than event replay.
  These need a stable knowledge address and revision path, not a round number.
- **Ephemeral agent or session exhaust**: planning rounds, work queues,
  handoffs, snapshots, or commentary whose only durable fact is that an agent
  happened to perform a session. A useful claim buried in exhaust should be
  inducted into its actual record, log, or knowledge carrier rather than used
  to preserve the whole session artifact.

Classification is not disposition. Before moving, converting, or deleting:

1. identify the actual emitting script, package, agent workflow, or human
   procedure and the event that caused the write;
2. find direct readers, imports, subprocess callers, path references, indexes,
   and generated projections, using indexed package and vault surfaces before
   bounded filesystem search;
3. establish the provenance needed to interpret or reproduce the carrier,
   including timestamps, sources, and any authoritative inputs it summarizes;
4. compare newer carriers and live state to determine whether it is superseded;
   and
5. state what information would be lost by each proposed disposition.

No textual consumer hit proves only that no textual consumer was found. It does
not by itself authorize deletion; check runtime conventions and human custody.

## Assign custody by the producing capability

Seat an operational log with the capability that emits the events, not merely
with the domain that later reads them. A question-engineering capability owns
the construction, identity, status transitions, and recording of questions;
science services can consume the resulting question stream and publish science
knowledge without owning the producer or its operational log. Generic
Markdown, JSON, JSONL, or EAVT machinery remains an upstream dependency of the
domain producer.

For each surveyed carrier, report its classification, producer, consumers,
provenance, retention need, canonical destination or replacement, information
loss, and one disposition:

- **keep** in current custody;
- **convert** into a named owner and format while retaining provenance;
- **move after consumer migration**;
- **extract durable claims, then retire the session carrier**; or
- **delete after proving it is unconsumed, non-authoritative, and contains no
  uninducted durable claim**.

Never infer deletion authority from apparent ephemerality. Do not create a new
service, schema, journal, or archive merely to avoid deciding what the data is.

## Crypto-capital observation and execution custody

Apply this boundary before retaining wallet inventories, chain snapshots,
strategy runs, transaction plans, or execution evidence. Secret material is
not service data: mnemonics, private keys, seed-derived material, signing
requests containing hidden key references, authenticated headers, and raw
wallet-provider exports must never enter `data/`, test fixtures, logs, reports,
or command captures. Retain only a reviewed credential alias and safe
`present`/`absent` status; a public address may be retained only when it was
already admitted to the principal's public account register, never when it was
derived during an ordinary census.

Classify and keep these carriers separate:

| Carrier | Durable minimum | Custody rule |
| --- | --- | --- |
| public account register | principal, stable wallet alias, public address, chain namespace, documented derivation metadata, authority status | principal/custody owner; no secret or claim of control from presence |
| chain observation | observer/revision, chain ID, block number/hash/finality, public account alias, typed asset/position facts, contract and price provenance, observation time, refusal/unknown fields | observation capability; immutable snapshot, never silently overwritten as current state |
| strategy or simulation result | exact input-snapshot IDs, code/model revision, assumptions, costs, seed when relevant, output and rejection reason | strategy-science owner; does not become mandate or transaction intent |
| transaction intent and simulation | mandate/tranche ID, bounded action, verified contracts, calldata digest, value/gas/slippage/loss caps, simulation block/result, expiry and approval state | execution-control owner; no signature and no broadcast claim |
| signing/broadcast/confirmation witness | intent ID, signer alias only, public transaction hash, chain ID, broadcast and inclusion/finality observations, replacement/reorg relation | signer/execution witness owner; never raw signed transaction bytes when the existing witness contract can retain a digest |
| position/performance accounting | joined opening/closing witnesses, realized cash flows, fees/gas/borrow/rewards, valuation sources/times, unresolved liabilities | accounting owner; derived from joined evidence, not copied wallet UI totals |

One file must not act as mutable “current wallet state,” strategy notebook,
approval queue, and execution log at once. Join carriers with stable IDs and
content digests. Preserve contradictory observations as separate snapshots;
never repair a mismatch by editing historical balances or reusing a newer
price/block tag. Raw RPC/indexer responses are ephemeral diagnostic material
unless a reproducibility requirement names a bounded redacted fixture; prefer
typed normalized facts plus endpoint class and response digest, and remove
headers, query credentials, provider account metadata, spam-token payloads,
and unbounded token/NFT metadata before durable admission.

Forward-test with synthetic addresses and transactions only. Show that a
snapshot rejects mixed chain IDs or unjoined block identities; an unknown
contract remains `unverified discovery`; a strategy result cannot be consumed
as an intent without a mandate/tranche reference; an intent expires or refuses
when its snapshot is stale; and a witness joins the same intent and public
transaction hash without serializing any mnemonic, private key, credential
value, raw signed transaction, or authenticated provider response. A test that
uses a real `.env`, wallet export, live signing request, or real transaction is
a failing custody assay.

## Video-generation and publication custody

Apply this assay when channel automation changes generation providers or moves
from hosted notebooks/models to local Docker rendering. Keep the binary work
product separate from the small facts required to operate safely.

Classify an MP4, WAV, image sequence, render cache, downloaded source, and
Docker build layer as **ephemeral work product** unless a named receiver
requires it as a published or archival master. They belong in an explicit
job-scoped work directory outside source control, have bounded retention, and
must be cleaned only after the channel has durably recorded the outcome.
Their retention is not justified by their filename, apparent importance, or
the fact that a publication failed. If a master must be retained, identify the
archive owner, storage address, integrity digest, access boundary, retention
rule, and deletion authority before moving it out of the work area.

Classify a compact publication receipt as **durable operational state** only
when it has a named producer and receiver and contains the facts needed to
make retries safe: channel identity, source/admission digest, generator/image
version or render-plan digest, artifact digest, attempt time, YouTube upload
or publication ID/status, and replacement/idempotency rule. It must never
contain OAuth refresh/access tokens, raw client secrets, or the binary itself.
A plain successful-run log is not an idempotency receipt; a receipt without a
channel binding cannot safely prevent cross-channel duplicate publication.

Treat OAuth tokens, client-secret files, and refreshable credentials as
**secrets under the channel publication authority**, not channel data and not
shared generator configuration. The shared local generator may receive
approved content inputs and write a temporary artifact, but must not read,
copy, log, mount by default, or retain any channel credential or durable
publication state. Each channel wrapper alone binds its secret reference,
channel selector, work directory, and receipt store.

Before any conversion or cleanup, trace this chain for each channel:

`admitted source -> render plan -> ephemeral artifact -> channel upload -> durable receipt -> retry/reconciliation`.

Name the producer and reader at every arrow. A failed upload keeps the minimum
work product only for the declared retry window and preserves a failure receipt
without credential material; a successful upload permits work-product cleanup
only after the durable receipt is committed to its canonical state owner (or
the archive handoff is verified). Do not use one shared `state/` tree for five
channels merely because the renderer is shared: state is shareable only when
the producer, receiver, idempotency namespace, and authorization boundary are
all genuinely shared.

Forward-test with a temporary work directory and redacted fixtures: assert
that a success creates a small channel-bound receipt while no binary appears
in the durable state tree; a retry with the same receipt performs no second
upload; a foreign channel receipt/artifact is rejected before upload; and
cleanup removes only the known job work directory after receipt handoff. Check
Git ignore rules and Docker build context so binaries, caches, token files,
and receipts are neither accidentally committed nor silently omitted when the
contract expects a durable state handoff.
