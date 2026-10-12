# Antigravity Harness Services Section

The Antigravity CLI (`agy`, Google AI Pro) as a dialect of the agent-harness carrier session
runner (`../../src/carrier/session.mjs`), with its work-rail wrapper and its home:

- `src/antigravity-session.mjs` exports `antigravityDialect`. It covers:
  - stream-json stdin and stdout;
  - the conversation id as the thread;
  - `structured_output` as the message;
  - weekly-quota refusals counted as allowance exhaustion, not transient faults;
  - the allowance `google-ai-pro-antigravity` (computer-inference-engine `content/allowances`).

  The carrier is observed from agy's own log (`--log-file <artifactDir>/agy.log`). The model-override label is read as a model and an effort ("Gemini 3.8 Flash (Low)" becomes `gemini-3.8-flash`, `low`), and nothing else of the log is kept, since it holds the account's email.
- `src/agency-work.mjs` exports `antigravityAgencyWorkProvider`, mirroring the Claude Code wrapper.
- `scripts/antigravity-carrier-home.mjs` provisions a character's carrier home:
  - the account's login, linked in;
  - its permission allowlist;
  - agy's MCP entry for the node, through the stdio bridge, as the machine client issued to that character.

## Authority is the runner's

Observed on 2026-10-03, headless agy:
- writes files in its workspace and /tmp unasked;
- ignores `--mode` while slash commands are disabled;
- confines its terminal inconsistently under `--sandbox`: either the workspace is read-only to it, or nothing is once a write is granted;
- ends a turn with no output when it denies a tool, so the session counts as failed, never as done.

So a session's authority is not agy's word. The runner launches it in a transient unit with:
- `ProtectSystem=strict`, `ProtectHome=read-only` and a private /tmp;
- writable paths limited to its artifacts, its carrier home, agy's login directory and, for `workspace-write`, its workspace and that workspace's git directory.

That is the dialect's `confinement`. A confined session never falls back to an unconfined child. No session is given `--dangerously-skip-permissions`.

## Admission on Bare Cedar Fog

The founder approved Antigravity to spend and carry work on 2026-10-03; Claude stays declined. The pieces:
- **Character:** `bare-cedar-fog-antigravity` (`actor:TxHz8_VaNnereVGtvFUhVOP075esK1_01sG_v4KdsE8`), whose machine client lives in `~/.config/561-group/antigravity-mcp-client.env`.
- **Carrier home:** `~/.local/state/561-group/carriers/antigravity/bare-cedar-fog-antigravity`.
- **Host composition:** feltos-enterprise-host composes the carrier when its deployment sets `METROPLAT_ANTIGRAVITY_WORKER`, `METROPLAT_ANTIGRAVITY_MODELS` and `METROPLAT_ANTIGRAVITY_HOME`.
- **Offices:** the character holds the offices its bids win (`enterprise-bid`), so the carrier is bounded to that reach.
