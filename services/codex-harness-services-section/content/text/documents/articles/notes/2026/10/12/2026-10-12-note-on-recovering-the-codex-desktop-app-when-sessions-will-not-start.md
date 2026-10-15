---
title: Note on recovering the Codex desktop app when sessions will not start
date-created: 2026-10-12
tags:
- codex-harness
- recovery
- historical-report
- sqlite
- wsl
---

> **Unqualified historical report.** The original report below is prior agent testimony about the 2026-10-12 incident, not a verified current recovery procedure. Its causal claims, app-state assumptions and destructive SQLite deletion steps remain unqualified. Its instruction to “follow it next time” and all procedural wording are retained as historical testimony only: they grant no execution authority and must not be treated as directions to perform repairs. This source delivery preserves evidence only; no app or database operation was executed.

## Original agent report

On 2026-10-12 one Codex session crashed, and after that the Codex desktop app on emsenn's Windows machine would not start a new session. This note records where the app keeps its state, what had gone wrong, and the steps that fixed it. Follow it the next time Codex hangs or refuses to start a thread.

## Where the app keeps its state

The desktop app (`OpenAI.Codex_*` under `C:\Program Files\WindowsApps`, every process named `ChatGPT.exe`) runs its app-server inside WSL, because `runCodexInWindowsSubsystemForLinux = true`. It splits its state across two homes. Read the environment of the running server (`tr '\0' '\n' < /proc/<pid>/environ`) to confirm:

| Variable | Value | Holds |
| --- | --- | --- |
| `CODEX_HOME` | `/mnt/c/Users/emsen/.codex` | `config.toml`, `sessions/` and `archived_sessions/` (rollout `.jsonl` files), `thread-writer-locks/`, `models_cache.json`, `.codex-global-state.json` |
| `CODEX_SQLITE_HOME` | `/home/emsenn/.codex/sqlite` | the live databases: `state_5.sqlite` (thread index), `thread_history_1.sqlite` (paged turn/item projection of rollouts), `logs_2.sqlite`, `goals_1`, `queue_1`, `memories_1` |

`~/.codex/config.toml` is a symlink to the Windows `config.toml`. Project config is layered on top from `/home/emsenn/info/.codex/config.toml`.

**Decoys.** Copies of `state_5`, `thread_history_1` and `logs_2` also sit directly in `~/.codex/` and in `/mnt/c/Users/emsen/.codex/` (not under `sqlite/`). The running app does not use them, so read and repair only the files under `~/.codex/sqlite/`. `~/.codex/sessions/` (about 1,640 rollouts from August) belongs to the older WSL-home CLI and is not this app's session store.

## What went wrong on 2026-10-12

Read from `logs_2.sqlite`:

1. **The crash.** Thread `01a12e37…` ("deal with the many many branches") failed at 19:29 with `stream disconnected … workspace routing discovery timed out`. That was a network timeout to OpenAI, and the model refresh and analytics requests timed out at the same time. Nothing local caused it.
2. **The thread stuck after the crash.** Thread `01a13225…` ("make sure both Cold Red Gate and Bare Cedar Fog…") still had a turn marked `inProgress` from 17:20 and a writer lock in `thread-writer-locks/`. Across the database, 62 turns had been left `inProgress` by sessions that died.
3. **A slow, noisy thread index.** 2,587 of the 2,656 non-archived rows in `state_5.threads` pointed at rollout files that no longer existed. Every `thread/list` call logged `state db list_threads returned stale rollout path` (222 times per listing) while it checked paths across the slow `/mnt/c` filesystem. The rollouts had been deleted without removing their index rows. `scripts/archive-codex-sessions.mjs --delete` deletes rollouts and leaves `state_5.sqlite` alone, which matches.
4. **A bloated history projection.** `thread_history_1.sqlite` was 1.49 GB, and three *archived* threads made up about 980 MB of it.
5. A new thread started at 20:35:27 logged nothing more after its session was set up.

Warnings that show up every time but do **not** block anything:

- `after_agent hook failed … hook_name=legacy_notify error=No such file or directory`. The `notify` entry in `config.toml` points at a Windows `.exe` path, which the WSL app-server cannot run. The app manages that line itself, so leave it alone.
- `MCP server startup failed server_name="alpaca-live"`, HTTP 503 from `https://bare-cedar-fog.561.group/mcp/alpaca-live` whenever Bare Cedar Fog's MetroPlat is down. Each thread start or resume spends a few seconds on retries. Its definition was not found in `config.toml`. Find it before deciding whether to disable it.
- `unknown feature key in config: code_mode_tool_description_first` and `ignoring invalid experimental feature enablement keys: apps_mcp_path_override`. The app sends these itself.
- `failed to load plugin: missing or invalid plugin.json plugin="code-review@openai-bundled"`. This is a damaged bundled plugin cache. The app ships it with `mcp_servers.code-review.enabled=false`.

## Recovery procedure

Run these steps in order from WSL. Do not touch any database while the app is running.

### 1. Read the errors

```sh
cd ~/.codex/sqlite
sqlite3 -readonly logs_2.sqlite "select level, target, substr(feedback_log_body,1,250), count(*), datetime(max(ts),'unixepoch','localtime')
  from logs where level in ('ERROR','WARN') and ts > strftime('%s','now','-6 hours')
  group by level, target, substr(feedback_log_body,1,120) order by max(ts) desc limit 40"
sqlite3 -readonly thread_history_1.sqlite "select status, count(*) from thread_turns group by 1"
ls -la /mnt/c/Users/emsen/.codex/thread-writer-locks/
```

To follow one request, search the log body for its request id, for example `thread/start:<uuid>`. The last line logged for that id shows where it stalled.

### 2. Stop the app completely

Every `ChatGPT.exe` under `OpenAI.Codex_*` belongs to Codex. Match on the path, not the process name, in case the ChatGPT app is also installed:

```sh
powershell.exe -NoProfile -Command "Get-Process ChatGPT,codex,codex-computer-use-swift,node_repl -ErrorAction SilentlyContinue | Where-Object { \$_.Path -like '*OpenAI*Codex*' } | Stop-Process -Force"
```

Then kill the WSL side: the `codex … app-server` process under `/mnt/c/Users/emsen/.codex/bin/wsl/`, plus the `node_repl.exe` and `node.exe` interop processes from `cua_node`. Kill them by PID from `ps -eo pid,cmd`. `pkill -f <pattern>` also matches the shell running it and kills that shell (exit 144). Leave `codex-windows-sandbox-service` running; it is a Windows service.

### 3. Back up

```sh
B=~/.codex/backups/$(date +%F)-recovery; mkdir -p "$B"; cd ~/.codex/sqlite
for db in state_5 thread_history_1 goals_1 queue_1 memories_1; do sqlite3 $db.sqlite ".backup '$B/$db.sqlite'"; done
cp /mnt/c/Users/emsen/.codex/.codex-global-state.json /mnt/c/Users/emsen/.codex/config.toml "$B/"
for db in state_5 thread_history_1 logs_2; do echo "$db $(sqlite3 $db.sqlite 'pragma quick_check')"; done
```

### 4. Repair

1. **Remove thread rows whose rollout is gone.** Collect the ids with `select id||'|'||rollout_path from threads` and a `[ -f ]` test. Import them into a temp table, then, with `pragma foreign_keys=on` (which cascades to `thread_attachments` and `thread_dynamic_tools`), delete them from `thread_spawn_edges` (`parent_thread_id`/`child_thread_id`) and from `threads`, and `vacuum`.
2. **Close orphaned turns.** In `thread_history_1.sqlite`, run `update thread_turns set status='interrupted' where status='inProgress'`. With the app stopped, no turn can really still be running.
3. **Drop the projection for archived and deleted threads.** Delete their rows from `thread_items`, `thread_turns` and `thread_history_projection_state`. The rollouts stay, and `thread_history_projection_state` stores a byte offset into each one, so a thread whose state row is gone is projected again from offset 0 if it is reopened. Then `vacuum`.
4. **Prune logs.** `delete from logs where ts < strftime('%s','now','-2 days'); vacuum;`
5. **Remove the stale writer lock** for the stuck thread from `/mnt/c/Users/emsen/.codex/thread-writer-locks/`. Leave `.coordination.lock`.
6. **Delete the decoy `thread_history_1` and `logs_2` copies**, with their `-wal` and `-shm` files, from `~/.codex/` and `/mnt/c/Users/emsen/.codex/`. Their contents can be rebuilt or are disposable logs. The decoy `state_5.sqlite` copies were kept, because the plain WSL CLI may still use `~/.codex`.

Results on 2026-10-12: `state_5` went from 10 MB to 2 MB (185 live threads), `thread_history_1` from 1.49 GB to 348 MB, and `logs_2` from 95 MB to 34 MB. About 2.3 GB of decoy copies were deleted. All three databases passed `quick_check` afterward.

### 5. Relaunch and check

Start Codex and open a new thread. If it still hangs, run step 1 again and follow the newest `thread/start:<uuid>` request id.

## Preventing it

- An archiver that deletes rollouts must also delete or archive their rows in `state_5.threads`. Otherwise every listing pays for the dead paths. `scripts/archive-codex-sessions.mjs` does not do this yet.
- Archived threads should not keep their paged projection in `thread_history_1.sqlite`. One archived session alone took 556 MB.
- If a session hangs after a network failure, stop the app fully before starting another session. Otherwise the dead turn keeps its writer lock and its `inProgress` status.
