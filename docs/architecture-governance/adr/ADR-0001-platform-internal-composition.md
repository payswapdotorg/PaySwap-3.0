# ADR-0001: Platform-internal composition and composition roots

- **Status:** ACCEPTED (TL-gated, 2026-10-11)
- **Scope:** `spec/architecture/MODULE-OWNERSHIP.yaml` layer rule `platform.may_depend_on`
- **Resolves:** VIOLATION-REGISTER S2 class (49 violations, V-01..V-49, @ e40f2b9 baseline / re-measured @ b33026d unchanged)
- **Law hook:** INVARIANTS.md invariant 29 (frozen architecture changes require ADR + dependency-graph + state updates — this ADR is that record)

## Context

The inherited ZCode substrate is a monorepo of 30+ cooperating platform packages
(rpc, transport, session, client, web, desktop, cli, telemetry, ui, services, …)
that import each other freely. Measured against the frozen PaySwap 3.0 layer
policy (`platform.may_depend_on: [contracts]`), every platform→platform edge is
a violation: 49 of the 54 baseline violations in
`docs/architecture-governance/reports/module-ownership-report.json`.

All 49 edges are platform→platform (S2 per the register severity model): they
violate the letter of the allow-list but stay inside the platform authority —
no financial, trust, capability or rails boundary is crossed. The register's
own remediation proposals for V-01..V-49 defer to exactly this ADR decision
("No source change before ADR acceptance").

The alternative — refactoring the inherited substrate to conform to a
contracts-only platform allow-list — is REJECTED: it would rewrite inherited
platform code indiscriminately (explicitly out of bounds per TL review
2026-10-11), destabilize the substrate PaySwap 3.0 is built on, and buy no
authority-boundary improvement (the boundaries that matter — financial, trust,
capability, rails — are untouched by platform-internal edges).

## Decision

Accept platform-internal composition as policy-conformant by additive
layer-rule annotation:

```yaml
platform:
  may_depend_on: [contracts, platform]
```

Composition roots (`apps/.../bootstrap`, `apps/.../cli`) are platform-mapped
packages that legitimately depend on everything they compose; the
platform→platform allowance covers them without a separate exemption class.

## What this does NOT change

- `financial`, `trust`, `capability`, `rails`, `economic`, `security`,
  `experience` layer rules are untouched. In particular
  `must_not_depend_on` lists (ui/model-runtime/lab guards on financial and
  economic) remain exactly as frozen.
- No source file changes. Inherited code is not rewritten.
- The ownership validator still enforces every other rule (R1..R7) in strict
  mode; CI gates on report drift so any NEW violation class fails.

## Consequences

- The 49 S2 violations resolve as policy-conformant; the strict baseline drops
  54 → 5 (2 S1 resolved by ADR-0002, 3 S3 hygiene remain).
- New platform code written for PaySwap 3.0 should still prefer contracts-grade
  surfaces; the platform allowance is an inherited-substrate accommodation, not
  a license for new architecture to sprawl. Experience-layer surfaces (P2-W3+)
  remain bound to `experience.may_depend_on: [contracts]`.
- When PaySwap Web/Desktop replace ZCode surfaces (Phase 7), the retired
  platform packages leave the graph with this ADR's scope.

## S3 hygiene remediation schedule (NOT resolved by this ADR)

The 3 remaining R6 cross-package-relative violations are real boundary-integrity
defects and stay tracked for a platform-hygiene follow-up (register V-52..V-54):
export `pdfJsCmapsPlugin` from the `@zcode/ui` package surface (fixes
packages/desktop and packages/web vite configs) and convert the
packages/ui test import to the package boundary. Mechanical, TL-gated, scheduled
with the Phase 2 integration window — not silently waived.
