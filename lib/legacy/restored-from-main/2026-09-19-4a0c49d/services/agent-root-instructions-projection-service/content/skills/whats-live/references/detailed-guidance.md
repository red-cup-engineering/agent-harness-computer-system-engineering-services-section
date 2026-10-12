---
name: whats-live
description: Report what is ACTUALLY live — services, registry, MCP, deploys, and which host/edge answers a given subdomain — from reality, never from the repo's claims about itself.
---

# What's live

Every line in the report is a fact just observed, never an inference from a
README, `wrangler.jsonc`, or the org-machines record.

## Procedure

### 0. Classify claims before probing

For each requested capability, keep these claims in separate rows even when
one command happens to inform several of them:

| Claim | Required current evidence |
| --- | --- |
| candidate source | authoritative source revision and public contract |
| configured | named runtime carrier selects the capability for the named receiver/account |
| deployed | host/provider observation identifies the installed revision and process |
| operating | fresh output or protocol observation proves the process performs the capability |
| received | the downstream receiver admits the same stable event/artifact identity |
| customer/public accepted | the named receiver completes its explicit acceptance protocol |
| effect authorized | current mandate, account scope, consent, and guard permit that exact effect |

These are independent, non-monotonic facts. A systemd unit in source is not a
deployment; `active (running)` is not an operating assay; a producer's success
is not receiver admission; a broker response is not customer acceptance; and
credential presence is not effect authority. Report `not observed` or
`unjoined` at the first unsupported boundary instead of promoting a claim from
a later-looking artifact.

Every producer→receiver claim needs a two-sided join: retain the producer's
stable event/artifact ID, schema/version, principal/account binding, as-of time,
and custody location; then observe the receiver admitting that same ID (or a
content digest/replay identity), including its validation/refusal and resulting
state. Timestamp proximity, matching filenames, or both processes being active
is supporting evidence only.

### 0A. External financial services and customer trading loops

A read-only live survey of a brokerage, exchange, bank, or ancillary financial
program must not place/cancel an order, enroll/opt out, change an account,
accept terms, refresh consent, rotate credentials, or invoke a write endpoint.
Separate at least these surfaces because one healthy endpoint cannot stand for
the others: vendor product/terms, account eligibility or enrollment state,
market-data/news observation, paper execution, live execution authority,
guards and kill switches, independent witness/books, principal report, and
customer/public application.

Use a secret-name-only prerequisite probe. Start from literal expected names
found in the reviewed service contract; never dump or source an environment
file, inspect a process environment, or print values, lengths, prefixes,
hashes, token claims, headers, account identifiers derived from secrets, or
unknown variable names:

```sh
for name in EXPECTED_NAME_1 EXPECTED_NAME_2; do
  if env | cut -d= -f1 | grep -Fxq "$name"; then
    printf '%s\tpresent\n' "$name"
  else
    printf '%s\tabsent\n' "$name"
  fi
done
```

Presence means only `named binding present`. A separately authorized
least-privilege read may retain observation time, HTTP/result class, paper vs
live classification, public account suffix or stable internal alias when the
service already defines one, and safe eligibility/enrollment booleans. It must
discard authorization/request headers and raw bodies that may contain account,
position, order, tax, or personally identifying data. If no reviewed safe
observer exists, report `live broker/account state unobserved`; do not improvise
with `curl` against an authenticated endpoint.

For each loop, return evidence in this order without collapsing columns:

`source/local assay | configured | deployed revision/process | fresh operating observation | producer→receiver join | principal/customer acceptance | effect authority`

A paper account observation never upgrades a live-account row. An ancillary
program's marketing page or terms never establishes account eligibility,
enrollment, revenue, consent, or an API. A fresh broker read proves only the
fields safely observed; it does not prove the house strategy, witness, report,
or customer surface received them.

### 0B. Public-chain and crypto-position observation

Treat a wallet estate as several public observation surfaces, not as one
balance. Start only from public addresses already admitted by the principal's
account register; never derive an address, open a wallet, connect a browser
wallet, request a signature, or ask an RPC node to manage accounts. Do not call
`eth_accounts`, `personal_*`, `wallet_*`, `eth_send*`, signing, approval,
permit, swap, claim, bridge, lend, borrow, withdraw, or provider-specific
transaction methods during a live survey.

Resolve one safe/finalized block number and hash per chain and pin every
compatible read to that block. Retain chain ID, block number/hash/finality,
public account alias, observer revision, endpoint class, observation time, and
typed result or refusal. When a protocol cannot answer historically at the
pinned block, report that leg `unjoined latest observation`; do not mix it into
a coherent portfolio snapshot. Confirm chain ID and block identity from the
RPC response path itself, and compare a consequential balance/position through
a second independent public endpoint or first-party protocol observer when
available. Disagreement is a live finding, never a value to average.

For each public account, observe these rows independently where applicable:
native balance; verified fungible-token balance; NFT/receipt-token identity;
supplied collateral; borrow and accrued interest; LP/vault shares and
underlying redemption quote; pending rewards; allowances/approvals; open
orders; protocol health/liquidation boundary; and exit/claim availability.
Reconcile protocol/accounting identities before summing: a receipt token and
its underlying are one economic position, the same EVM address on two chains
is two chain accounts, and an indexer-discovered token is not verified value.

Contract identity is part of liveness. Before decoding or pricing a discovered
contract, require the chain-specific checksummed address, first-party deployment
documentation or verified explorer source, proxy implementation when relevant,
ABI/function provenance, decimals/units, and an explicit unknown-result path.
Unsolicited tokens, NFTs, reward links, approvals, and unknown contracts remain
`unverified discovery`; never follow their URI, call an interaction suggested
by metadata, or assign zero/value from a wallet UI label. A `balanceOf` success
does not prove transferability, redeemability, price, or safety.

Price/yield claims need their own as-of and provenance. Report spot value,
claimable rewards, advertised rate, projected net return, and realized return
as separate rows. Net projections itemize reward emissions, fees, gas,
slippage/price impact, borrow/funding cost, impermanent loss, withdrawal delay,
and any unpriced component; stale or absent prices remain unknown rather than
zero. A current APY page is product evidence, not proof that this account is
eligible, earning it, or can exit.

Return each position in the normal evidence order plus:

`public account register join | pinned chain snapshot | independent check | protocol/contract identity | economic decomposition | monitored exit | principal acceptance | effect authority`

The strongest read-only state is `currently observable at block`; it never
upgrades to signer availability, transaction simulation, approval, managed
position, or profit. If the repository lacks a reviewed value-redacting
observer for an authenticated exchange or wallet-provider surface, report that
surface `not observed` instead of improvising an authenticated request.

### 1. Local services (this host)

`systemctl --user list-units --type=service --state=running --no-pager` —
name each running house service and its description.

### 2. Local registry and MCP

- `curl -s http://127.0.0.1:4873/-/ping` (expect `{}`).
- `curl -s -X POST http://127.0.0.1:18808/mcp -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'`
  — report tool count, not the full dump.

### 3. Cloud deploys

- `gcloud run services list --format="value(metadata.name,status.url)"` —
  every Cloud Run service and its own `*.run.app` URL, regardless of what
  subdomain (if any) fronts it. This call itself works even when the
  project's billing is disabled (verified 2026-08-31) — it lists services,
  it does not serve traffic to them, so an empty/error result here means
  something else (wrong project, no access), not billing.
- `gcloud billing projects describe <project> --format="value(billingEnabled)"`
  — the direct, fast check for "is billing actually the reason these
  return 500/503," rather than inferring cause from HTTP status alone.
  Run this whenever a spread of Cloud Run origins all fail the same way —
  a single `billingEnabled: false` explains a whole fleet of 500s at once
  and stops you from chasing them as N separate app bugs. Note
  `bare-cedar-fog-cloud-mirror` (the GCP mirror VM) and the game/Cloud Run
  services below share the same project (`five-six-one-group-dev`, per
  the org-machines record) — one billing check covers both findings.
  Billing on `five-six-one-group-dev` is permanently off (a free trial,
  exhausted). Never ask, recommend, or plan around re-enabling it. A dead
  Cloud Run origin is a migration target (Cloudflare free tier,
  cold-red-gate, or another already-paid host), never a billing repair.
  Report `billingEnabled: false` as expected state.
- `wrangler whoami` for Workers auth. If the `wrangler` binary is absent
  from PATH, that is a real, reportable gap here (there is no site-local
  `node_modules/.bin/wrangler` install in this tree either as of
  2026-08-31) — say so plainly, do not guess from `wrangler.jsonc` files.
  **Absence of `wrangler` does not block subdomain attribution** (step 4
  below needs none of it): do not let a missing CLI stop the report.
- If authed, `wrangler deployments list` / Cloudflare dashboard access
  would give Worker-level detail; without it, step 4's route-table grep is
  the substitute.

#### Verifying a fresh `wrangler deploy` (new Worker, right after deploying)

A `wrangler deploy` exit code of 0 proves the upload succeeded, nothing
more. Three separate facts have to be pulled from its own stdout and then
checked live — never stop at the exit code:

- **Parse the deploy output itself.** A successful `wrangler deploy` on a
  route-bound Worker prints, in order: `Total Upload: <n> KiB`, `Uploaded
  <worker-name> (<version-id>) (<n> sec)`, then either a `Deployed
  <worker-name> triggers (<n> sec)` line followed by the bound URL(s)/
  custom domain, or — if the config has no `routes`/`custom_domain` at
  all — no triggers line and the Worker is only reachable at its
  `*.workers.dev` URL (only present if `workers_dev` isn't `false`).
  Record the worker name and version id printed; they are what step 4's
  live check has to match.
- **Distinguish "uploaded" from "bound" from "live."** These are three
  different facts, never collapse them:
  | State | What the deploy output shows | What it does NOT show |
  | --- | --- | --- |
  | Uploaded | `Uploaded <name> (<version>)` | code is bound to any hostname |
  | Bound | `Deployed <name> triggers` + a `custom_domain`/route line | the domain actually resolves/serves yet |
  | Live | (nothing in deploy output — this is a separate check) | — confirmed only by the curl below |
  A Custom Domain attachment can take a few minutes to propagate even
  after wrangler reports it deployed; a `curl` run in the same second as
  the deploy command can legitimately still show the old answer. Re-check
  once, a short wait later, before calling a still-stale result a defect.
- **The post-deploy live check is two curls, not one.** `getent hosts
  <domain>` (expect it unchanged — still a Cloudflare anycast address,
  since the domain was already proxied) then:
  1. `curl -sD - -o /dev/null -m 8 https://<domain>/` for status code and
     headers (per step 4.2) — a `200`/expected app status is necessary
     but not sufficient.
  2. A **content sniff**: `curl -s -m 8 https://<domain>/ | head -c 300`
     (or grep the body for a string unique to the new Worker — a build
     marker, an app-specific string, anything the OLD origin/router would
     never emit). This is what tells a genuinely-new response apart from
     a cached edge response or the *old* Worker still answering the
     route — a `200` alone does not prove which Worker served it, and a
     stale `cf-cache-status: HIT` on an assets-backed Worker can return
     old content even after a fresh deploy.
- **Migrating a property OFF the shared `cloudflare-router` needs both
  halves checked, not just the new deploy.** Attaching a Custom Domain to
  the new dedicated Worker does not detach it from whichever Worker
  already holds that hostname — Cloudflare Custom Domains bind one
  hostname to one Worker, and the router's `routes` entry in
  `.../cloudflare-router/wrangler.jsonc` has to be *removed and
  redeployed* or it keeps the claim. Verified 2026-08-31: `play.561.group`
  is currently declared in BOTH
  `.../cloudflare-router/wrangler.jsonc` (`routes: [{"pattern":
  "play.561.group", "custom_domain": true}, ...]`) AND its own
  `.../sites/play.561.group/wrangler.jsonc` (`routes: [{"pattern":
  "play.561.group", "custom_domain": true}]`) — and `curl` against
  `play.561.group` right now returns the router's `HTTP/2 500` (its
  proxied Cloud Run origin failing), not the dedicated Worker's content,
  because the router deployed its claim first/most-recently. So for each
  migrated domain check both facts, not one: (a) `grep -n "<domain>"
  cloudflare-router/wrangler.jsonc cloudflare-router/src/index.mjs` comes
  back empty (route entry AND `ORIGIN_BY_HOST` entry both removed), and
  (b) the property's own `wrangler.jsonc` declares the route and its own
  `wrangler deploy` output showed a `Deployed ... triggers` line. Only
  when both hold does the content sniff above prove the new Worker, not
  the old router, is answering.

#### Verifying an immutable content preview, release, and publication surface

For a static/news property, a successful build, an artifact directory, and a
Cloudflare upload are not interchangeable evidence.  Treat the release as the
same immutable artifact observed at distinct boundaries.  Keep the deploy
stdout or provider receipt for each candidate; it must identify the deployment
or Worker version and its preview/production URL.  Do not infer the serving
artifact from the current checkout after another build may have run.

1. **Fingerprint the candidate before upload.** From the exact staged output
   directory, record a reproducible file manifest (`find ... -type f -print0 |
   sort -z | xargs -0 sha256sum`) and the hashes of the homepage, one intended
   article, the declared feed(s), and sitemap.  Retain the path/hash pairs,
   not only a whole-directory checksum.  If the framework emits content-hashed
   assets, include the HTML/XML surface files separately: an asset hash alone
   cannot establish the publication's semantic bytes.
2. **Preview is a separate proof.** Obtain the preview URL from the actual
   deployment receipt, then fetch its homepage, one article URL, each feed,
   and sitemap over HTTPS.  For every response retain URL, final redirected
   URL, status, `content-type`, cache headers, body SHA-256, and a small
   expected-content assertion (article canonical URL/title for HTML; item URL
   for feeds; article URL for sitemap).  A preview `200` for `/` never proves
   that the article discovery surfaces were uploaded.  A URL returning a login
   page, SPA fallback, or an edge error is a failed surface even if it is 200.
3. **Release binding needs a production receipt.** A release is not the act of
   calling `wrangler deploy` with an arbitrary name.  Record the provider's
   production/custom-domain binding from stdout or API, then repeat the same
   multi-surface probe against the public hostname.  Compare each public body
   hash to the candidate manifest after normalizing only known response
   transformations (for example compression is transport, not a body change).
   If the public shell intentionally injects dynamic analytics or an edge
   timestamp, compare a stable extracted semantic fragment and report that the
   full-byte equality is unavailable; never silently waive the mismatch.
4. **Keep discovery documents mutually accountable.** For the chosen article,
   require all of: homepage links to it, its canonical URL returns the same
   article, every declared feed contains its canonical URL, and sitemap
   contains that URL.  Verify canonical/alternate links resolve to the public
   origin—not a preview hostname or build-local address.  This catches the
   common partial publish in which index HTML is new but RSS/Atom/sitemap is
   stale or built from a different artifact.
5. **Classify the strongest observed state.** `artifact built` means only the
   manifest exists; `preview coherent` means all preview surfaces pass; `bound
   for production` means a provider receipt binds the deployment; `public
   coherent` means every public surface passes and agrees with the candidate.
   A CDN cache `HIT`, redirect, or 200 with unrelated bytes is not a substitute
   for public coherence.  When a cache could still contain the prior artifact,
   re-probe once after a short delay and report the cache state; do not purge,
   redeploy, or mutate content merely to make a read-only verification pass.

### 4. Who actually serves a given subdomain (edge/DNS attribution)

This is the check that answers "does `X.561.group` work, and through
what." Full method and worked precedent live in
`.claude/skills/operate-remote-hosts/SKILL.md` under "Confirming which
host actually serves a subdomain" — follow it, do not re-derive it here.
Summary of the chain:

1. Resolve: `getent hosts <domain>` (this laptop has no `dig`/`nslookup`).
   An address matching a known VPS IP (e.g. `45.76.19.133` for
   cold-red-gate) means that host answers directly; a Cloudflare anycast
   range (`2606:4700:...`, `104.16-31.x.x`, `172.64-71.x.x`) means the
   domain runs through a Cloudflare Worker or CF-proxied origin, not a
   VPS Caddyfile.
2. `curl -sD - -o /dev/null -m 8 https://<domain>/` for the live HTTP
   status — read it together with the resolved address, never alone.
3. Ground-truth each side that could plausibly own it:
   - VPS: `ssh cold-red-gate 'grep -nE "<domain>" ~/.config/caddy/Caddyfile'`
     — only a domain with its own `{ }` block is served there.
   - Cloudflare Worker: grep every `wrangler.jsonc`/`wrangler.toml`
     `routes`/`route` field in the tree for the domain
     (`grep -rl "<domain>" --include="wrangler.jsonc" --include="wrangler.toml"`).
4. **A matched Worker is a router, not the final answer.** A Worker whose
   job is proxying to a Cloud Run origin keeps a hostname→origin table in
   its own source (e.g. `ORIGIN_BY_HOST` in
   `cloudflare-services-section/services/cloudflare-router/src/index.mjs`).
   Read that table to find the origin hostname, then `curl -sD - -o /dev/null
   https://<origin>.run.app/` directly. This tells you which layer is
   actually failing: Worker and origin both erroring means the Cloud Run
   service itself is down (fix there); only the Worker erroring while the
   origin answers cleanly means the routing/proxy layer is the fault.
   Cross-reference the origin hostname's service name against step 3's
   `gcloud run services list` output — the two naming schemes for the same
   service differ (a numeric-project-id host vs. the short default
   `*-a2d7mjqbfa-uc.a.run.app` host) and both must resolve to the same
   service, not two different ones.
5. A domain that doesn't resolve at all (empty `getent hosts`, `curl:
   Could not resolve host`) is a distinct, separately-reportable finding
   from a resolving host that errors — never collapse "no DNS record" and
   "5xx response" into one "down" verdict.
6. **Batch form, for a set of subdomains rather than one** (this is the
   shape a MUD/game-surface survey needs): resolve the domain list from
   the Worker's own route table, don't hand-type it —
   `grep -oE '"pattern": "[^"]+"' <router-worker>/wrangler.jsonc` — then
   loop `getent hosts`+`curl -s -o /dev/null -w '%{http_code}'` over each
   in one pass. Cross-reference against `gcloud run services list` by
   name (most game services share their subdomain's name, e.g. `farstone`
   ↔ `farstone.561.group`, `casino` ↔ `casino.561.group`; a mismatch, e.g.
   `fearful.561.group` ↔ service `be-not-so-fearful`, is exactly what the
   Worker's `ORIGIN_BY_HOST` map (step 4 above) resolves). **A route
   declared in the Worker with no matching entry in `gcloud run services
   list` is a distinct defect class from a billing-blocked service**: the
   origin was never deployed at all, not merely unreachable — its
   `*.run.app` hostname returns a bare `404` (Cloud Run's "no such
   service" response), not the `500`/`503` a real-but-billing-blocked
   service returns. Don't collapse these into one "dead" verdict; they
   need different repairs (deploy vs. re-enable billing).

### 5. Cross-host service sweep (for a topic, e.g. "every MUD-related process")

A topic's live footprint can span this laptop, cold-red-gate, and the GCP
mirror VM — checking only one host and reporting "not live" is a false
negative. Sweep all of them:

- **This laptop**: step 1's `systemctl --user list-units`, plus
  `grep -rliE "<topic>"` over local wrangler configs for a matching route.
- **cold-red-gate**: `.claude/skills/operate-remote-hosts/SKILL.md` has the
  connection pattern (`ssh -o BatchMode=yes -o ConnectTimeout=8`,
  `XDG_RUNTIME_DIR` for `systemctl --user`) and the safe bounded-grep
  pattern for finding a topic's code/checkout when directory names don't
  match it. Run `systemctl --user list-units --type=service --no-pager`
  there and check `ss -tlnp` for an actual listener — a checkout existing
  on disk is not evidence of a running process; a `.gitignore`-only or
  otherwise-empty checkout (confirm with `ls -la` on the directory) is
  stronger evidence still that nothing is deployed from it.
- **GCP mirror VM**: try `ssh` first (per operate-remote-hosts, no
  interactive prompt or retry loop — `BatchMode=yes`, short timeout); if
  unreachable, `gcloud compute instances list --project=<project>` as the
  independent check. A "billing not enabled" API error is itself the
  finding — report it, do not attempt to enable billing or start
  instances during a survey.
- **Cloud Run / Cloudflare**: `gcloud run services list` (step 3) and a
  tree-wide grep of `wrangler.jsonc`/`wrangler.toml` route patterns (step
  4) for the topic's name — a service or route existing in one but not
  wired in the other is a real finding (e.g. a Cloud Run service with no
  Worker route in front of it is unreachable by any `*.561.group`
  subdomain even though `gcloud` shows it running). **For a game/MUD
  sweep specifically**, every `*.561.group` game/casino/board-game
  subdomain routes through one Worker —
  `cloudflare-services-section/services/cloudflare-router`
  (`wrangler.jsonc` for the declared route list, `src/index.mjs`'s
  `ORIGIN_BY_HOST` for the subdomain→Cloud-Run-origin map) — this is the
  one place that enumerates the whole game surface; don't re-derive the
  list by grepping scattered per-game directories. cold-red-gate's
  Caddyfile carries none of these domains (verified 2026-08-31) — the
  entire game/MUD surface is Cloudflare Worker → Cloud Run, never the
  VPS, so a game-surface sweep can skip the VPS Caddyfile check and go
  straight to the Worker route table plus `gcloud run services list`.

### 5A. Protected control plane: assay enforcement and each receiver's induction

A browser showing `401 {"error":"unauthorized","reason":"missing bearer
token"}` at a protected API does not by itself mean authentication is broken.
It proves only that this request carried no accepted bearer.  Keep three
questions separate:

1. **Does the API enforce its declared bearer boundary?**
2. **Can the human receiver enter through a browser-owned OAuth/session path?**
3. **Has the Codex receiver been configured and inducted as an OAuth-capable
   MCP client?**

Measure the public boundary without acquiring, reading, copying, or printing a
credential.  Never inspect service environment files, OAuth state directories,
browser storage, keychains, token caches, callback query strings, or shell
environment dumps during this assay.

```sh
getent ahosts ops.561.group | head -6
curl -sS -m 10 -i https://ops.561.group/ |
  sed -E '/^(set-cookie|authorization|proxy-authorization):/Id' | head -30
for path in \
  /.well-known/oauth-protected-resource \
  /.well-known/oauth-protected-resource/mcp \
  /.well-known/oauth-authorization-server \
  /healthz /mcp /tasks/view
do
  curl -sS -m 10 -D - -o /dev/null "https://ops.561.group${path}" |
    sed -n '1p;/^content-type:/Ip;/^www-authenticate:/Ip'
done
curl -sS -m 10 -D - -o /dev/null \
  -H 'Authorization: Bearer intentionally-invalid-observation' \
  https://ops.561.group/mcp |
  sed -n '1p;/^www-authenticate:/Ip'
```

The literal invalid probe value above is public test input, not a credential.
Do not replace it with a real or locally discovered value.  Retain only status,
safe challenge fields (`realm` and `resource_metadata`), content type, resolved
address, and observation time.  OAuth authorization-server and protected-
resource metadata are designed to be public; still report only endpoint URLs,
supported grant/response types, scopes, and PKCE methods, not an opaque value
that a nonstandard server might add.

Classify enforcement from the whole chain:

| Observation | Safe classification |
| --- | --- |
| no bearer → `401` with a Bearer challenge; deliberately invalid bearer → `401`/`403`; advertised discovery metadata is public and internally coherent | `bearer enforcement observed` |
| protected route returns its content with no bearer | `authentication enforcement defective` |
| no bearer and invalid bearer get the same generic edge/proxy failure, or the challenge's metadata URL is absent/unreachable/incoherent | `authentication boundary unresolved` |
| metadata works but a route documented as public (for example `/healthz`) is bearer-gated, or the live challenge/metadata shape differs from the candidate source | `live release/configuration drift`; do not relabel it an enforcement failure |

Do not send a malformed real token, complete dynamic client registration, open
or follow a Google authorization/consent flow, exchange a callback, revoke a
grant, or create a browser session in a read-only survey.  Those are separate
credential and human-consent effects.

#### Human browser induction

An OAuth-protected MCP/API surface and a human application are different
receivers even when they eventually read the same control-plane rooms.  A JSON
`401` at `/` may be correct for the API and simultaneously prove that the root
is not a human entry surface.  Report `human browser induction not observed`
when fresh browser-equivalent GETs expose discovery and protected JSON only,
with no public HTML landing route, login initiator, or documented browser
client/session receiver.  Do not call this `bad auth` and do not tell the
Founder to paste a bearer token into a URL, browser console, or local storage.

Human induction is proved only by a separately authorized Founder-held OAuth
interaction that begins at a named public application route, returns to its
declared callback, establishes an opaque secure session, and admits the named
human view.  Retain only the route, admitted identity classification, final
status/view, and time; never the authorization URL, code, cookie, or token.  A
public authorization endpoint in metadata proves protocol availability, not
that a human browser receiver exists.

#### Codex control-plane induction

Check the authored harness source first, then its generated projection, then
the running Codex tool surface.  List only MCP server names, transport, and
public URL; redact environment and headers entirely.

```sh
# Use the authored codex-agent-harness.json path named by AGENTS.md.
jq -r '.mcpServers // {} | to_entries[] |
  [.key, (.value.transport // ""), (.value.url // "stdio")] | @tsv' \
  <codex-agent-harness.json>
awk '/^\[mcp_servers\./{name=$0}
     /^[[:space:]]*(url|transport)[[:space:]]*=/{print name " " $0}' \
  .codex/config.toml
```

Use the app/runtime MCP listing for the final check; a projected file does not
prove this already-running Codex session loaded it.  Classify each boundary:

| Observation | Safe classification |
| --- | --- |
| no `ops.561.group` MCP resource in the authored harness | `Codex control-plane induction not configured` |
| authored source names it but projection or running tool surface does not | `Codex harness projection/reload incomplete` |
| running client names it but has no completed OAuth grant/admitted tool call | `Codex credential induction pending` |
| an ordinary runtime tool-list or read-only control-plane call succeeds through that exact server | `Codex control-plane induction observed` |

Never infer a Codex grant from the human's browser session, another MCP
server's OAuth state, a credential-shaped environment variable name, or the
mere absence of a `401`.  Never solve a missing Codex receiver by putting a
bearer token in authored JSON/TOML, a command argument, or the repository.
Require the harness's declared opaque credential/OAuth receiver and a fresh
runtime admission assay.

#### Release/source join and report

After live measurement, identify the answering host/process with step 4 and
`operate-remote-hosts`.  On a remote systemd service, safe fields are
`Id,Description,LoadState,ActiveState,SubState,FragmentPath,WorkingDirectory,
ExecStart`; omit `Environment`, `EnvironmentFiles`, process environments, and
OAuth state.  Compare live behavior first to that deployed checkout/revision,
then separately to the repository candidate.  A newer local package is a
candidate cutover, never evidence of what is live.

Return one compact row per boundary: **API enforcement, public OAuth metadata,
human browser induction, Codex harness configuration, Codex credential/runtime
induction, deployed process/source, and release drift**.  Each row contains the
exact safe command, timestamp, observed status, next decisive observation,
disqualifier, and uncertainty.  The next observation for a missing receiver is
its own induction assay; it is never a deploy, token hunt, or change to the
working API guard.

### 6. YouTube channel lanes: prove a natural scheduled publication

This lane is GitHub Actions -> YouTube.  It does **not** use Cloud Run, Cloud
Scheduler, GCP billing, or a laptop as production.  Never manually dispatch,
rerun, or cancel a workflow to make evidence appear.  Those actions change the
very fact under measurement and cannot prove the natural scheduler worked.

A green test, a declared workflow cron, a provider-side scheduled run, an
authenticated upload, a YouTube accepted scheduled release, and a naturally
public video are separate facts.  Report the highest evidenced state for each
repository; never promote one on the basis of source, a receipt, or another
channel's result:

| Level | What it establishes | What it does **not** establish |
| --- | --- | --- |
| 1. Green CI | The checked revision passed its declared tests. | A scheduler ran, credentials worked, or YouTube has a video. |
| 2. Declared cron | A GitHub Actions workflow configuration asks for a future run. | GitHub accepted or executed it. |
| 3. Authenticated upload | The exact channel's OAuth capability uploaded a returned YouTube video ID, and the durable record links it to the scheduled run. | The requested future release was accepted or the video is public. |
| 4. Scheduled YouTube release | YouTube reports the exact uploaded video as private with the exact future `publishAt`, tied to the exact channel. | YouTube later processed the transition or made it public. |
| 5. Naturally public publication | After `publishAt`, a fresh YouTube API observation reports that exact video as `privacyStatus: public` and processed, with its public URL and `publishedAt`. | Nothing; this is the publication fact. |

Treat the five independent repositories as separate authorization and
publication territories:

```
lib/emsenn/services/561-group/services/public-services-section/services/personal-services-section/emsenn-services-section/services/emsenn-web-services-section/services/emsenn-youtube-services-section
lib/emsenn/services/561-group/services/public-services-section/services/public-computer-services-section/services/public-web-services-section/services/public-social-services-section/services/public-education-services-section/services/artificial-intelligence-education-youtube-services-section
lib/emsenn/services/561-group/services/public-services-section/services/public-computer-services-section/services/public-web-services-section/services/public-social-services-section/services/public-education-services-section/services/public-ecological-youtube-services
lib/emsenn/services/561-group/services/public-services-section/services/public-computer-services-section/services/public-web-services-section/services/public-social-services-section/services/public-education-services-section/services/business-education-youtube-services-section
lib/emsenn/services/561-group/services/public-services-section/services/public-computer-services-section/services/public-web-services-section/services/public-social-services-section/services/public-education-services-section/services/mathematics-education-youtube-services-section
```

For **each** root, first identify the declared channel without guessing it
from a similarly named repository.  Keep a lane table with one row per root:
repository, declared channel ID, workflow path, cron, newest scheduled
`run_id`/attempt/SHA, production-job result, durable-state commit, video ID,
and fresh YouTube observation.  Missing joins are findings, not blanks to
fill by inference.

```sh
node -e 'const fs=require("node:fs");const p=process.argv[1]; for (const f of ["content/config/channel.json","content/config/pipeline.json"]) { const n=`${p}/${f}`; if (fs.existsSync(n)) console.log(n, JSON.stringify(JSON.parse(fs.readFileSync(n,"utf8")).youtube ?? JSON.parse(fs.readFileSync(n,"utf8")))); }' <channel-root>
```

OAuth is an opaque, human-consent boundary.  Do not inspect, print, copy,
compare, or reuse refresh tokens.  For every one of the five roots, require a
separate Leader-run OAuth setup/probe result that reports the observed channel
ID equal to that root's declared ID and records only a safe status, observed
ID, title/handle, scopes, timestamp, and command exit.  A positive result in
one root supplies **no** OAuth authorization to any other root, even if the
client ID, Google account, handle, workflow, or Cloud project appears shared.
If a probe is absent, refused, expired, returns a foreign default channel, or
cannot establish required scopes, report `OAuth-gated: no authenticated-upload
claim` for that root and stop its ladder at level 2.

Use the channel-local `src/oauth-setup.mjs` entry point for the human-consent
probe, only when the Leader has authorized that consent interaction.  It may
write an opaque token into that exact root's ignored environment carrier; do
not run it as a survey command and do not turn its output into a secret-bearing
log.  A read-only survey may instead inspect its exact channel-identity guard:

```sh
rg -n 'observeAuthorizedChannel|youtubeChannelId|REFRESH_TOKEN_ENV|authorized .*not' <channel-root>/src/oauth-setup.mjs <channel-root>/src/channel.mjs
```

For levels 1--2, inspect the exact workflow only.  The production carrier is
GitHub Actions; no `gcloud scheduler` or Cloud Run command is relevant to its
operation:

```sh
sed -n '1,180p' <channel-root>/.github/workflows/test-and-image.yml
gh api 'repos/<owner>/<repo>/actions/workflows/test-and-image.yml' --jq '{id,path,state}'
gh api 'repos/<owner>/<repo>/actions/workflows/test-and-image.yml/runs?event=schedule&per_page=20' \
  --jq '.workflow_runs[] | {id,run_attempt,event,status,conclusion,head_sha,created_at,updated_at,html_url}'
```

The workflow file and local preflight validate trigger shape only; they are not
evidence GitHub ran.  Provider evidence requires a returned run whose
`event` is literally `schedule`; `push`, `workflow_dispatch`, and a rerun
must be reported separately even if their SHA matches.  Treat no returned
scheduled run as `scheduled execution not observed`, not as a failed upload.

**Post-cron polling, bounded and jitter-aware.** GitHub evaluates cron in UTC
and may deliver a due run late.  Calculate each lane's nominal UTC occurrence
from the cron in the active default-branch workflow, then retain a two-hour
delivery grace period.  Before `due + 2h`, absence is simply `pending GitHub
schedule delivery`; do not poll in a tight loop or label it defective.  After
that point, retrieve a bounded history instead of trusting only a newest-run
screen:

```sh
# Set cutoff to the earliest due occurrence that matters, in ISO UTC.
for page in 1 2 3; do
  gh api "repos/<owner>/<repo>/actions/workflows/test-and-image.yml/runs?event=schedule&per_page=100&page=$page" \
    --jq '.workflow_runs[] | {id,run_attempt,event,created_at,updated_at,status,conclusion,head_sha,html_url}'
done
```

Three 100-run pages is a deliberately bounded lookback.  Filter the returned
safe tuples locally by `created_at >= cutoff`; if the lane legitimately has
more than 300 scheduled runs in the relevant period, narrow the time window
and repeat rather than silently treating a truncated result as complete.
`created_at` is the provider's dispatch timestamp, not the requested cron
minute, so retain both and report their difference as delivery jitter.

After one due occurrence has crossed its two-hour grace with no provider run,
report `scheduled delivery missing (first occurrence)` and inspect only the
workflow's GitHub state/path/default branch.  Call it a **scheduler defect**
only if (a) GitHub reports the workflow not `active`, the schedule trigger is
absent from the current default-branch file, or the workflow cannot be found;
or (b) two consecutive eligible occurrences each cross their grace windows
with no `event: schedule` run.  A single late/missing delivery is not proof
that OAuth, Docker, or YouTube failed.

For a completed scheduled run, inspect both the workflow run and its
production job without downloading logs that could contain sensitive runtime
detail:

```sh
gh run view <run_id> --repo <owner>/<repo> \
  --json databaseId,event,attempt,headSha,status,conclusion,createdAt,updatedAt,url,jobs
gh run view <run_id> --attempt 1 --repo <owner>/<repo> \
  --json databaseId,event,attempt,headSha,status,conclusion,createdAt,updatedAt,url,jobs
gh api 'repos/<owner>/<repo>/commits/automation-state' --jq '{sha,commit:{message:.commit.message,date:.commit.committer.date}}'
```

The `production` job must have completed successfully for a scheduled-run
claim.  A green `test` job alone establishes only CI.  The automation-state
tip is useful durable-state evidence only when its commit time falls after
the run and its changed files/record fields link the same `run_id` or
`head_sha`; otherwise say `state present; producer unjoined`.  A state branch
commit is not an upload or public-video claim.

**Rerun handling.** GitHub keeps a rerun under the same `run_id` and raises
`run_attempt`; it does not turn a manual rerun into a new natural cron event.
For every candidate with `run_attempt > 1`, inspect attempt 1 explicitly.
`gh run view <run_id> --attempt 1` must itself return `event: schedule` to
prove the original delivery.  Attribute natural scheduled production only to
attempt 1's successful `production` job and state changes.  If attempt 1
failed/cancelled and a later rerun succeeds, report `natural delivery observed;
rerun produced outcome`—never `naturally published` from that rerun.  A
later attempt is useful failure-recovery evidence, but it does not satisfy the
no-manual-intervention publication requirement.

**The required evidence join.** For each repository, retain only this safe
tuple: repository, workflow path, `run_id`, attempt, head SHA, event,
created/updated timestamps, conclusion, URL, production-job conclusion,
automation-state commit SHA/time, record ID, video ID, declared channel ID,
observed channel ID, `publishAt`, privacy/upload status, and observation time.
Join in this order:

1. GitHub returns `event: schedule` for that repository and exact workflow.
2. Its `production` job is successful.
3. The post-run automation-state change contains a durable record that names
   that `run_id` or head SHA.  Time proximity alone is weaker supporting
   evidence, never a substitute for a stable identifier.
4. That record's video ID is observed through the same lane's authenticated
   YouTube capability and the returned channel ID equals the declared ID.
5. After that record's `publishAt`, the same API observation says `public`
   and processed and has a finite `publishedAt`.

If a carrier does not yet persist GitHub run identity, report the honest
limitation (`scheduled production completed; YouTube record cannot be
causally joined`) and repair the carrier in a separately authorized change;
do not use timestamps as proof.  Never substitute a run, token, durable state,
or video from another root.  If provider access is unavailable, report the
declared cron at level 2 and `scheduled execution not observed`.

For levels 3--5, inspect channel-local durable records only as leads, then
verify the venue using that same root's authenticated capability.  This is a
read-only verification step: it may refresh access using the lane's existing
opaque credential, but it must not create, schedule, update, delete, or
publish a video:

```sh
find <channel-root>/data -type f -name '*.jsonl' -o -name '*.json' 2>/dev/null
node <channel-root>/src/observe-pending-publication.mjs
```

The observer requires the exact channel capability and must produce a fresh
venue observation.  Level 3 needs a returned video ID plus matching observed
channel ID.  Level 4 additionally needs the stored/observed `publishAt` still
in the future and private status.  Level 5 must be observed *after* that time,
with `privacyStatus: public`, processed upload status, finite `publishedAt`,
and `https://www.youtube.com/watch?v=<videoId>` for the same channel and video.
If the observer says pending, the result is pending; do not call a scheduled
receipt, a successful upload, or a manually publicized URL a natural public
publication.  Distinguish these terminal/nonterminal outcomes precisely:

| Observation | Report |
| --- | --- |
| no scheduled workflow run | declared cron; execution not observed |
| scheduled run cancelled/failed, or production job absent/failed | scheduled execution failed; no upload claim |
| scheduled production success but no durable record joined to it | execution observed; outcome unjoined |
| joined video is private and `publishAt` is future | scheduled release pending |
| joined video remains private after `publishAt` | YouTube release transition overdue |
| joined video is public, processed, and has `publishedAt` after `publishAt` | naturally published |
| channel ID differs, video absent, or observer errors | venue verification failed; do not infer publication |

The five exact GitHub repositories are
`emsenn/emsenn-youtube-services-section`,
`emsenn/artificial-intelligence-education-youtube-services-section`,
`emsenn/public-ecological-youtube-services`,
`emsenn/business-education-youtube-services-section`, and
`emsenn/mathematics-education-youtube-services-section`.  Run the API query
once for each; their cron windows and authorization territories are
independent.

**Proving the watcher is alive.** A Codex heartbeat automation configured as
`ACTIVE` is a desired schedule, not an execution receipt.  For the named
YouTube watcher, first use the Codex automation surface's exact automation ID
to observe its current configuration, target thread, cadence, and scheduler
state.  Retain only the ID, name, state, target, cadence, and observed time;
the prompt can contain operational detail and credentials must never be
copied into a report.

Then require one independent execution fact: a heartbeat-created turn on the
target thread, after the watcher was enabled, whose timestamp lies in its
expected cadence window and whose content contains a fresh, read-only query
of all five exact GitHub workflow endpoints.  The turn must identify the
five repositories and differentiate their `event: schedule` observations;
an old status report, an empty heartbeat, a user turn, or the automation's
configuration card does not count.  If the app supplies an execution receipt
or last-run/next-run metadata, correlate its automation ID and timestamp to
that thread turn.  That is the strongest watcher-liveness join:

`active automation ID -> scheduler execution receipt -> target-thread
heartbeat turn -> fresh five-lane GitHub observations`.

**Identify heartbeat source from explicit metadata, never timing.** A target
thread can turn because of a user message, goal-driven continuation, an active
agent finishing a step, or a heartbeat.  Thread timestamps, an hourly-looking
gap, identical prompt text, and a current `inProgress` status do not expose
which of those caused a turn.  The platform-injected inbound marker

```xml
<heartbeat><automation_id>verify-youtube-scheduled-publishing</automation_id>
```

is authoritative trigger-source evidence for this watcher.  Treat it as such
only when it is delivered as heartbeat metadata by the app/session surface;
the same string copied into a user message, workflow log, repository file, or
assistant reply is not a source receipt.  Read the target's actual metadata
rather than guessing:

```sh
# Codex app surfaces, read-only
# 1. list_threads: resolve the target thread ID and its latest update time.
# 2. read_thread <target-id>: retain turn IDs, start/completion times, status,
#    and any explicit source/automation fields if the surface returns them.
# 3. automation view: retain the watcher's exact ID and any execution/occurrence
#    ID or last-run metadata it explicitly returns.
```

Classify provenance in this order:

| Evidence available | Safe classification |
| --- | --- |
| Current inbound heartbeat metadata contains the exact watcher ID, and its configured target is this thread | `heartbeat source observed` |
| Automation execution/occurrence receipt names both the watcher ID and the target turn ID (or the thread item explicitly names that watcher ID) | `heartbeat execution and source observed` |
| A scheduler receipt names the watcher ID/time, and one thread turn has an explicit machine-readable automation source that matches it | `heartbeat execution observed` |
| The watcher is configured and a later thread turn performs the five-lane audit, but neither side exposes a source/turn-ID join | `watcher-shaped audit; turn provenance unavailable` |
| Thread turns have only IDs/times/status, including rapid continuation turns, and the automation surface exposes configuration only | `watcher configured; execution/source unobservable` |

For the explicit-marker row, complete the source join before claiming a live
watcher: (1) automation view resolves that exact ID, is enabled, and targets
this same thread; (2) the heartbeat arrives within the configured cadence
window; and (3) this heartbeat turn performs fresh GET-only observations for
all five exact workflow endpoints.  This establishes a watcher execution and
source, not yet a YouTube outcome—the five-lane evidence ladder still applies.

Rows four and five never prove heartbeat liveness.  In particular, a rapid
goal-driven continuation that happens to perform the audit remains a
manual/goal-driven audit unless metadata positively attributes it to the
watcher.  It may still provide valid GitHub/YouTube observations; it just
cannot provide evidence about the heartbeat scheduler.  When provenance is
unavailable, retain only the strongest safe classification and use the
bounded independent audit fallback below rather than inventing a source.

**Pre-cron heartbeat discipline.** First calculate whether any lane has
crossed its nominal UTC cron time plus the two-hour delivery grace.  If none
has, make the five provider GETs, retain their timestamps internally, and
respond only with a compact no-change result such as `watcher observed; all
five cron windows remain pending`.  Do not reprint workflow YAML, OAuth state,
secrets metadata, historical tables, or perform venue observations before a
new scheduled run is found.  Escalate detail only when a lane reaches a due
window, GitHub returns an `event: schedule` run, or the watcher/source join
itself changes.

The watcher is a verifier, never a producer.  Its safe actions are GitHub
GET/API reads, read-only repository inspection, and the read-only YouTube
observation described above.  It must not dispatch, rerun, cancel, or edit a
workflow; use GCP/billing; or invoke a production carrier.  A manual
read-only audit can corroborate the watcher result but cannot substitute for
an execution receipt.

Some Codex surfaces expose only configuration and do not expose execution
history or a next-run time.  In that case report `watcher configured; liveness
unobservable on this surface`, preserve the returned automation ID/state, and
use a bounded independent audit after each due-plus-grace window to keep the
goal moving.  Do not create a duplicate heartbeat, toggle its state, or
manufacture an execution by sending a message to its target thread.  On the
next genuine watcher turn, inspect the new timestamp and five-lane query to
upgrade the result to `watcher execution observed`.  If no genuine watcher
turn appears through two expected cadence windows, report `watcher execution
missing` separately from any GitHub scheduler finding and repair only after
the owner has authorized a monitoring change.

### 7. Working tree

`git status --short | head -20` and the total change count.

## Output

One short table per layer (local / registry / MCP / cloud / edge-attribution /
YouTube / tree), each row a fact just observed, with the command's timestamp.
For each YouTube root, use five ladder columns and include its declared and
separately probed observed channel identity; use `not observed` rather than
copying a higher level from another root. For a
subdomain question, state explicitly which host or Worker answered, the
resolved address, and the HTTP status — never infer from a README, a
`wrangler.jsonc`, or the org-machines record alone.

### 8. GitHub surface

The org's GitHub reality is measured, never asked about: `gh auth status`;
`gh api user/orgs --jq '.[].login'` (this account belongs to: webgaz, gaz561,
**561-group**, **red-cup-engineering**, **lenticule-science**,
harmonious-union, coesite-operations, **causeway-services** — re-measure,
don't trust this list); `gh repo list <org> --limit 50` per org and
`gh repo list --limit 50` for personal (dozens of repos exist, including the
five YouTube channel repos and this monorepo's private origin
emsenn/bare-cedar-fog). "Do we have a public repo / org / publishing
identity" is a two-second `gh` measurement, never a founder question.
