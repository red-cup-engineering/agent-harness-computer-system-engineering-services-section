---
name: operate-remote-hosts
description: How to measure and operate the org's remote machines over SSH — use for any work touching cold-red-gate or the GCP mirror VM. Measurement patterns first; the hosts' identities live in the 561-group machines record.
---

# Operating remote hosts

The machines themselves are tree knowledge, not skill prose: read
`561-group-services-section/data/records/2026-08-30-org-machines.json`
(full path:
`lib/emsenn/services/561-group/services/561-group-services-section/data/records/2026-08-30-org-machines.json`)
before touching any host — it is the only enumeration, check it for a
newer dated record before trusting this summary. As of that record:
bare-cedar-fog (this laptop, dev-root), cold-red-gate (VPS,
45.76.19.133, serves emsenn.net/ops.561.group/koios.news/
registry.561.group), bare-cedar-fog-cloud-mirror (GCP VM,
34.61.173.187, us-central1-a, project five-six-one-group-dev), plus the
prod platforms cloudflare-workers and gcp-cloud-run (no SSH surface).

**cold-red-gate is live; the GCP mirror is not reachable.**
`ssh cold-red-gate hostname` (alias works directly, no need for
red-cedar-gate/ops/koios) returns `cold-red-gate`. A direct `ssh` to
34.61.173.187:22 times out, and `gcloud compute instances list
--project=five-six-one-group-dev` fails with "This API method requires
billing to be enabled" — the project the record says owns the mirror
has billing disabled, so its live state can't be checked via API
either. Do not spend budget trying to reach the mirror; report it
unreachable (host, error, timestamp) and move on. This is a finding to
record, never a thing to fix mid-survey (no enabling billing, no
starting instances). Re-measure rather than trusting this paragraph
once billing or reachability changes.

## Patterns that work (all learned the hard way)

- Always `ssh -o BatchMode=yes -o ConnectTimeout=8` with a `timeout`
  wrapper — never let a dead host hang a session. When an exec wrapper yields
  a still-running command/session handle, preserve the full result and wait or
  poll that session to successful completion before consuming or deploying
  artifacts; elapsed yield time or partial stdout is not completion.
- Measure before believing: a unit listed as running may have no unit
  file (`systemctl cat` says "No files found") — find the truth via
  `systemctl show -p MainPID,FragmentPath`, `ss -tlnp` for the real
  listener, `ps -p <pid> -o ppid=,args=`, `readlink /proc/<pid>/cwd`.
  Processes may retitle themselves (the registry shows as "561 Group
  Package Registry").
- Remote `systemctl --user` needs the bus env:
  `export XDG_RUNTIME_DIR=/run/user/$(id -u)` first — without it,
  user-unit commands silently no-op over non-interactive SSH.
- htpasswd/auth edits: verdaccio caches the user table — restart the
  unit after editing the file. Its PUT-login endpoint only REGISTERS
  (max_users gates it); for existing users prefer basic auth in
  ~/.npmrc (`:username` + base64 `:_password`) over token minting.
- Disk before bulk transfer: `df -h` the target; rsync with
  `--dry-run --info=stats2` first and quote the scope, then `-az`
  without `--delete` (remote-only extras survive). Bulk pushes may
  need the owner's permission grant — show the dry-run and the exact
  command.
- gcloud: `gcloud compute instances list` / `gcloud run services list`
  are the reality checks; never infer cloud state from tree configs
  (4 of 12 wrangler configs pointed at nonexistent Workers). Loop over
  multiple `--project=` values one call at a time — a shell `for`
  loop invoking gcloud has tripped the sandbox's command classifier.

## Read-only survey discipline

A survey (thematic search across hosts — money material, config
drift, whatever) is measurement, not operation: read, grep, list,
`systemctl show`/`list-units`, `journalctl --no-pager`. Never write a
file, edit a unit, restart/enable/disable a service, run an installer,
or touch billing/instance state on any host during a survey — a finding
("X lives at path Y", "host Z unreachable") gets reported in the
session output or a dated record, never remediated in place. If a
survey command's shape is ambiguous between read and write (e.g. `npm
install` as a side effect of "checking" a package), skip it and note
the gap instead of guessing.

### Secret-safe verification of a customer financial service

Use this stricter profile for brokerage, banking, exchange, treasury, or other
customer-account processes. A read-only SSH session must not print or inspect
environment-file contents, `systemctl` `Environment`/`EnvironmentFiles`,
`/proc/*/environ`, shell history, credential stores, request headers, raw
journal messages, or account/order/position response bodies. Do not run the
service's entrypoint, observer, readiness command, test suite, or package
script until its effect boundary has been read locally and independently
classified safe; names such as `readiness`, `status`, or `test` do not make a
command read-only.

Record remote state as independent evidence rows:

| State | Passing remote evidence | Do not infer from |
| --- | --- | --- |
| source candidate | local authoritative source revision and reviewed public contract | remote path resemblance |
| configured | safe unit fields identify a named receiver/account alias and executable path, without environment inspection | a checked-in unit or package manifest |
| deployed | remote `FragmentPath`/`WorkingDirectory`, installed package pins, and checkout/release revision or digest agree | `LoadState=loaded` alone |
| operating | fresh unit result plus bounded output/receipt metadata exists after the deployed start boundary | `ActiveState=active`, a timer schedule, or old receipt |
| received | a downstream receiver admits the same reviewed stable event/artifact ID or digest | producer output existence or timestamp proximity |
| principal/customer accepted | a separately governed acceptance carrier or protocol names the same result safely | a broker success, report file, or operator judgment |
| effect authorized | current mandate, consent, account scope, and guard permit the exact effect | credentials, a paper success, or a running loop |

These rows are non-monotonic. In particular, a oneshot can be operating
correctly while inactive between timer invocations; a running daemon can have
no fresh accepted output; and a deployed paper loop says nothing about live
account authority.

#### One bounded safe probe

Resolve exact unit names and expected package names from reviewed local source
before SSH. Use only literal allowlists in the remote command. This example
prints no environment carrier, journal message, or financial record body:

```sh
timeout 25 ssh -o BatchMode=yes -o ConnectTimeout=8 cold-red-gate '
  export XDG_RUNTIME_DIR=/run/user/$(id -u)
  date -u +observed_at=%Y-%m-%dT%H:%M:%SZ
  for unit in CUSTOMER_LOOP.service CUSTOMER_LOOP.timer; do
    systemctl --user show "$unit" --no-pager \
      -p Id -p LoadState -p UnitFileState -p ActiveState -p SubState \
      -p Result -p NRestarts -p ActiveEnterTimestamp -p InactiveExitTimestamp \
      -p FragmentPath -p WorkingDirectory
  done
  root=/absolute/reviewed/deploy/root
  printf "deploy_root_type="; stat -c %F "$root" 2>/dev/null || printf "absent\n"
  if [ -d "$root/.git" ]; then
    git -C "$root" rev-parse --verify HEAD
    git -C "$root" status --short --untracked-files=no | wc -l |
      awk "{print \"tracked_change_count=\" \$1}"
  fi
  entry=/absolute/reviewed/deployed/entrypoint
  [ -f "$entry" ] && sha256sum "$entry"
  node - "$root" <<"NODE"
const fs = require("node:fs");
const path = require("node:path");
const root = process.argv[2];
const expected = new Set(["EXPECTED_PACKAGE_1", "EXPECTED_PACKAGE_2"]);
for (const filename of ["package.json", "package-lock.json"]) {
  const full = path.join(root, filename);
  if (!fs.existsSync(full)) continue;
  const value = JSON.parse(fs.readFileSync(full, "utf8"));
  if (filename === "package.json" && expected.has(value.name))
    console.log(`manifest\t${value.name}\t${value.version ?? "unknown"}`);
  const installed = value.packages ?? {};
  for (const [seat, record] of Object.entries(installed))
    if (expected.has(record?.name))
      console.log(`lock\t${record.name}\t${record.version ?? "unknown"}\t${seat}`);
}
NODE
  journalctl --user-unit=CUSTOMER_LOOP.service --since=-48h --no-pager -o json |
    jq -s '\''{
      journalEntryCount:length,
      firstTimestamp:(map(.__REALTIME_TIMESTAMP)|min // null),
      lastTimestamp:(map(.__REALTIME_TIMESTAMP)|max // null),
      priorities:(map(.PRIORITY // "unknown")|group_by(.)|map({priority:.[0],count:length})),
      messageByteMaximum:(map((.MESSAGE // "")|length)|max // 0)
    }'\''
'
```

Substitute only reviewed literal values; do not discover paths by printing
`EnvironmentFiles` or expanding shell variables sourced from them. The
journal entrypoint digest is useful only when compared with the locally
reviewed candidate and the installed package version; a mismatch is explicit
release drift, not evidence that either side is newer or accepted. The
journal projection reads messages on the remote host only to calculate size
and emits no message text. It proves activity metadata, not a successful
trade, account observation, or receipt. If even message-size processing is
outside the survey's authority, omit `messageByteMaximum`; count/timestamp/
priority are sufficient to establish that journal entries exist.

For durable outputs, enumerate only metadata under a reviewed literal custody
root:

```sh
find /absolute/reviewed/receipt/root -maxdepth 4 -type f \
  -printf '%T@\t%s\t%p\n' 2>/dev/null | sort -nr | head -20
```

File paths can themselves contain a principal, account, symbol, or order ID.
Before returning them, either prove the naming contract is non-sensitive or
replace the final column with a repository-relative carrier class and count.
Existence, size, and modification time prove only `output metadata observed`.
Do not `cat`, `head`, `tail`, `grep`, or run an unreviewed `jq` projection over
a financial receipt. Extract a producer ID only through a locally reviewed
allowlist projection that emits exactly a non-sensitive record type/version,
stable content ID/digest, principal alias already public in the service
contract, and causal timestamp. Omit the field rather than emitting an unknown
key or body.

Prove a producer→receiver join at both remote boundaries. The producer row
needs deployed revision/package pin, record type/schema version, stable ID or
digest, causal time, and custody class. The receiver row needs its own deployed
revision/package pin, an admission/invocation record containing the same ID,
receiver validation/refusal, and resulting state. A common journal package,
shared directory, simultaneous timestamps, matching filenames, or both units
being active is not a join. With no safe same-ID receiver observation, report
`producer metadata observed / receiver unjoined`. Even a complete internal
join remains distinct from principal/customer acceptance and effect authority.

## Discovering a ScheduleDelivery queue and candidate root

Do not assume that the service is named after its customer.  The Koios.News
delivery lane, for example, is a `scheduled-activity-delivery` oneshot, while
the Koios paths are supplied through an environment file.  A direct
`find /srv/koios.news` or a guessed `koios*.service` can therefore report an
empty queue even when the contracted tick is healthy.

For a read-only inspection, discover the unit first, then derive the precise
paths from its declared environment file.  Print only the four path-valued
variables below; never dump or source the whole file, because it also carries
authority material.  The command neither starts a tick nor reserves a queue
job.

```sh
timeout 25 ssh -o BatchMode=yes -o ConnectTimeout=8 cold-red-gate '
  export XDG_RUNTIME_DIR=/run/user/$(id -u)
  systemctl --user list-units --all --type=service --no-pager |
    grep -iE "schedule|delivery|koios"
  unit=scheduled-activity-delivery-run-due.service  # replace only after discovery
  systemctl --user show "$unit" \
    -p Id,ActiveState,SubState,Result,FragmentPath,WorkingDirectory,ExecStart,EnvironmentFiles \
    --no-pager
  env=/home/emsenn/.config/emsenn/scheduled-activity-delivery.env  # take this from EnvironmentFiles
  grep -E "^KOIOS_NEWS_ROUTINE_PUBLICATION_(QUEUE|OUTPUT_ROOT|REPLAY_ROOT|BASELINE_ROOT)=" "$env"
  queue=$(sed -n "s/^KOIOS_NEWS_ROUTINE_PUBLICATION_QUEUE=//p" "$env")
  output=$(sed -n "s/^KOIOS_NEWS_ROUTINE_PUBLICATION_OUTPUT_ROOT=//p" "$env")
  replay=$(sed -n "s/^KOIOS_NEWS_ROUTINE_PUBLICATION_REPLAY_ROOT=//p" "$env")
  for path in "$queue" "$output" "$replay"; do
    [ -n "$path" ] || continue
    printf "== %s ==\\n" "$path"
    find "$path" -maxdepth 3 -mindepth 1 -printf "%y %p %s bytes\\n" 2>/dev/null | head -80
  done
  journalctl --user-unit="$unit" -n 40 --no-pager -o short-iso
'
```

Read the last `ScheduledDeliveryTickResult` as the queue state: `attempted: 0`
with `Result=success` means no due delivery was invoked on that tick; it does
not mean that the queue directory is empty.  Queue jobs, replay reservations,
and retained offline candidates are different artifacts.  A candidate is not
a live release or ScheduleDelivery acceptance; inspect its marker and
`routine-publication-receipt.json` read-only, and leave activation, replay,
or delivery to the separately authorized operation.

## Reading known files read-only (porting/reference tasks)

A task that names specific files to read (a code-port, a spec review) is
narrower than a survey but the same discipline applies harder: the goal
is zero bytes written anywhere on the remote host.

- Batch the reads in one `ssh` call with a header per file so multiple
  files come back distinguishable in one round trip:
  ```sh
  timeout 30 ssh -o BatchMode=yes -o ConnectTimeout=8 cold-red-gate '
    for f in src/director.mts src/npc-agency.mts src/interiority.mts src/campaign.mts; do
      echo "=== $f ==="
      cat "/home/emsenn/561-group/services/fizzos/$f"
    done
  '
  ```
  `cat` is the whole tool — never `sed -i`, `>`, `>>`, `tee`, `touch`, or
  an editor invocation against a remote path, even to "just view" it.
- To keep a local copy for reference during the port, redirect the ssh
  command's own stdout to a local file (the write happens on this box,
  not the remote one) — `ssh ... 'cat remote-file' > /local/scratch/copy`
  — never `scp` back and forth as a substitute for reading, and never
  write into anything under the remote checkout.
- Enumerate before reading: `find <dir> -maxdepth N -iname '*.mts'` (or
  `ls`) to confirm the real file list, rather than trusting a task
  brief's path/filename guesses — directory names and module groupings
  drift from what a brief assumes (see "Finding a topic's code" below
  for the general case). Worked example: fizzos has no `director/`,
  `npc-agency/`, `interiority/`, or `campaign/` *directories* — those
  are flat module names at the top of `src/` (`src/director.mts`,
  `src/npc-agency.mts`, `src/interiority.mts`, `src/campaign.mts`,
  each paired with its own `*.test.mts`), confirmed by `find`/`ls`
  against the actual host rather than assumed from the brief's wording.

## Deciding whether a package's tests are side-effect-free before running them

Never run a remote `npm test`/`pnpm test` on the assumption that "test"
implies read-only. Read the `scripts` block in `package.json` (and any
`pretest`/`posttest`) before running anything:

```sh
timeout 10 ssh -o BatchMode=yes -o ConnectTimeout=8 cold-red-gate \
  "grep -A8 '\"scripts\"' /home/emsenn/561-group/services/fizzos/package.json"
```

- A script counts as a **mutation**, not side-effect-free, if it contains
  any of: `rm -rf`, `>`/`>>`/`tee` redirection, `mkdir`, a compiler or
  bundler invocation that writes output (`tsc` without `--noEmit`,
  `webpack`, `esbuild` without stdout output), `git commit`/`push`, or a
  network call. Writing into a build/dist/tmp directory still counts —
  "doesn't touch tracked source" is not the bar; "writes zero bytes
  anywhere in the checkout" is.
- Worked example, fizzos, verified 2026-08-31: its `test` script is
  `"rm -rf .tmp/test-dist && tsc -p tsconfig.test.json && node --test
  --test-concurrency=1 '.tmp/test-dist/**/*.test.mjs'"` — it deletes and
  rebuilds `.tmp/test-dist` on every run. That is a mutation (a delete
  plus a compiler write), so it does not qualify as side-effect-free
  even though it never edits `src/`. Do not run it over SSH for a
  read-only task; read the `*.test.mts` files as specs instead (they
  document expected behavior without executing anything), and say
  explicitly in the report that tests were read, not run, and why.
- If a script is genuinely side-effect-free (a bare `tsc --noEmit`, a
  linter with no `--fix`, a read-only diff), running it is fine under
  the same `timeout`+`BatchMode` wrapper as everything else in this
  file — but confirm that from the actual script text, never from the
  script's name.

## Where data lives, per host

- **bare-cedar-fog (this laptop)**: the repo tree itself
  (`/home/emsenn/info`); Claude session transcripts at
  `~/.claude/projects/-home-emsenn-info/*.jsonl` (subagent transcripts
  under `<session-id>/subagents/`); Codex sessions under
  `~/.codex/sessions/`; shell history `~/.bash_history`; local
  Verdaccio cache — locate its live storage path with
  `systemctl --user show verdaccio -p WorkingDirectory,FragmentPath`
  rather than assuming a path (per "the checkout is not a runtime,"
  runtime state lives outside the git tree).
- **cold-red-gate (VPS)**: home dir `/home/emsenn` — same
  `.claude`/`.codex`/`.bash_history` shape as the laptop, plus
  `~/.config/systemd/user/*.service` for unit definitions; the deploy
  tree at `/home/emsenn/561-group` (site/service checkouts —
  `WorkingDirectory` on `561-group-site.service` confirms
  `/home/emsenn/561-group/sites/561.group`); `/srv/koios.news`;
  `/opt/vultr`. Enumerate live services first with
  `systemctl --user list-units --type=service --no-pager` (needs
  `export XDG_RUNTIME_DIR=/run/user/$(id -u)` first, see above), then
  read each one's `WorkingDirectory` to find its data.
  **Its own Claude/Codex session transcripts are keyed by the deploy
  tree's path, not the laptop's** — `~/.claude/projects/` on cold-red-gate
  holds a `-home-emsenn-561-group` directory (and others per checkout
  path worked in from that box), never `-home-emsenn-info`; verified
  2026-08-31 it holds 246 session `.jsonl` files, a distinct transcript
  store from the laptop's own history and worth checking separately for
  any topic surveyed there. `~/.codex/sessions/` follows the same
  `YYYY/MM/DD/rollout-*.jsonl` shape as the laptop.
- **bare-cedar-fog-cloud-mirror (GCP VM)**: unreachable as of
  2026-08-31 (see above) — do not assume a filesystem shape for it,
  report the reachability failure instead.

## Finding a topic's code, notes, or transcripts when directory names don't help

Directory names rarely match the topic. On cold-red-gate the MUD/game
engine lives at `/home/emsenn/561-group/services/fizzos`
(`src/farstone-game.mts`, `.tmp/test-dist/mud-server.mjs`, etc.) —
nothing in that path says "mud"; it only turns up by content-grepping
for the topic word across code and notes (see the grep pattern below),
or via a corpus search (`mcp__markdown-vault__search_markdown_vaults`
for notes, `mcp__jsnode-server__jsnode_search` for package names/
descriptions on this laptop's tree). Do the same for session
transcripts: grep the `.jsonl` files directly for the topic word (they
are plain JSON lines; a jq/parse step is unneeded read overhead).

Once a topic's resource is found, do not assume it's live: cross-reference
its path against `systemctl --user list-units --type=service --no-pager`
(with `XDG_RUNTIME_DIR` set, see above) — read each candidate unit's
`WorkingDirectory`/`FragmentPath`/`ExecStart` and check `ss -tlnp` for an
actual listener. A checkout with no matching unit and no listening port is
a dormant/offline resource, not a running service — report it as such
rather than inferring liveness from the code's existence.

## Confirming which host actually serves a subdomain

The org-machines record's "serves" list is a claim, not a live check —
confirm it fresh, same discipline as the gcloud reality checks above:

- Resolve from the laptop with what's actually installed here — this box
  has no `dig`/`nslookup`; `getent hosts <domain>` and `curl -sv` (which
  prints the resolved IP during the TLS handshake) are the tools that
  work. An address matching the VPS's own IP (e.g. 45.76.19.133 for
  cold-red-gate, per the machines record) means the domain resolves
  straight to that host; a Cloudflare anycast address (`2606:4700:...`,
  `104.16-31.x.x`, `172.64-71.x.x`) means the domain runs through
  Cloudflare edge (a Worker or CF-proxied origin) and will NOT appear in
  that VPS's Caddyfile.
- Cross-check ground truth on each side: `grep -nE "<domain>"
  ~/.config/caddy/Caddyfile` over SSH for what cold-red-gate itself
  terminates (only domains with a `{ }` block there are actually served
  by that host, regardless of what any record claims); grep local
  `wrangler.toml`/`wrangler.jsonc` `routes`/`route` fields for what a
  Cloudflare Worker claims to answer for.
- `curl -sD - -o /dev/null -m 8 https://<domain>/` for the HTTP status —
  but the status alone doesn't say which layer answered; read it together
  with the resolved address and the Caddyfile/wrangler grep, not in
  isolation.
- A domain that doesn't resolve at all (`curl: Could not resolve host`,
  empty `getent hosts`) is a distinct finding from a resolving host that
  errors — report both, verbatim, rather than treating "no response" as
  "down."

A Caddyfile block existing is not proof the backend is alive: a
`reverse_proxy 127.0.0.1:<port>` block only proves cold-red-gate is
*configured* to forward there — check `ss -tlnp` for that exact port.
Verified 2026-08-31: `turntide-islands.561.group` has a live block
(`reverse_proxy 127.0.0.1:18847`) but nothing listens on 18847 —
`turntide-islands.service` is `masked`/inactive and the sibling
`tti-turntide-runtime.service` is `disabled`/inactive. The route is
configured and the domain would 502, not the "not live anywhere" case
`mud.561.group` is (below) — report these as the distinct findings they
are: no-DNS, DNS-but-no-Caddy-block, Caddy-block-but-no-listener, and
actually-serving are four different states, not two.

For example: `ops.561.group` resolves to 45.76.19.133 (the VPS itself)
and has a hand-maintained block in cold-red-gate's
`~/.config/caddy/Caddyfile` (HTTP 401 — expected, it's an OAuth-gated MCP
gate). `farstone.561.group` resolves to Cloudflare anycast addresses and
has no block in that Caddyfile — it is served by the `cloudflare-router`
Worker
(`lib/emsenn/services/561-group/services/engineering-services-section/services/computer-engineering-services-section/services/computer-systems-engineering-services-section/services/computer-web-engineering-services-section/services/web-platform-services-section/services/cloud-services-section/services/cloudflare-services-section/services/cloudflare-router/wrangler.jsonc`),
which returned HTTP 500. `mud.561.group` does not resolve at all (no DNS
record) — it is not live anywhere, on the VPS or on Cloudflare.

## Safe search patterns for a bounded thematic survey

Wrap remote search the same way as any other command — `timeout` +
`ssh -o BatchMode=yes -o ConnectTimeout=8` — and keep the remote side
cheap and bounded. Swap the `-iE` keyword alternation for whatever topic
is being surveyed (money terms below; a MUD survey used
`"\bmud\b|farstone"`):

```sh
timeout 60 ssh -o BatchMode=yes -o ConnectTimeout=8 cold-red-gate '
  nice -n 19 ionice -c3 grep -rliE "invoice|ledger|revenue|payment|stripe|income" \
    --include="*.md" --include="*.json" --include="*.mjs" --include="*.mts" \
    -I --exclude-dir={node_modules,.git,.pnpm-store} \
    /home/emsenn/561-group /home/emsenn/info 2>/dev/null | head -50
'
```

- `nice -n 19 ionice -c3` (idle I/O class) on anything that walks a
  whole tree — a survey must not compete with the services it is
  reading past.
- Scope `find`/`grep` to known directories (home, the deploy tree, `/srv`)
  rather than `/` — cap results (`head -N`, `-m` on grep) and always
  wrap with an outer `timeout` so a bad glob can't hang the session.
- `-I` on grep skips binaries; `--exclude-dir` keeps `node_modules`/`.git`
  churn out of results.
- For session transcripts, grep the `.jsonl` files directly (they are
  plain JSON lines) rather than trying to parse them remotely — pull
  matches with line context, not the whole file.
- Session/history files may contain the owner's real secrets or
  personal detail incidental to the money question — report file paths
  and matched line context, not full file dumps, unless the finding
  itself requires the content.

## Bounded topic survey (worked pattern: "what MUD-related things live here")

A full-topic survey ("everything about X on host Y") is the same
primitives above, run as a short, ordered batch rather than one grep —
each step answers a different question and none of them assume the
others' answer. Four `ssh` round trips is enough for a whole host;
don't multiply calls per candidate name when one `-iE` alternation
covers them all.

1. **Services** — one call, both active and inactive units, one
   `-iE` alternation of every name-form the topic goes by (engine
   names, product names, informal words):
   ```sh
   timeout 20 ssh -o BatchMode=yes -o ConnectTimeout=8 cold-red-gate '
     hostname
     export XDG_RUNTIME_DIR=/run/user/$(id -u)
     systemctl --user list-units --all --no-pager | grep -iE "mud|farstone|feltos|fizzos|lagoon|qtops"
     systemctl --user list-unit-files --no-pager | grep -iE "mud|farstone|feltos|fizzos|lagoon|qtops"
   '
   ```
   `--all` matters: a masked/disabled/inactive unit (a dormant deploy,
   not a removed one) never shows in the plain `list-units` the other
   patterns in this file use for "what's currently running."
2. **Routes** — grep the Caddyfile with the same alternation, then
   cross-check every matched `reverse_proxy` port against `ss -tlnp`
   (see the liveness note above) in the same call:
   ```sh
   timeout 15 ssh -o BatchMode=yes -o ConnectTimeout=8 cold-red-gate '
     grep -niE "mud|farstone|feltos|fizzos|lagoon|qtops" ~/.config/caddy/Caddyfile
     ss -tlnp
   '
   ```
3. **Checkouts and code** — the bounded content sweep from "Safe search
   patterns" above, swapping in the topic alternation, scoped to the
   known deploy roots (never `/`):
   ```sh
   timeout 60 ssh -o BatchMode=yes -o ConnectTimeout=8 cold-red-gate '
     nice -n 19 ionice -c3 grep -rliE "\bmud\b|farstone|feltos|fizzos|lagoon|qtops" \
       --include="*.md" --include="*.json" --include="*.mjs" --include="*.mts" --include="*.service" \
       -I --exclude-dir={node_modules,.git,.pnpm-store,dist,.tmp} \
       /home/emsenn/561-group /srv /opt/vultr 2>/dev/null | head -60
   '
   ```
   A hit under a checkout with no matching unit/listener (step 1/2) is a
   dormant dev tree, not a live service — say so explicitly, per
   "Finding a topic's code" above. An absent name in this sweep (e.g. a
   theory/engine name that only exists on the laptop) is itself a
   finding: report the negative rather than assuming the name must be
   somewhere on the host.
4. **Session/transcript history** — grep both this host's own
   `.claude`/`.codex` project trees (note: keyed by *this host's* working
   paths, not the laptop's — see "Where data lives" above) for the same
   alternation, narrower than a full-text search since transcripts are
   large:
   ```sh
   timeout 60 ssh -o BatchMode=yes -o ConnectTimeout=8 cold-red-gate '
     nice -n 19 ionice -c3 grep -liE "\bmud\b|farstone|feltos|fizzos" \
       ~/.claude/projects/*/*.jsonl 2>/dev/null | wc -l
     nice -n 19 ionice -c3 grep -rliE "\bmud\b|farstone|feltos|fizzos" \
       ~/.codex/sessions 2>/dev/null | head -20
   '
   ```
   Report counts and paths, not content dumps (session files may carry
   secrets incidental to the topic, per the discipline above).

Worked result for the MUD survey on cold-red-gate, 2026-08-31 (see the
skill's owning session's report for full verbatim output): no unit
named for any MUD engine, active or masked, except the unrelated
Discord-bot `turntide-islands*` units; `turntide-islands.561.group` has
a Caddy route to a port nothing listens on; `mud.561.group` has no
block on this host at all and does not resolve anywhere; "LAGOON" and
"qtOps" produced zero hits anywhere on this host — laptop-only
concepts, not a stale name for something deployed here;
cold-red-gate's own `~/.claude/projects/-home-emsenn-561-group/` held
246 session transcripts, 171 matching the MUD alternation — a session
history distinct from and larger than whatever the laptop's own
transcript store shows for the same topic.

**This has since changed for farstone specifically — re-measured live
2026-09-01.** `farstone.service` is now `loaded`/`enabled`/`active
(running)`, its checkout is a real farstone-convention release (not the
dormant `/home/emsenn/561-group/services/fizzos` build tree — that
checkout still exists and is still where `@emsenn/fizzos`'s own FeltOS
engine code and tests live, but it is not what's deployed), and
`farstone.561.group` now has a live `reverse_proxy 127.0.0.1:18820`
block in cold-red-gate's Caddyfile. This is exactly the shape the next
section documents — read it before assuming this survey's snapshot
still holds for any of these four names, and re-measure rather than
trusting either paragraph once the wave in progress changes it further.

## Deploying a farstone-convention release wave (worked reference: farstone)

Farstone is the PROVEN reference deployment for the "release
dir + `current` symlink + release-local `.npmrc` + state dir + systemd
--user unit + inert Caddy block + journal receipt" convention. Read the
live tree, don't assume a path — the correct root is
`~/.local/share/561-group/releases/<service>/`, **not**
`~/561-group/releases/<service>/` (that tree doesn't exist; `~/561-group`
is the deploy *checkout* root, releases live under `~/.local/share`,
per "the checkout is not a runtime"). Verified 2026-09-01 on
cold-red-gate:

- Release tree: `~/.local/share/561-group/releases/farstone/20260901-1/`
  (full source + `node_modules` + release-local `.npmrc` pinning the
  house scopes at `http://127.0.0.1:4873/`), with
  `~/.local/share/561-group/releases/farstone/current` a symlink to the
  live tag.
- State: `~/.local/state/561-group/farstone/world.json` (+
  `.clock.json`), referenced by the unit's `EnvironmentFile`.
- Unit: `~/.config/systemd/user/farstone.service` — `WorkingDirectory`
  points at the `current` symlink (not the tag directly, so a symlink
  flip is the whole cutover), `ExecStart` runs the release's own
  `src/serve.mts` with the pinned node
  (`~/.nvm/versions/node/v24.16.0/bin/node`), `Restart=always`.
- Env file: `~/.config/561-group/farstone.env` sets `HOST=0.0.0.0` (both
  transports bind wide) — non-public exposure of the HTTP port is
  enforced by ufw's default-deny with no allow rule for it, **not** by
  the bind address. Read this file's own header comment before assuming
  which port is the public one.
- Caddy block: hand-maintained in `~/.config/caddy/Caddyfile`, marked
  "survives deploy-caddy managed-section rewrites", explicitly noted
  inert until DNS points the subdomain at this host — model any new
  lane's block on this comment shape.
- Cutting the release: the reusable capability is
  `@red-cup-engineering/node-runtime-release-materialization-service`
  (`materialize-node-runtime-release` bin) — content-addresses the
  runtime files and writes a `release-receipt.json` naming every
  included package/exact-version. Use it rather than hand-copying a
  tree; farstone's own `20260901-1` release lacks that file, which is a
  finding against that lane, not a reason to skip it for the next four.
- Deployment receipt: written through
  `@red-cup-engineering/semantic-record-journal-service` into the
  *owning section's* `data/logs/YYYY/MM/DD/witness-journal-seavt.jsonl`
  as an EAVT row (`{a:"deployment", e:"ni:///sha-256;...", t, v}`) whose
  `v` is a `NodeRuntimeReleaseMaterializationReceipt` (fields:
  `artifactDigest`, `byteCount`, `changeSummary`, `deployment` object
  (`caddyBlock`, `envFile`, `httpBind`, `stateDir`, `telnetBind`/
  equivalent, `unit`), `entryCarrier`, `entryPackage`, `fileCount`,
  `host`, `nodeVersion`, `packages`, `proof` object (see below),
  `releaseDirectory`, `releaseTag`, `testSuite: {command, pass, fail,
  total}`, `type`, `version`) — worked example at
  `lib/emsenn/services/561-group/services/public-services-section/services/public-computer-services-section/services/public-web-services-section/services/public-web-game-services-section/services/farstone-services-section/data/logs/2026/09/01/witness-journal-seavt.jsonl`.
  Point each new lane's receipt at *its own* owning section's
  `data/logs/`, never farstone's — this location is a worked example,
  not the destination for the other three services.

### Memory capacity gate (missing from every pattern above — this box is
### small: 1640MB total)

Run before AND after every lane, not just once for the whole wave:

```sh
timeout 10 ssh -o BatchMode=yes -o ConnectTimeout=8 cold-red-gate free -m
```

Read the `available` column (not `free` — `free` excludes reclaimable
buff/cache and will look far scarier than the real number). **Stop the
wave** if `available` drops below 250MB after bringing a lane up —
don't start the next lane's release/unit/test cycle on top of it.
Baseline measured 2026-09-01: `total 1640, used 942, free 135,
buff/cache 763, available 698` — comfortably above the floor, but each
of four stateful lanes will eat into it; re-measure, don't assume this
number still holds by the fourth lane.

### Unit-up-60s-0-restarts check

`systemctl --user status <unit> --no-pager` shows the human summary but
not restart count reliably at a glance; pull both explicitly:

```sh
timeout 15 ssh -o BatchMode=yes -o ConnectTimeout=8 cold-red-gate '
  export XDG_RUNTIME_DIR=/run/user/$(id -u)
  systemctl --user show <unit> -p NRestarts,ActiveEnterTimestamp,MainPID --no-pager
  date -u
'
```

Compare `ActiveEnterTimestamp` to the `date -u` printed in the same
call to get elapsed seconds without relying on clock skew between the
laptop and the host. Require `NRestarts=0` and elapsed ≥60s before
treating the lane as up — a unit that's restarted even once inside that
window is a crash-loop candidate, not a clean start (farstone's own
receipt records this exact pair: `NRestarts=0`,
`ActiveEnterTimestamp=Tue 2026-09-01 02:00:54 UTC`, confirmed against a
scripted live-proof session run after the 60s mark, not against the
`Active: active (running)` line alone).

### Curl through the lane's own Caddy block, locally

Caddy proxies to a loopback port — curl that port directly on the box,
not the public domain (which is inert until DNS per the block's own
comment):

```sh
timeout 10 ssh -o BatchMode=yes -o ConnectTimeout=8 cold-red-gate \
  'curl -sD - -o /dev/null -m 8 http://127.0.0.1:<port>/'
```

Expect `HTTP/1.1 200`. This checks the app answers; it does not check
the Caddy block itself parses/loads — `caddy validate` or a `caddy
reload` output would be the layer above this if the block is new.

### Confirming the HTTP port is NOT publicly exposed (ufw)

```sh
timeout 10 ssh -o BatchMode=yes -o ConnectTimeout=8 cold-red-gate \
  'sudo -n ufw status verbose'
```

`sudo -n` works passwordless for `emsenn` on this box (verified
2026-09-01 — falls straight through without a `sudo -n` failure/prompt).
Default policy is `deny (incoming)`; confirm there is **no** explicit
`ALLOW IN` line for the lane's internal HTTP port (farstone's 18820
has none — that absence, combined with the default-deny policy, *is*
the proof). For the strongest confirmation, mirror farstone's own
receipt method and curl the public IP:port from the laptop itself,
expecting a timeout (`curl` exit code 28), not a connection refusal or
a response:

```sh
curl -sD - -o /dev/null -m 6 http://45.76.19.133:<internal-port>/ ; echo "exit $?"
```

If the lane's game protocol genuinely needs a public port (farstone's
telnet on 4242 is the model — already `ALLOW IN` for both v4/v6 with a
`# farstone telnet` comment), open exactly that port, nothing wider:

```sh
timeout 10 ssh -o BatchMode=yes -o ConnectTimeout=8 cold-red-gate \
  "sudo -n ufw allow <port>/tcp comment '<service> <protocol>'"
```

Verified 2026-09-01 full rule set on cold-red-gate: 22/tcp (SSH),
80,443/tcp (Nginx Full — Caddy sits behind this, misleadingly named),
8000/tcp, 30303/tcp+udp scoped to one source IP (a chain validator,
unrelated to any game lane), and 4242/tcp (farstone telnet) — v4 and v6
each. Each of the four new lanes gets its own such review: don't assume
a shared port range, and never open a range wider than the one port the
protocol needs.
