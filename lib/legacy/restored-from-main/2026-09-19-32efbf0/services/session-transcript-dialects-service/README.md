# session-transcript-dialects

Provider-neutral helpers for reading coding-agent session transcripts (Codex, Claude Code). Each provider writes its transcript rows to disk in its own shape and layout — Codex shards JSONL files under `YYYY/MM/DD/`, Claude Code writes one flat JSONL file per session. This package factors out the parts that don't vary once a provider's layout is known — file enumeration, row classification, model/token-usage extraction, tool-call extraction, and metadata redaction — so a second provider's reader never has to re-derive them from scratch.

Every accessor observes a privacy floor: nothing here ever returns transcript text or tool arguments/outputs, only structural metadata (row type, tool name, timestamp, error flag) that the row already carries.

## Install

This package is consumed from within the same repository as a workspace dependency; there is nothing to publish separately. From a consuming package:

```js
import { codexSessionTranscriptDialect } from "@red-cup-engineering/session-transcript-dialects/codex-dialect";
import { claudeSessionTranscriptDialect } from "@red-cup-engineering/session-transcript-dialects/claude-dialect";
```

## Run the tests

```
npm test
```

Runs the `node:test` suite in `test/*.test.mjs` against both dialects.

## API

Both `codexSessionTranscriptDialect` and `claudeSessionTranscriptDialect` are frozen objects implementing the same shape:

- `defaultSessionRoot([repoRoot])` — the directory a provider stores session transcripts under by default.
- `enumerateSessionFiles(root, fromExclusive, toInclusive)` — the `.jsonl` files whose content could fall in a given time window (Codex: day-sharded directories; Claude Code: flat directory read by file mtime, never descending into subdirectories such as `subagents/`).
- `rowKind(row)` — a normalized classification of one parsed transcript row (`"user-message"`, `"tool-call"`, `"tool-result"`, `"assistant-message"`, `"other"`, etc.).
- `modelOf(row)` — the model name a row reports, or `null`.
- `tokenUsageOf(row)` — `{ input, cached, output, reasoning }` token counts from a usage-bearing row, or `null`.
- `toolCallsOf(row)` — every tool call on a row as `{ name, transport, callId, ... }`, never the call's arguments.
- `toolNameOf(row)`, `toolTransportOf(row)`, `callIdOf(row)` — convenience accessors reading the first entry of `toolCallsOf(row)`.
- `toolClassPatterns` — `{ market, patch, exec }` regexes for classifying a tool name by what kind of side effect it has.
- `safeMetadata(row)` — the redacted `{ timestamp, type, payloadType, role, name }` view of a row that is safe to log or forward.

`src/shared.mjs` exports the lower-level building blocks (`dayShardedCandidateFiles`, `flatMtimeCandidateFiles`, `sha256Hex`, `exactWindow`, `safeRow`, `firstToolCallAccessors`) that both dialects are built from, for a third dialect to reuse directly.
