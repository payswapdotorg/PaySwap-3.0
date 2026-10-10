# P0-W2 Integration Proposal (NOT applied)

Scope item 5 of Work Order P0-W2: propose — do NOT apply — how the governance
tooling wires into root tooling. The TL integrates at acceptance; worker-2
does not own `package.json`, `pnpm-workspace.yaml` or CI config.

## Proposed script names (root package.json)

```jsonc
{
  "scripts": {
    // Proposed names; exact choice is TL's at acceptance.
    "governance:ownership": "node tools/architecture-governance/check-module-ownership.mjs",
    "governance:ownership:baseline": "node tools/architecture-governance/check-module-ownership.mjs --mode baseline",
    "governance:invariants": "node tools/architecture-governance/check-invariants.mjs",
    "governance:test": "node --test \"tools/architecture-governance/test/*.test.mjs\""
  }
}
```

Rationale for the `governance:` prefix: the inherited `architecture:*` scripts
(architecture:check/report/baseline:update/context) already exist for the
inherited ZCode policy tooling (`scripts/architecture/architecture-check.mjs`
driven by `architecture-policy.yaml` + `.architecture-baseline.json`). A
distinct prefix keeps the two governance systems from being confused during
the migration window and allows the TL to retire the legacy one deliberately.

## Relationship to the inherited architecture:check

The inherited tool enforces the ZCode module policy (module ids, layer
ordering domain/app/adapters for managed modules, file-size caps). P0-W2's
validator enforces the PaySwap 3.0 layer policy. They are complementary:

- inherited `architecture:check` stays authoritative for ZCode-internal
  module hygiene until the platform substrate is PaySwap-adapted;
- `governance:ownership` becomes authoritative for PaySwap layer direction
  (the frozen MODULE-OWNERSHIP.yaml);
- both can run in CI simultaneously; when a package is PaySwap-migrated, the
  ownership validator's rules apply and the legacy check's baseline entry for
  it can be retired.

## CI wiring proposal (later, when CI exists)

1. `governance:invariants` must be green (exit 0) — it is a pure consistency
   lint over spec files; any failure is a spec-drift bug.
2. `governance:test` must be green — pure unit tests, offline, fast (<1s).
3. `governance:ownership` in **baseline mode** during the migration window:
   exit code 1 with violations is the expected recorded state; CI should
   compare the violation set against a checked-in
   `docs/architecture-governance/reports/module-ownership-report.json`
   (ratchet semantics: new violations fail the build, fixed violations
   require a report refresh). Rationale: the inherited tree has 54 honest
   violations; failing every build on them would train people to bypass the
   gate, which the acceptance-gates evidence rule explicitly forbids.
4. When the violation count reaches 0 (or per-area 0), flip to strict mode
   exit-code gating, area by area.

## Report artifacts

- Machine report: `docs/architecture-governance/reports/module-ownership-report.json`
  (schema `payswap3.architecture-governance.module-ownership-report/1`).
  Deterministic (no timestamp unless `--stamp`), diff-friendly, committed.
- Human register: `docs/architecture-governance/VIOLATION-REGISTER.md`.
- Layer rationale: `docs/architecture-governance/LAYER-MAPPING.md`.

## Hook wiring (optional, later)

A git pre-push hook could run `governance:invariants` + `governance:test`
(fast) and the ownership validator in baseline mode with a ratchet check.
The repo already uses husky + lint-staged; wiring belongs to the TL and to
the worker that owns hook files in a later Work Order (P8-W3 release lane
candidate). Not proposed for immediate application.

## What must NOT be wired yet

- Do not add the validator to `verify:pre-push` until the ratchet baseline is
  accepted by the TL (otherwise every push from every lane fails on the 54
  inherited violations — a lane-killing false alarm).
- Do not replace `architecture:check` semantics with the ownership validator
  in the same change that introduces it; keep observability of both.
