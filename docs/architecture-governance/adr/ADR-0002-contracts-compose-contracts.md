# ADR-0002: Contracts may compose contracts

- **Status:** ACCEPTED (TL-gated, 2026-10-11)
- **Scope:** `spec/architecture/MODULE-OWNERSHIP.yaml` layer rule `contracts.may_depend_on`
- **Resolves:** VIOLATION-REGISTER S1 class (2 violations, V-50/V-51, @ e40f2b9 baseline / re-measured @ b33026d unchanged)
- **Law hook:** INVARIANTS.md invariant 29 (frozen architecture changes require ADR + dependency-graph + state updates — this ADR is that record)

## Context

`contracts.may_depend_on: []` — contracts were defined as the floor of the
dependency graph, depending on nothing. The inherited tree contains two
contracts→contracts edges (register S1):

- V-50: `apps/zcode-cli/packages/contracts -> packages/shared` (30 occurrences)
- V-51: the remaining contracts-layer edge of the same class (full evidence in
  `reports/module-ownership-report.json` → `violations[]`)

Typed-surface packages composing other typed-surface packages is domain-normal:
a contracts package that re-exports or builds on another contracts package's
types does not introduce an authority edge, an implementation dependency or a
cycle risk beyond what the acyclicity rules already forbid (R-forbid-cycles
stays in force). The empty allow-list was stricter than the domain requires.

The register's own remediation proposal for V-50 is exactly option (a) below,
chosen as "smallest change, honest semantics" over merging the small typed
surface into the CLI contracts package during P2-W3 surface work.

## Decision

Accept contracts composition as policy-conformant by additive layer-rule
annotation:

```yaml
contracts:
  may_depend_on: [contracts]
```

Contracts remain the floor of the graph: they may compose each other and depend
on nothing else — no platform, no financial/trust/capability/rails, no UI, no
runtime. Invariant 27 (domain contracts do not import UI/framework/runtime
implementation details) is unaffected and still machine-checked.

## What this does NOT change

- No source file changes; no package merges.
- `domain_contracts_framework_free` remains true and enforced
  (`surface_contracts_are_framework_independent` policy anchor untouched).
- The P2-W3 Surface/API package still lands as a contracts-layer package with
  zero workspace imports — its self-containment is a work-order constraint,
  not a consequence of the old empty allow-list.

## Consequences

- The 2 S1 violations resolve as policy-conformant.
- Future contracts packages (including `@payswap/surface`) MAY import other
  contracts packages when a genuine shared typed surface exists; the TL will
  still prefer self-containment at dispatch time to keep lanes disjoint.
- Together with ADR-0001 the strict baseline drops 54 → 3 (the 3 S3 R6 hygiene
  defects, scheduled in ADR-0001's remediation section).
