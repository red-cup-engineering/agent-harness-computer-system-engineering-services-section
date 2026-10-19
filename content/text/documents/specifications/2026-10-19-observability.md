# Specification of observability: The agent harness host-resource hook

Behavioral specification, traced to the unabridged request in `content/text/documents/sources/2026-10-19-observability-request.md` of the SignCell repository (digest `sha256:a5cf9927eac848483d9b9a2886ac48ae0f880248b2ba2e582951138ad20d8e69`). The requirements, whole specification and design are version 2 candidates of `admitArtifactFabricationSpecification` held in `data/records/artifact-fabrication/` of SignCell:

- requirements: admitted, `ni:///sha-256;9AhC_Wht51SJ_ogDdmVyIMeLsLnBoHx63m51BA1Heho`, 16 measured, 5 derived and 2 conjectured claims.
- specification: admitted, `ni:///sha-256;fEMhW34f1plxlRDkVNE4afjKyVWv72BerhnHrPTL__U`, 16 measured, 5 derived and 2 conjectured claims.
- design: admitted, `ni:///sha-256;63fvJdKjTjxOcxEZQAO8sZkvNvP7BY_F2umw5UQICic`, 16 measured, 5 derived and 2 conjectured claims.

Shall is used as in BCP 14. Every statement has a positive, an alternate and a refusal example, each a test of the same name.

## Standards

- OpenTelemetry, semantic-conventions v1.44.0: docs/exceptions/exceptions-logs.md ; docs/registry/attributes/{process,error,exception,test,vcs,cicd,service,deployment}.md.

## Statements

- HK1. When the containing scope cannot start, the fallback shall record the scope command's whole stderr and exit status with the user manager's process state and the cgroup's `memory.high`, `memory.current` and `memory.events` in an OTLP record, and shall still run the command.
  - Positive: A scope that fails with `Transport endpoint is not connected` leaves a record holding that text, the exit status, the manager's state letter and the three memory readings, and the command runs unscoped.
  - Alternate: A scope that starts leaves no record and no delay.
  - Refusal: An unreadable manager state is recorded as unreadable with its reason and never as healthy.
  - Traces to: r-failure-record, r-diagnosable; claims: case-5-hook-discards-manager-state.

