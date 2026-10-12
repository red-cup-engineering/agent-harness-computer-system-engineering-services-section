---
name: find-operator-guides
description: Use when you need to know how a house operator guide, the npm registry, jsnode/MCP tooling, Guix toolchain, bounded read-only GCP IAM/Workload Identity Federation, or GitHub Actions execution/triggering audit works.
---

# Find operator guides

Read the operator handbook index at
`lib/emsenn/services/561-group/services/561-group-services-section/content/text/documents/articles/teaching-articles/guides/operator-handbook.md`
first — it is one short list of what question each house guide answers, with a
relative path to each. Find the line matching the question at hand, then read
that specific guide (or glossary term, note, roadmap record, or rule file) for
the actual content; don't try to answer from the index's one-line description
alone.

## npm dependency acquisition failure (private registry and public tool)

Use this bounded procedure when a build, `npx`, `npm ci`, or publish workflow
cannot acquire an exact package version.  It determines the custody-correct
way to obtain the dependency; it does not silently substitute a download,
rewrite a lockfile, change a registry, or bypass the house package policy.

1. Establish the requesting package, command, exact package specifier, and
the actual failure class before attempting a repair.  Read its manifest,
lockfile if present, repository/workflow command, and the configured registry
without printing credentials.  Read the operator handbook index and then the
house npm-registry guide.  That guide establishes that `registry.561.group`
is canonical for house scopes while public packages normally resolve from
npmjs; a global default registry setting can therefore make an unmirrored
public build tool unavailable.

   ```sh
   npm config get registry
   npm config get @emsenn:registry
   npm config get @561-group:registry
   rg -n --glob 'package.json' --glob 'package-lock.json' --glob 'npm-shrinkwrap.json' \
     --glob 'pnpm-lock.yaml' --glob 'yarn.lock' --glob '!node_modules/**' \
     'PACKAGE_NAME|PACKAGE_VERSION|registry\.561\.group|registry\.npmjs\.org' REQUESTING_PATH
   sed -n '1,220p' PATH_TO_WORKFLOW_OR_SCRIPT
   ```

   Do not print `npm config list`, `.npmrc`, or environment dumps: those may
   expose bearer tokens.  Record only registry URLs, package specifiers, and
   the command that asks for the dependency.

2. Classify the observed failure exactly.  `E404` from the configured registry
means that registry has no accessible record for the requested package; it is
not DNS or a local cache failure.  `E401`/`E403` means authentication or
authorization is missing or rejected; `ENOTFOUND`, `EAI_AGAIN`, connection
refusal, or TLS failure is transport/DNS; `ETIMEDOUT`/`ECONNRESET` is
transient transport; integrity failures concern an already selected artifact.
Only after recording the class may a caller use the relevant operator route.

   ```sh
   npm view 'PACKAGE_NAME@PACKAGE_VERSION' version dist.tarball \
     --registry=OBSERVED_REGISTRY --fetch-retries=0 --fetch-timeout=10000
   npm view 'PACKAGE_NAME@PACKAGE_VERSION' version dist.tarball \
     --registry=https://registry.npmjs.org/ --fetch-retries=0 --fetch-timeout=10000
   ```

   These are read-only metadata probes.  The second probe distinguishes a
   package absent from the house registry from one absent upstream; it does
   not authorize installing from npmjs.  Never turn an `npx ...@latest` into
   a floating replacement while diagnosing a pinned or workflow-critical
   version.

3. Check local evidence narrowly before re-fetching.  Prefer the named
package/version and known global prefix over broad scans of npm caches or the
home directory.  A cached or globally installed artifact is evidence of what
this machine once acquired, not authorization to copy it into the repository
or to treat it as a releasable source.

   ```sh
   npm root -g
   npm ls -g --depth=0 PACKAGE_NAME
   npm cache npx ls
   npm cache ls 'PACKAGE_NAME@PACKAGE_VERSION'
   ```

   If an npm version does not support a cache subcommand, report that command
   as unavailable rather than falling back to `find` over cache directories.
   Do not clean caches during diagnosis: their entries can be useful evidence
   and cleaning does not repair registry custody.

4. Select the canonical acquisition path from the evidence.  A house-scoped
package must be restored or published through `registry.561.group` under the
normal publish gate; do not point its manifest at a tarball or a laptop cache.
For an unscoped public tool such as `pagefind@1.5.2`, if npmjs proves the
version exists and the house registry returns `E404`, use the established
public-package route (a scoped `.npmrc` configuration or an explicit,
reviewed npmjs registry for that one workflow command) so the package is
acquired from npmjs with its version pinned.  If house policy instead requires
mirroring public build tools, hand the missing exact package/version to the
registry operator and wait for the canonical mirror; do not vendor a tarball,
copy a global install, or alter the lock to a personal cache URL.

5. After an authorized acquisition repair, run the requesting command in a
fresh, bounded dependency context and verify the exact resolved version and
registry URL from its lock/cache metadata.  Then rerun the local build before
any publish.  Report separately: configured registry, source availability,
artifact acquisition, local build, pushed revision, workflow result, and live
route.  A successful local `npx` invocation is not proof that CI or the live
site can resolve the same dependency.

## Read-only GCP IAM and Workload Identity Federation audit

For an audit of a small, named set of repository-scoped deployment identities,
do not change Cloud IAM, GitHub configuration, credentials, or the checkout.
Start from five explicit rows supplied by the request or evidence, each with
the repository, workflow/ref subject expected to run it, and Google service
account. Do not turn a discovery listing into authority to audit every identity
in the project.

1. Establish the exact project number and project ID, then record the five
   target service-account email addresses as inputs. Project number is required
   to distinguish the expected `principalSet://iam.googleapis.com/projects/…`
   member from a superficially similar one.

   ```sh
   PROJECT_ID=five-six-one-group-dev
   gcloud projects describe "$PROJECT_ID" \
     --format='json(projectNumber,projectId,lifecycleState)'
   gcloud iam service-accounts list --project="$PROJECT_ID" \
     --format='table(email,displayName,disabled)'
   ```

2. Read both policy surfaces. Project-level policy can grant a broad role;
   each target service account's own IAM policy is where GitHub OIDC workload
   principals normally receive `roles/iam.workloadIdentityUser`. Preserve
   bindings, members, and conditions in JSON; do not infer authorization from
   service-account existence or a repository workflow file.

   ```sh
   gcloud projects get-iam-policy "$PROJECT_ID" --format=json
   gcloud iam service-accounts get-iam-policy "$SERVICE_ACCOUNT" \
     --project="$PROJECT_ID" --format=json
   ```

3. Discover the global WIF control plane, then describe only pools/providers
   that appear in the service-account members. A valid binding must resolve to
   an existing pool/provider whose issuer, attribute mapping, and attribute
   condition constrain the expected GitHub organization/repository and, when
   applicable, branch/tag/environment. A provider's existence alone does not
   prove a target can impersonate a service account.

   ```sh
   gcloud iam workload-identity-pools list --project="$PROJECT_ID" \
     --location=global --format=json
   gcloud iam workload-identity-pools providers list --project="$PROJECT_ID" \
     --location=global --workload-identity-pool="$POOL_ID" --format=json
   gcloud iam workload-identity-pools providers describe "$PROVIDER_ID" \
     --project="$PROJECT_ID" --location=global \
     --workload-identity-pool="$POOL_ID" --format=json
   ```

4. Compare every target row across the three independent records: the
   repository workflow's declared provider/service-account, the target
   service-account policy member and condition, and the WIF provider issuer,
   mapping, and condition. Report an exact match, a mismatch, missing evidence,
   or an over-broad grant separately. Never print access tokens, credential
   files, private keys, or full environment dumps.

5. Finish with evidence rather than a remediation. The audit output must name
   the commands and their timestamp, project number, the five target inputs,
   and per-target findings. Proposed IAM/WIF changes require a separate
   authorized change request and are not part of this procedure.

## Read-only GitHub Actions free-execution and triggering audit

Use this procedure to determine whether exactly five named repositories can
receive or trigger GitHub Actions execution without an approved paid resource.
It is an observation procedure, not permission to activate Actions, change a
workflow, spend a quota, or make an API call that changes remote state.

1. Establish the exact five `OWNER/REPO` inputs from committed repository
   records before contacting GitHub. Record each input, its record path and
   line, and the audit timestamp. A search result, a local checkout name, or a
   guessed organization is not a target. If the committed records do not yield
   exactly five unambiguous repository IDs, report `scope unresolved` and stop;
   do not enumerate organizations or use GitHub search to manufacture scope.

   ```sh
   git ls-files | rg '(^|/)(repositories|records|youtube)(/|$)'
   rg -n --glob '!node_modules/**' --glob '!legacy/**' --glob '!archives/**' \
     'OWNER/REPO|github\.com/[^/[:space:]]+/[^/[:space:]]+|youtube' PATH_FROM_RECORD_LIST
   ```

2. Confirm only that the local clients can perform a read-only audit. Do not
   print configuration, environment variables, tokens, credential files, or
   HTTP request tracing. `gh auth status` may show the authenticated account
   and granted scopes, which are audit evidence but not a request to log in.

   ```sh
   gh --version
   gh auth status
   gh api --method GET /rate_limit --jq '.resources.core | {limit, remaining, reset}'
   ```

3. For each declared target, read repository identity and Actions policy with
   GET requests only. These records establish whether Actions is enabled and
   whether the repository's default or fork-pull-request settings could admit
   execution; they do not by themselves prove that an event is scheduled or
   that capacity is free.

   ```sh
   REPO=OWNER/REPO
   gh api --method GET "/repos/$REPO" \
     --jq '{full_name, private, archived, disabled, default_branch}'
   gh api --method GET "/repos/$REPO/actions/permissions"
   gh api --method GET "/repos/$REPO/actions/permissions/workflow"
   gh api --method GET "/repos/$REPO/actions/permissions/fork-pr-contributor-approval"
   ```

4. Inspect the committed workflow declarations at the default-branch ref and
   the observed workflow/run history separately. A `schedule` stanza is only a
   declared trigger; run history shows past dispatches but does not prove that
   the next schedule will run. Preserve workflow path, `on:` event names,
   schedule cron expressions, workflow state, run event, conclusion, and
   timestamps. Do not use `gh workflow run`, `gh run rerun`, `gh run cancel`,
   `workflow_dispatch`, or repository-dispatch as a test.

   ```sh
   DEFAULT_BRANCH=main # replace with the value returned by /repos/$REPO
   gh api --method GET "/repos/$REPO/contents/.github/workflows?ref=$DEFAULT_BRANCH" \
     --jq '.[] | {name, path, sha, type}'
   gh api --method GET "/repos/$REPO/actions/workflows?per_page=100" \
     --jq '.workflows[] | {id, name, path, state, created_at, updated_at}'
   gh api --method GET "/repos/$REPO/actions/runs?per_page=100" \
     --jq '.workflow_runs[] | {id, name, path, event, status, conclusion, created_at, updated_at, run_started_at}'
   gh api --method GET "/repos/$REPO/contents/.github/workflows/WORKFLOW_FILE?ref=$DEFAULT_BRANCH" \
     -H 'Accept: application/vnd.github.raw'
   ```

   Read each returned YAML file locally for `on`, `schedule`, `workflow_dispatch`,
   `pull_request`, `pull_request_target`, `push`, reusable-workflow calls, and
   external Actions references. Report absent workflows or inaccessible source
   as evidence gaps, never by inferring a trigger from a file name.

5. Read usage/billing evidence where the token is authorized. The endpoint is
   an observation of recorded usage and included/paid minutes, not a promise of
   present or future free capacity. GitHub plan, ownership, runner type,
   repository visibility, and account-level limits may change the result.

   ```sh
   gh api --method GET "/repos/$REPO/settings/billing/actions" \
     --jq '{total_minutes_used, total_paid_minutes_used, included_minutes, minutes_used_breakdown}'
   ```

6. Classify every command result exactly. `200` is observed evidence; an empty
   list is an observed absence for that endpoint. `401` means no usable
   authentication; `403` means authorization, policy, or rate-limit denial
   (record response status and rate-limit headers); `404` means nonexistent or
   intentionally hidden repository/endpoint; `422` means unsupported or
   inapplicable request; `429` means throttling; and `5xx`/transport failure is
   transient external failure. Do not reauthenticate, request scopes, create a
   token, enable Actions or billing, enable an API, alter permissions, or retry
   aggressively. Report the affected evidence as `unavailable`, with the exact
   status class, rather than treating a denial as proof of no cost or no trigger.

7. The final per-repository finding must keep four facts distinct: declared
   triggers, observed historical execution, Actions admission policy, and
   billing/usage evidence. Conclude `free execution established` only when all
   four are directly evidenced for the stated event and runner; otherwise use
   `not established` and name the missing or denied evidence. Any action that
   could enable, dispatch, approve, rerun, cancel, alter, purchase, or delete
   is outside this audit and needs a separate authorized change request.

## Free-only YouTube delivery boundary and activation evidence

Use this procedure when a proposed YouTube path is described as "free" and
the question is whether it can actually run without silently creating a paid
Google Cloud workload.  Keep three independently variable things separate:

- **YouTube Data API/OAuth access** is a Google API request path.  A project
  with the API enabled, an OAuth client, a holder's authorized grant, and
  available API quota can make a bounded `channels.list` or upload request.
  Enabling that API changes only its service-consumer state: it does not attach
  a billing account, turn on a GCP runtime, create an OAuth client, or grant a
  user consent.  Conversely, enabled API state is not evidence that a
  deployment is paid.  OAuth proves delegated identity/consent for its scopes;
  it does not prove quota, channel ownership, scheduling, or zero cost.
- **GitHub Actions execution** is a GitHub runner path.  A workflow may call
  the YouTube API, but its trigger, repository admission, runner type, and
  included/paid-minute evidence are GitHub facts.  Do not describe an API key
  or OAuth grant as proof that GitHub can run for free.
- **GCP runtime and attached services** are a separate billable surface.
  Cloud Run, Cloud Functions, Cloud Scheduler, Artifact Registry, Cloud
  Build, Secret Manager, Cloud Storage, egress, and logging/monitoring may
  require billing-account attachment or create charges even when a free tier
  or promotional allowance exists.  Do not enable an API, create a resource,
  deploy a container, attach billing, or infer zero cost from an API's free
  quota during a free-only audit.

1. Map each proposed component to its actual executor before testing it:
   `human/local machine`, `GitHub-hosted or self-hosted Actions runner`,
   `YouTube Data API`, or a named `GCP runtime/service`.  A YAML `schedule`,
   a Cloud Run service definition, and a OAuth client record are declarations;
   none establishes that the component is active.  If the requested design
   requires any GCP runtime/service, classify it `outside free-only evidence`
   until an authorized billing/charge assessment has been made.

2. Use the preceding GitHub Actions audit for the exact repository and
   workflow.  Its billing endpoint is evidence of recorded GitHub Actions
   usage only; it says nothing about Google Cloud charges or YouTube quota.
   Similarly, a GCP project being present or an API appearing in source does
   not establish a runnable workflow, an authorized channel, or a free
   runner.

3. For the YouTube side, retain the opaque-holder boundary: a credential
   holder may perform one separately authorized read-only identity probe such
   as `channels.list?part=id,snippet&mine=true`.  Record only the request
   class, HTTP status, returned channel ID/title, API project identity if
   supplied by the administrator, and timestamp.  Never record or print an
   authorization header, API key, client secret, refresh token, or credential
   JSON.  `200` identifies the currently authorized channel; `401` means
   absent/invalid authentication, `403` can mean denied scope, disabled API,
   quota/policy denial, or authorization denial, and must not be relabeled as
   "paid" or "free" without the provider's redacted reason.

4. Require activation evidence appropriate to the executor, not an intention
   to activate it.  A free-only YouTube delivery path is `activation
   established` only if all applicable rows are directly evidenced: (a) a
   committed workflow at the default-branch ref declares the intended event
   and API consumer, (b) GitHub reports Actions admitted and a completed run
   for that exact workflow/event/runner without paid-minute use where its
   billing evidence is available, (c) the opaque YouTube identity probe
   returns the intended channel, and (d) repository and deployed-resource
   inspection show no GCP runtime/service executor.  A schedule declaration,
   a successful local request, an OAuth client, a previous unrelated run, or
   a zero-traffic deployment is insufficient.  If an authorized live test is
   not in scope, report `activation not established; live dispatch not
   authorized` rather than dispatching an event.

5. Report four separate conclusions: `YouTube authorization/channel`,
   `GitHub execution admission and usage`, `GCP runtime presence`, and
   `activation`.  Use `cost unverified` whenever an endpoint is unavailable,
   a billing surface was not assessed, quota headroom is unknown, or a free
   tier is merely claimed.  Never collapse these into "free" because one API
   call or one historical Actions run succeeded.

### Billing-disabled YouTube API and Desktop OAuth proof

Use this addition when the project has no active billing account and the
specific question is whether YouTube Data API access and holder-performed
Desktop OAuth can proceed without re-enabling billing.  It permits no billing
mutation and does not turn the resulting authorization into a hosted
credential or a scheduled-publication claim.

1. Obtain the billing and API states independently, before and after any
   separately authorized API-enable operation.  These read-only commands do
   not attach, replace, or re-enable a billing account; record their JSON
   results and timestamp without dumping credentials.

   ```sh
   PROJECT_ID=five-six-one-group-dev
   gcloud projects describe "$PROJECT_ID" \
     --format='json(projectNumber,projectId,lifecycleState)'
   gcloud beta billing projects describe "$PROJECT_ID" \
     --format='json(projectId,billingAccountName,billingEnabled)'
   gcloud services list --enabled --project="$PROJECT_ID" \
     --filter='config.name:youtube.googleapis.com' \
     --format='json(config.name,state)'
   ```

   `billingEnabled: false` and an enabled `youtube.googleapis.com` record are
   compatible observations, but neither causes the other.  The former proves
   only the observed project billing attachment state; the latter proves only
   that the YouTube API service is enabled.  A missing API record, `403`, or
   `404` is an API/permission evidence gap, never evidence that billing must
   be enabled.

2. API enablement is a distinct, reversible configuration change and needs
   its own authorization.  If that authorization is present, use only the
   narrow service-enable operation below; it does **not** call a billing API.
   Immediately repeat the three read-only observations above and report the
   resulting billing state verbatim.  Do not substitute `gcloud billing
   projects link`, create a Cloud Run/Functions/Scheduler resource, create a
   service account, or deploy a container.

   ```sh
   gcloud services enable youtube.googleapis.com --project="$PROJECT_ID"
   ```

3. Keep Desktop OAuth completely outside the billing control plane.  The
   credential holder may run the repository's already-declared local Desktop
   OAuth consent setup for exactly one channel and then make one opaque
   `channels.list` `mine=true` identity probe.  Report only repository,
   declared channel, scope names, status, observed channel ID/title, and
   timestamp.  Never use a Cloud runtime, Secret Manager, API key, service
   account, `gcloud auth application-default`, or a copied refresh token as a
   replacement.  The OAuth grant is a holder-local delegated credential;
   billing remains `false` only when the separate billing-state observation
   still says so after the holder action.

4. State results with these exact boundaries: `API service enabled` is not
   `billing enabled`; `holder channel authorization established` is not
   `hosted secret induction`; and `workflow declared` is not `scheduled
   publication established`.  An OAuth `403` requires the holder's redacted
   provider reason (scope, consent, API, quota, policy, or authorization) and
   must not be treated as a billing diagnosis.  Preserve every repository as
   an independent OAuth lane; one green holder probe cannot authorize or
   supply another repository's refresh grant.

## Read-only credential-name, OAuth, and durable-state custody audit

Use this procedure when a bounded audit needs to answer where a named service
expects credentials or durable state, whether the committed configuration is
safe, and whether the existing read path could reach the intended YouTube
channel. It audits names, declared locations, metadata, and observed status;
it never reads a secret value. Do not expand the scope from the explicitly
named repositories, credential names, or Google projects.

1. Establish the target rows before inspecting either checkout or remote
   metadata: `OWNER/REPO`, the default branch, credential *name*, declared
   state path or environment-variable name, expected Google project, and
   intended YouTube channel identifier/handle if one is already recorded.
   A repository name alone is not authority to enumerate all local credential
   stores, all GitHub secrets, or all Google projects.

2. Treat secret-bearing sources as opaque. Never run `env`, `printenv`,
   `set`, `gh auth token`, `gcloud auth application-default print-access-token`,
   `gcloud secrets versions access`, `git config --list`, shell-history
   searches, recursive searches of a home directory, or commands that print
   credential files. Do not use `git grep -n` for a credential assignment: the
   matching line may contain a live value. File *names* and committed variable
   *names* are admissible evidence; values, JSON bodies, authorization headers,
   refresh tokens, client secrets, cookies, and full URLs containing a token
   are not.

   ```sh
   git grep -l -E 'NOTEBOOKLM_AUTH_JSON|API_KEY_GOOGLE_GEMINI|GOOGLE_[A-Z0-9_]*|YOUTUBE_[A-Z0-9_]*' -- \
     ':!node_modules' ':!legacy' ':!archives'
   git ls-files | rg '(^|/)(\.env(\.[^/]+)?|credentials|auth|token|secrets?)(\.|/|$)'
   ```

   The first command establishes only which tracked files mention a declared
   name. For each candidate, report a redacted structural fact such as
   `reads API_KEY_GOOGLE_GEMINI from process environment` or `expects a path
   named by NOTEBOOKLM_AUTH_JSON`; do not quote assignments. A tracked
   credential-shaped file is a finding even if ignored files are not in scope.

3. Inspect GitHub only with GET requests and only for each declared target.
   Repository settings, default-branch shape, branch/ruleset admission, and
   Actions secret/variable *names* are separate evidence. A `404` on branch
   protection can mean no legacy protection; it is not proof that rulesets do
   not apply. Do not list secret values, create a secret, rotate one, or use a
   workflow run to test injection.

   ```sh
   REPO=OWNER/REPO
   DEFAULT_BRANCH=main # replace with the observed repository default branch
   gh api --method GET "/repos/$REPO" \
     --jq '{full_name,private,archived,default_branch,visibility}'
   gh api --method GET "/repos/$REPO/branches/$DEFAULT_BRANCH" \
     --jq '{name,protected,commit:{sha:.commit.sha}}'
   gh api --method GET "/repos/$REPO/branches/$DEFAULT_BRANCH/protection"
   gh api --method GET "/repos/$REPO/rules/branches/$DEFAULT_BRANCH"
   gh api --method GET "/repos/$REPO/actions/secrets" \
     --jq '.secrets[]? | {name,created_at,updated_at}'
   gh api --method GET "/repos/$REPO/actions/variables" \
     --jq '.variables[]? | {name,created_at,updated_at}'
   ```

   Check workflow source at the same observed default-branch ref, not merely
   the working tree. Record whether a named credential is referenced by a
   normal push/schedule path, a pull-request path, an environment gate, or a
   reusable workflow. `pull_request` from a fork normally does not establish
   secret availability, and scheduled workflows run from the default branch;
   report those branch/event facts rather than assuming a secret will be
   available on every ref.

4. Keep Google OAuth configuration, OAuth authorization, API enablement, and
   channel identity distinct. OAuth client identifiers and consent-screen
   metadata may be safely summarized if a credential administrator provides a
   read-only inventory, but an OAuth client secret, downloaded client JSON, and
   refresh-token JSON are secret material and must remain unopened. Do not
   attempt an interactive consent flow, create a client, enable an API, alter
   consent-screen scopes, add a test user, or fetch an access token during this
   audit. From committed source, report only declared scopes and the expected
   project/channel. A declaration of `youtube.readonly` is not evidence that a
   stored credential has that grant, and a configured OAuth client is not
   evidence that it can identify a channel.

   Channel access is established only by a separately authorized, opaque
   read-only call made by the credential holder (for example, YouTube Data API
   `channels.list` with `mine=true` and `part=id,snippet`), whose report returns
   the channel ID/title and HTTP status but never the authorization header or
   token. Treat an unavailable API, denied scope, absent grant, or a channel
   mismatch as separate outcomes. The audit must not substitute its own local
   generator or credentials for that holder-bound check.

5. Classify state by function before suggesting custody. A file named by
   `NOTEBOOKLM_AUTH_JSON` is normally OAuth durable state (often client and/or
   refresh-token material) for a local generator; it is not an API key and must
   be treated as secret-bearing even when JSON-shaped. `API_KEY_GOOGLE_GEMINI`
   is an API-key input for the Gemini Developer API; it neither supplies
   NotebookLM authentication nor proves access to a YouTube channel. Do not
   merge, copy, or convert the two merely because both can be used by a local
   program. Report the actual code path that consumes each name and whether it
   expects a value, a filesystem path, or an already-authorized opaque client.

6. For every custody candidate, report capabilities and limits without calling
   it free by assumption. A local operating-system keyring may be zero
   incremental-cost and machine-bound, but is not a shared CI source or a
   durable backup. GitHub Actions secrets provide repository-scoped injection
   and metadata-only auditability but no retrievable value and no assurance of
   free Actions execution. Google Secret Manager, a paid password manager, a
   cloud disk, or a new OAuth client may carry billing, account, retention, or
   recovery effects and require a separate choice. An existing encrypted
   backup or administrator-owned vault may be a candidate only after its
   retention and restore path are independently evidenced. The audit output
   should say `candidate; cost/recovery unverified` unless both facts are
   directly observed.

7. Finish one row per repository and credential name with: committed
   declaration (present/absent), source consumer, local-path expectation,
   GitHub metadata result, default-branch/event shape, Google OAuth/API/scope
   evidence, channel-check result, and custody classification. Use
   `not established` for any missing, denied, or secret-redaction-limited fact.
   Configuration, secret creation/rotation, OAuth consent, API enablement, and
   channel authorization are all separate authorized changes, never audit
   repairs.

## Five-channel Google Desktop OAuth readiness with absent GitHub secrets

Use this procedure when exactly five independently owned YouTube repositories
need their own refresh grants, GitHub Actions secret metadata says the required
names are absent, and billing is disabled.  It is a readiness assay only: it
must establish the five separate *associations* without reading, comparing,
copying, or transmitting a refresh token.  Absence of a GitHub secret is an
evidence gap for hosted injection, not permission to put a token in source,
logs, an issue, an artifact, a workflow input, or a command line.

1. Freeze five explicit repository roots and recover one declared channel ID,
   one OAuth consumer path, one production credential boundary, and one
   intended trigger for each.  Use file names and structural matches only.  A
   shared client ID, callback host, Google account, or workflow template does
   not establish that two channels may share a refresh grant.

   ```sh
   CHANNEL_ROOT=/absolute/path/to/one/declared/channel/root
   node -e 'const fs=require("node:fs"); const p=process.argv[1]; for (const f of ["content/config/channel.json","content/config/pipeline.json"]) { const n=`${p}/${f}`; if (fs.existsSync(n)) { const v=JSON.parse(fs.readFileSync(n,"utf8")); console.log(n, JSON.stringify(v.youtube ?? v)); } }' "$CHANNEL_ROOT"
   rg -n --glob '!node_modules/**' --glob '!legacy/**' --glob '!archives/**' \
     'REFRESH_TOKEN_ENV|YOUTUBE_[A-Z0-9_]*REFRESH|observeAuthorizedChannel|youtubeChannelId|oauth-setup' \
     "$CHANNEL_ROOT/src" "$CHANNEL_ROOT/.github/workflows"
   git -C "$CHANNEL_ROOT" remote get-url origin
   ```

   If a root, origin, declared channel, or consumer boundary is ambiguous,
   label that lane `scope unresolved` and do not start consent for it.  The
   `rg` output is source structure, not permission to inspect an ignored
   token carrier or to print an environment assignment.

2. For each exact GitHub repository, list only Actions secret and variable
   *names* and compare them with that lane's declared environment-variable
   name.  Record `absent` exactly when the expected secret name is not in the
   returned metadata; `401`, `403`, and `404` are `unavailable`, not absence.
   Do not use `gh secret set`, `gh variable set`, workflow dispatch, or a
   local token as a probe.  A missing secret means GitHub-hosted execution is
   not credential-inducted for that lane, even if its workflow is otherwise
   valid.

   ```sh
   REPO=OWNER/REPO
   gh api --method GET "/repos/$REPO/actions/secrets" \
     --jq '.secrets[]? | {name,created_at,updated_at}'
   gh api --method GET "/repos/$REPO/actions/variables" \
     --jq '.variables[]? | {name,created_at,updated_at}'
   ```

3. Keep the grant-induction proof holder-bound and per lane.  The authorized
   credential holder may use the channel-local Desktop OAuth setup once for
   that declared channel, then report only: repository/root, declared channel
   ID, observed `mine=true` channel ID/title or handle, required scopes,
   timestamp, opaque credential-boundary name, and exit/status class.  The
   report must never contain a callback URL with a code, a token value,
   credential JSON, authorization header, or token fingerprint.  Do not
   establish uniqueness by comparing token bytes: the one-to-one association
   is established by each probe returning that lane's declared channel.

4. Treat the two blocked delivery routes honestly.  With the declared GitHub
   secret absent, an ignored local Desktop OAuth carrier can be a
   machine-bound human-consent readiness result but cannot be called hosted
   production injection, durable shared custody, or natural-schedule proof.
   With billing disabled, do not attach billing, create a secret, deploy a
   runtime, or use Secret Manager as a workaround.  Enabling the YouTube Data
   API itself is a distinct API-service configuration decision: it does not
   attach billing, but must be separately authorized and then proven with the
   billing-disabled/API-state observations above.  Those are separate account
   and architecture decisions, not repair steps.
   For every lane leave `hosted credential injection: not established` and
   `GCP credential custody: not established` until their respective evidence
   and authority exist.

5. Finish with five independent rows, each containing: repository/origin,
   declared channel, refresh-token environment-variable *name*, consumer,
   GitHub-secret metadata status, holder-run probe status and observed channel
   identity, scope status, local/production custody classification, and next
   gate.  Valid next gates include `holder consent required`, `GitHub secret
   induction requires authorization`, and `billing/custody decision required`.
   Never summarize five green channel probes as a shared grant or as an
   activated scheduled-delivery system.

### Human-operated Desktop OAuth client creation and safe handoff

Use this when the only missing gate is a Desktop OAuth client for the five
independent YouTube lanes.  It is deliberately a browser procedure for the
Google-account holder.  No step requires Google Cloud billing, a payment
method, a GCP runtime, or pasting a credential into chat, a terminal, GitHub,
or source control.

1. In a normal browser signed in to the Google account that owns
   `five-six-one-group-dev`, open [Google Cloud Console Credentials](https://console.cloud.google.com/apis/credentials?project=five-six-one-group-dev).
   Confirm the project selector says **five-six-one-group-dev**.  Do not open
   **Billing**, do not click a billing prompt, and do not create a service
   account or API key.

2. Reuse first: under **OAuth 2.0 Client IDs**, look for a client whose
   **Application type** is **Desktop app** and whose owner recognizes it as
   suitable for local YouTube consent.  If one exists, open it and choose
   **Download JSON**.  If none exists, click **Create credentials** →
   **OAuth client ID** → **Desktop app**; give it a neutral local-only name
   such as `YouTube local consent`; click **Create**, then **Download JSON**.
   A Desktop client has no authorized redirect-URI entry to add manually.
   Client creation neither enables billing nor creates a hosted workload.

3. Save the download to a local private folder, not a repository checkout,
   Desktop, shared drive, or synced public folder.  Treat the entire JSON file
   as secret material because it includes the client secret.  Do not open it
   in chat, email, an issue, a paste site, a shell command, a GitHub secret,
   or a workflow log.  The only safe handoff to the operator is its local
   filesystem path, for example `/home/name/private/google-desktop-client.json`.

4. For one lane at a time, give the local OAuth setup command that path by the
   repository's documented file-path mechanism.  Use the Google account that
   owns that lane's intended YouTube channel; accept only the declared YouTube
   scopes.  Complete the consent page, then let the repository perform its
   existing opaque `channels.list?mine=true` check.  Keep the generated
   refresh state local and ignored.  A successful probe must return that
   lane's declared channel ID/title; if it identifies another channel, stop
   and retry only after selecting the correct Google/YouTube account.

5. Report only this redacted receipt per lane: repository, declared channel
   ID, observed channel ID/title, scope names, timestamp, and `success` or a
   redacted HTTP/error class.  Never report the downloaded JSON, refresh
   token, authorization code, callback URL, browser URL, header, or token
   fingerprint.  Repeat independently for all five lanes; one client's use
   does not merge the grants or channel authority.

6. The current known GitHub scope is exactly:
   `emsenn/emsenn-youtube-services-section`,
   `emsenn/artificial-intelligence-education-youtube-services-section`,
   `emsenn/mathematics-education-youtube-services-section`,
   `emsenn/public-ecological-youtube-services`, and
   `emsenn/business-education-youtube-services-section`.  Check each with
   GET-only metadata before treating it as a credential recipient:

   ```sh
   for REPO in \
     emsenn/emsenn-youtube-services-section \
     emsenn/artificial-intelligence-education-youtube-services-section \
     emsenn/mathematics-education-youtube-services-section \
     emsenn/public-ecological-youtube-services \
     emsenn/business-education-youtube-services-section
   do
     gh api --method GET "/repos/$REPO" \
       --jq '{full_name,archived,disabled,default_branch}'
   done
   ```

   This identifies the five repositories only.  It does not authorize setting
   a GitHub secret, running a workflow, or declaring production scheduling.

## Five-lane OAuth recovery: metadata, history, and a separately authorized write

Use this procedure to recover an already-designed five-lane YouTube delivery
setup without treating old Cloud Run/Secret Manager declarations as the active
credential path.  It keeps four questions separate: what each repository
expects, whether GitHub currently holds a secret *name*, whether its scheduled
workflow has ever run, and whether a person has an existing local Desktop OAuth
setup.  It is safe with billing disabled and must never read a credential
value.  The exact scope is fixed to:

```text
emsenn/emsenn-youtube-services-section
emsenn/artificial-intelligence-education-youtube-services-section
emsenn/mathematics-education-youtube-services-section
emsenn/public-ecological-youtube-services
emsenn/business-education-youtube-services-section
```

1. Start with GET-only remote metadata and file-name discovery.  Resolve each
   default branch from GitHub; do not assume `main` merely because it is common.
   The tree request returns paths only, so it can establish the existing local
   OAuth/setup and scheduled-production entry points without exposing ignored
   local state.  A missing `src/oauth-setup.mjs` is a source fact, not a reason
   to create a client or copy another lane's files.

   ```sh
   for REPO in \
     emsenn/emsenn-youtube-services-section \
     emsenn/artificial-intelligence-education-youtube-services-section \
     emsenn/mathematics-education-youtube-services-section \
     emsenn/public-ecological-youtube-services \
     emsenn/business-education-youtube-services-section
   do
     gh api --method GET "/repos/$REPO" \
       --jq '{full_name,archived,disabled,default_branch}'
     gh api --method GET "/repos/$REPO/git/trees/BRANCH?recursive=1" \
       --jq '.tree[] | select(.type == "blob" and (.path | test("(^|/)(oauth-setup|scheduled-production|test-and-image)"))) | .path'
   done
   ```

   Replace `BRANCH` independently with the returned `default_branch`, URL-
   encoded if necessary.  Do not clone, search home directories, inspect
   ignored files, or open downloaded OAuth JSON as a shortcut.  A local
   checkout may be examined only through tracked source and structural matches:

   ```sh
   rg -l --glob '!node_modules/**' --glob '!legacy/**' --glob '!archives/**' \
     'oauth-setup|channels\.list|mine=true|YOUTUBE_[A-Z0-9_]*|REFRESH_TOKEN_ENV' \
     /absolute/path/to/a/declared/lane/{src,scripts,test} \
     /absolute/path/to/a/declared/lane/.github/workflows
   ```

   Report file paths and declared variable/scope *names* only.  Do not print an
   assignment, environment dump, token-shaped JSON, callback URL, or command
   argument that could carry a credential.

2. Inspect GitHub Actions secret and variable metadata by name.  These GET
   endpoints never return secret values.  For each lane, compare the returned
   names with the environment-variable name established in its tracked source;
   avoid guessing a universal secret name.  `[]` means no names were returned
   for that endpoint; `401`, `403`, and `404` mean `metadata unavailable`, not
   `secret absent`.

   ```sh
   gh api --method GET "/repos/$REPO/actions/secrets" \
     --jq '[.secrets[]? | {name,created_at,updated_at}]'
   gh api --method GET "/repos/$REPO/actions/variables" \
     --jq '[.variables[]? | {name,created_at,updated_at}]'
   ```

   This is an audit boundary.  Do not use `gh secret set`, `gh variable set`,
   repository settings writes, a workflow dispatch, a rerun, or a manual
   secret injection as a diagnostic probe.

3. Assay schedules from declaration and history separately.  First list active
   workflows, then fetch the exact default-branch workflow YAML and inspect
   `on.schedule` locally.  Query runs for that workflow with `event=schedule`,
   rather than deciding from a recent list dominated by `push` or
   `workflow_dispatch`.  A 200 empty scheduled-run list is an observed absence
   of retained scheduled history, not proof that a future cron will not run.

   ```sh
   gh api --method GET "/repos/$REPO/actions/workflows?per_page=100" \
     --jq '.workflows[] | {id,name,path,state,created_at,updated_at}'
   OAUTH_AUDIT_TMP=$(mktemp -d)
   gh api --method GET "/repos/$REPO/contents/.github/workflows/WORKFLOW_FILE?ref=BRANCH" \
     -H 'Accept: application/vnd.github.raw' > "$OAUTH_AUDIT_TMP/WORKFLOW_FILE.yml"
   rg -n '(^on:|^[[:space:]]+schedule:|^[[:space:]]+- cron:|workflow_dispatch|push:|pull_request)' \
     "$OAUTH_AUDIT_TMP/WORKFLOW_FILE.yml"
   gh api --method GET "/repos/$REPO/actions/workflows/WORKFLOW_ID/runs?event=schedule&per_page=100" \
     --jq '.workflow_runs[]? | {event,status,conclusion,created_at,updated_at,run_started_at,head_branch}'
   rm -rf "$OAUTH_AUDIT_TMP"
   ```

   `mktemp -d` resolves one unique temporary directory before the only removal;
   `rm -rf` is permitted here solely for that exact generated path after the
   YAML structure is recorded. Workflow YAML is committed source, but a
   temporary file should not become a new credential carrier. Do not issue a
   `workflow_dispatch` or wait for a schedule as a test.  State separately:
   `schedule declared`, `scheduled history observed/absent/unavailable`, and
   `natural future execution not established`.

### Keep credential-recipient metadata, CI history, and schedule history distinct

When the immediate question is whether one channel can receive its already
authorized refresh grant through GitHub and whether its checks or timer have
actually run, use three independent read-only rows.  A secret-name listing
answers only the recipient question; a successful CI run answers only that
workflow/ref/event executed; and a scheduled run answers only a past timer
occurrence.  None can prove the secret's value, a valid OAuth grant, injection
into a particular run, or the next cron occurrence.

| Row | GET-only evidence | Exact conclusion allowed |
| --- | --- | --- |
| recipient metadata | `/repos/OWNER/REPO/actions/secrets` and the tracked workflow's named `secrets.NAME`/`env` consumer | expected name `present`, `absent`, or `metadata unavailable` |
| CI history | exact workflow ID's runs filtered to its declared non-schedule event (normally `push`), plus the workflow path/ref | historical CI run observed/absent/unavailable, with its conclusion and timestamp |
| schedule history | same workflow ID's runs filtered with `event=schedule`, plus default-branch YAML `on.schedule` | schedule declared and scheduled history observed/absent/unavailable |

Do not infer that a run saw a secret merely because it is `success`: GitHub
does not expose secret injection in run metadata, and a workflow may skip the
credential-consuming step.  Likewise, do not call a secret `absent` when a
GET failed or returned a partial/unauthorized response.  Preserve only secret
names, workflow IDs/paths, event, status, conclusion, ref/head branch, and
timestamps.  Never request logs, artifacts, jobs/step output, environment
values, or a rerun to make the evidence more definite.

An already validated holder-local OAuth credential does not change this audit
boundary: GET-only evidence can establish only the named recipient metadata
and distinct CI/schedule history. Secret induction and a natural credential-
consuming scheduled run remain later gates.

For one named lane, forward-test the observation plan before a secret-write
request: resolve its repository default branch and workflow ID; show the
tracked consumer uses the exact declared secret *name*; prepare the two
separate run queries below; and state the three resulting classifications
without installing anything.  The CI query's event must be taken from the
workflow YAML rather than assumed to be `push`.

```sh
gh api --method GET "/repos/$REPO/actions/workflows/$WORKFLOW_ID/runs?event=$CI_EVENT&head_sha=$COMMIT_SHA&per_page=100" \
  --jq '.workflow_runs[]? | {event,status,conclusion,created_at,updated_at,run_started_at,head_branch,head_sha}'
gh api --method GET "/repos/$REPO/actions/workflows/$WORKFLOW_ID/runs?event=schedule&per_page=100" \
  --jq '.workflow_runs[]? | {event,status,conclusion,created_at,updated_at,run_started_at,head_branch,head_sha}'
```

The forward test fails if it collapses CI and schedule lists, treats `success`
as credential validation, fetches logs/artifacts to look for a secret, or uses
`gh secret set`, `gh workflow run`, rerun, dispatch, or any repository write.

4. An existing `src/oauth-setup.mjs` establishes only that a local consent
   mechanism was authored.  It does not prove that a client JSON still exists,
   a refresh grant remains valid, the intended channel is selected, or GitHub
   has a recipient secret.  The holder may reuse an existing private Desktop
   OAuth client when its provenance is known; give the lane's local setup only
   the JSON *path*, never its contents.  Then use its opaque `mine=true`
   channel probe and report only the declared and observed channel identities,
   scope names, timestamp, and success/redacted error class.  Keep every lane
   separate even if one local client is reused.

5. Secret induction is a later, explicit write gate. It needs both a known
   good holder-local probe for that exact lane and authorization to create or
   replace the exact GitHub secret name. Before the write, re-run the metadata
   GET and state the target repository, secret *name*, whether it is absent or
   will be replaced, and that the source is a private local `.env` carrier.
   The lane validator must parse that carrier internally, validate the exact
   `repo-secret-channel-scope` binding in process memory, and emit credential
   bytes only to the standard-input pipe of `gh secret set` after a match. It
   must emit redacted failures only to stderr and refuse to write on any
   binding mismatch. Disable shell tracing; do not source the `.env`, assign
   the value to a shell variable, use `--body`, `tee`, or command substitution,
   or send the value through chat, a terminal display, an issue, or logs.

   ```sh
   set +x
   set -o pipefail
   LANE_VALIDATOR --env-file "$PRIVATE_ENV_PATH" \
     --repo "$REPO" --secret "$SECRET_NAME" --channel "$CHANNEL_ID" \
     --required-scopes "$REQUIRED_SCOPES" --emit-matched-secret-stdin \
     | gh secret set "$SECRET_NAME" --repo "$REPO"
   ```

   `LANE_VALIDATOR` is the lane's established private validator, not a shell
   wrapper: its stdout is exclusively the matched secret bytes, already
   connected to `gh`; it never displays or receipts the bytes. With
   `set -o pipefail`, a validator refusal must make the induction fail. After
   the write, repeat only the metadata GET and record the name/timestamp;
   never retrieve or compare the value. Audit the same delivery without a
   dispatch: query the declared CI event filtered by the exact committed
   `$COMMIT_SHA`, and query `event=schedule` separately with GET only. An exact
   SHA CI success proves that CI revision/event only; metadata proves only the
   recipient name; schedule history proves only past timer occurrences. This
   write gate does not enable billing, create a GCP secret, deploy Cloud Run,
   or authorize a workflow run.

   **Business-lane induction receipt.** For a single business lane, bind one
   private carrier, one exact `OWNER/REPO`, one workflow ID/ref, one secret
   name, one expected channel, and one scope set before opening the stdin
   pipe. The validator's credential bytes may have exactly one consumer:
   `gh secret set` for that declared repository/name. Record only the
   validator's redacted match result and the post-write secret-name metadata.
   Then perform two separate GET-only audits: (1) the workflow's declared CI
   event filtered by the pushed, exact `head_sha`, and (2) the same workflow's
   `event=schedule` history without an SHA filter. A CI result at that SHA
   confirms the revision's CI only; schedule history remains a distinct
   past-occurrence observation, and neither proves secret consumption or the
   next natural run. Forward-test with non-secret fixtures: the matched tuple
   permits the stdin handoff, a changed repo/name/channel/scope refuses before
   `gh`, and the recorded audit requests retain the exact SHA only on the CI
   request.

6. Finish with five rows: repository/default branch, local OAuth setup path
   present or absent, declared credential-name and consumer, GitHub metadata
   result, schedule declaration, schedule-history result, opaque holder probe
   result, and next gate.  Valid next gates include `holder local consent`,
   `GitHub secret-write authorization`, and `natural schedule evidence still
   absent`.  Never call a lane active merely because it has old server-runtime
   configuration, a local OAuth script, an active workflow, or a successful
   run triggered by some other event.
