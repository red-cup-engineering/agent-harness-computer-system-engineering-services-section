# session-activity-provider-service

Canonical, dialect-parameterized replacement for the formerly-separate
`@red-cup-engineering/claude-session-activity-provider` and
`@red-cup-engineering/codex-session-activity-provider` packages. Both of
those carried nearly the same `collectColonyActivity`/`observeToolInvocations`
skeleton (windowed transcript scan, evidence hashing, sort, envelope
assembly) once each, differing only in which dialect they imported and in
some real per-provider classification and vocabulary. This package holds
that shared skeleton once; the dialect (`claudeSessionTranscriptDialect`,
`codexSessionTranscriptDialect`, ... from
`@red-cup-engineering/session-transcript-dialects`) is an explicit function
argument — never detected from the ambient harness.

## Why the two originals were not simply merged as-is

Reading both packages' `src/collect-colony-activity.mjs` in full showed the
duplication claim ("differing only by dialect import") was not quite
accurate: Claude detects a completed turn via `stop_reason === "end_turn"`
and a web invocation via a local tool-name set, because a Claude transcript
row carries no distinct row kind for either; Codex detects both (plus a
context compaction) via `dialect.rowKind(row)`, because a Codex transcript
row does carry distinct application-level event kinds
(`task-complete`, `web-search-end`, `context-compacted`) that Claude's
format has no equivalent for. That is real, provider-specific classification
logic, not accidental drift — so it now lives on the dialect itself
(`activityTally`, `properNoun`, `supportsOperationsDomain`,
`activityDisplayOrderBase`, additive fields on `claude-dialect.mjs` and
`codex-dialect.mjs`), and this package's `collectColonyActivity` consumes it
uniformly. `observeToolInvocations` needed no such split: looping over
`dialect.toolCallsOf(row)` and falling back `call.status ?? "requested"`
reproduces both originals' behavior exactly, since Codex's `toolCallsOf`
already returns at most one call per row.

## Exports

- `./collect-colony-activity` — `collectColonyActivity(dialect, { window, recordedAt, sessionRoot })`
- `./observe-tool-invocations` — `observeToolInvocations(dialect, { window, recordedAt, sessionRoot })`

## Pending publish

This package (and the additive `session-transcript-dialects` changes it
depends on, targeted at `0.5.0`) had not yet been published to
`registry.561.group` as of this change — the publish operator was denied by
the session's own auto-mode permission classifier ("Create Public Surface").
Until that publish runs, `bare-cedar-fog-561-group` cannot be repinned to
this package and the two superseded packages cannot be safely deleted.
