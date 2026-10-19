# ADR-0006: web design-layer test stub re-export (vitest externalization)

- Status: PROPOSED
- Date: 2026-10-19
- Author: GOV-W1 (governance reconciliation lane)
- Deciders: resident TL (acceptance required — this is a stub, not a decision)

## Context

`packages/web/test/payswap/design.ts` re-exports the `@zcode/ui` design layer
through a RELATIVE path:

```ts
export * from "../../../ui/src/payswap/index.js";
```

This is the last remaining `web -> ui` R6 (cross-package-relative) occurrence
after GOV-W1's narrow fix of the twin build-config imports
(`pdfJsCMapsPlugin` now imported via the `@zcode/ui/vite/pdfJsCMapsPlugin`
package export in both `packages/web/vite.config.ts` and
`packages/desktop/vite.config.ts`).

The stub exists because of a toolchain constraint, documented in both
`packages/web/vitest.config.ts` and the stub itself: **vitest externalizes
bare `@zcode/*` workspace imports** — Node cannot execute the substrate's
NodeNext `.js`-suffix TypeScript source — so the suite aliases
`@zcode/ui/payswap` onto this in-root file, which re-exports through a
relative path that vite's TS-aware resolver CAN process. src/** keeps
importing `"@zcode/ui/payswap"` (the workspace export).

A package-specifier change inside the stub would break the suite at test time
(externalized -> Node resolution failure). This is structural, not narrow.

## Decision (proposed — NOT accepted)

Remove the need for the stub at the substrate level. Options (TL picks):

1. Ship built JS output for `@zcode/ui/payswap` (build pipeline change in the
   platform substrate) so vitest can externalize the bare specifier; or
2. A vitest plugin/config mechanism that processes workspace `@zcode/*` TS
   source instead of externalizing it (e.g. resolve.alias to source for test
   runs, applied consistently); or
3. Accept the stub permanently as documented test infrastructure via a policy
   carve-out (test-infra relative re-exports exempt from R6 with a mandatory
   explanatory header, which design.ts already carries).

Until accepted, this R6 occurrence REMAINS visible in the report.

## Consequences

- No test behavior changes now; the P7-W1 suite (14f/116t) and the
  P7-E2E-accepted gate stay green.
- The substrate decision unblocks the same pattern should other experience
  consumers need it.

## Alternatives considered

- **Change the stub to a package import now**: rejected — breaks the suite
  (the constraint the stub exists to satisfy); not verifiable in this lane
  (workspace toolchain unavailable).
