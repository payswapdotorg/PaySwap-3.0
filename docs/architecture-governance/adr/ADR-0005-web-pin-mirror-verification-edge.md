# ADR-0005: web pin-mirror verification edge (platform -> rails/contracts)

- Status: PROPOSED
- Date: 2026-10-19
- Author: GOV-W1 (governance reconciliation lane)
- Deciders: resident TL (acceptance required — this is a stub, not a decision)

## Context

`packages/web/test/payswap/pin-mirror.test.ts` (P7-W1) deliberately imports
the accepted source packages' src DIRECTLY (test-only; the src/** boundary
stays clean) to assert that web's structural mirrors match the source shapes
field-for-field:

- `../../../surface/src/{version,outcomes,areas,progress-states}.ts` — 4
  relative imports (R6) into a **contracts**-layer package (layer-legal for
  platform, boundary-illegal as relative cross-package imports);
- `../../../provider-runtime/src/result-envelope.ts` — 1 relative import (R6)
  into a **rails**-layer package, which ALSO violates R3
  (`platform may_depend_on [contracts, platform]` excludes rails).

The test header documents the intent: drift between a pin and its source fails
at test time. The P7-E2E acceptance (Gate D) relied on this suite (14f/116t).

## Why not a narrow fix now

The GOV-W1 narrow-fix class is "test-only import -> package export". Here that
fix is **not executable** in this lane:

1. `packages/web` does not declare `@payswap/surface` /
   `@payswap/provider-runtime` dependencies; adding `workspace:*` devDeps
   requires a root `pnpm-lock.yaml` regeneration — the pnpm toolchain is not
   available in the GOV-W1 sandbox, and a stale lockfile would break
   `pnpm install --frozen-lockfile` in CI (architecture/lint/typecheck jobs).
2. Even with package-name imports, the `web -> provider-runtime` R3
   (platform -> rails) remains — the layer question needs adjudication
   regardless of the import form.
3. Removing or weakening the pin-mirror assertions would reduce verification
   quality of an accepted gate (forbidden).

## Decision (proposed — NOT accepted)

Adjudicate the pin-mirror imports as a **verification edge**: test-only,
never imported by src/**, never a runtime composition. Candidate mechanisms:

1. Add a test-only edge exemption to the ownership engine (edges whose every
   occurrence is inside `test/**` files are reported in a separate
   `test_only_edges` section rather than as R3/R6 errors); the pin-mirror
   suite keeps its current import form; OR
2. Migrate the imports to package specifiers (`@payswap/surface`,
   `@payswap/provider-runtime`) + workspace devDeps + lockfile update in a
   lane that has the pnpm toolchain, AND accept the platform->rails
   verification dependency by annotating `platform.may_depend_on` (or a
   test-only variant) — mechanism 1 of ADR-0004 generalizes.

Until accepted, the violations REMAIN visible in the report: 1 R3
(web -> provider-runtime) + 2 R6 (web -> provider-runtime, web -> surface).

## Consequences

- The pin-mirror verification keeps running unchanged (no gate regression).
- The boundary law stays honest: the violations are counted, not suppressed.
- Whichever mechanism is chosen, the surface/provider-runtime package export
  surfaces must expose every pinned symbol before the relative imports can be
  retired (spot-check: both export `.` -> `./src/index.ts`; symbol coverage
  must be verified in the migrating lane).

## Alternatives considered

- **Delete pin-mirror.test.ts**: rejected — removes accepted-gate verification.
- **Reclassify provider-runtime to contracts**: rejected — its rails layer is
  deliberate (P2-W2 acceptance integration note) and loosening/renaming layer
  rules to hide an edge is exactly what GOV-W1 must not do.
