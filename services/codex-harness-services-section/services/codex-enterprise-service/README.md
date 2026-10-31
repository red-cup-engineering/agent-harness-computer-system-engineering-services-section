# bare-cedar-fog-codex-enterprise

Received 2026-10-24 from 561-group/bare-cedar-fog-codex-enterprise@11766debd7b1218d77a374ccbfcdb9f42ea53b62

Executable code (and the tests and fixtures that exercise it) moved verbatim out of `561-group/bare-cedar-fog-codex-enterprise`, which keeps only the section data. Run against a data checkout by setting the data-root parameter described below (default: current working directory).

## Data parameter

The enterprise data (`agents/`, `data/`, `lib/`) lives in `561-group/561-group-bare-cedar-fog-codex-services-section`. Set `CODEX_ENTERPRISE_DATA_ROOT` to a checkout of it (default: current working directory). `npm test` points it at a frozen copy of `agents/` in `test/fixtures/`.

## Hook source addressing

Hook manifest handlers are relative to the executable engine source root, which defaults to this package directory. The section manifest names `src/codex-enterprise-hook.mjs`; it does not embed a containing workspace path. The `projectHooks` and `installHooks` APIs accept an explicit `sourceRoot`. If a declared handler is absent there, an existing package source named by `manifest.projections` is used; a missing source refuses before writing the destination.

Importing the projector does not discover a Git workspace or read the section's manifest. Installation still requires an explicit destination `root` (`--root` for the CLI), preserves hooks outside the manifest, and copies any declared projections. `--check` reports drift without overwriting it.
