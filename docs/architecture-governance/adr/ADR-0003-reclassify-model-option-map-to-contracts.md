# ADR-0003: Reclassify `@zcode/model-option-map` platform → contracts

- **Status:** ACCEPTED (TL-gated, 2026-10-11)
- **Scope:** `spec/architecture/MODULE-OWNERSHIP.yaml` `package_layers` annotation for `packages/model-option-map`
- **Resolves:** the last S1-class violation (contracts→platform edge `packages/shared -> packages/model-option-map`)
- **Law hook:** INVARIANTS.md invariant 29; LAYER-MAPPING.md rationale update accompanies this ADR

## Context

`packages/shared` (declared layer: contracts) imports
`@zcode/model-option-map` (declared layer: platform) in
`packages/shared/src/model-config.ts:2` — a contracts→platform edge that
violates the floor rule even after ADR-0002 (contracts may compose contracts
only). This edge was part of the S1 class in the baseline register.

Inspection of `packages/model-option-map`:

- Zero runtime dependencies (devDependencies: typescript only).
- Zero workspace imports — every import is intra-package (`./types.js`,
  `./compiler.js`, …).
- Deterministic pure-TS typed surface: a restricted-CEL compiler/evaluator and
  option-map merger over model configuration data.

It is contracts-grade by construction: a dependency-free, framework-free,
runtime-free typed library. The `platform` classification was a P0-W2 mapping
default (recorded in LAYER-MAPPING.md as "model option compilation (platform
model config data)"), not an authority claim.

Dependents today: `packages/shared` (contracts) and zcode-cli adapter packages
(platform). Reclassification to contracts keeps every existing edge legal
(every layer may depend on contracts) and adds none.

## Decision

Reclassify by additive annotation update:

```yaml
package_layers:
  packages/model-option-map: contracts   # was: platform
```

LAYER-MAPPING.md rationale updated to record the contracts-grade evidence
(leaf, dependency-free, deterministic typed surface).

## What this does NOT change

- No source file changes.
- No layer RULE changes — this walks ADR-0002's [contracts] allow-list, it does
  not widen it.
- `domain_contracts_framework_free` remains machine-checked; the package has
  no framework imports to begin with.

## Consequences

- The contracts→platform S1 edge resolves; the strict baseline drops to the
  3 S3 R6 hygiene defects only (scheduled in ADR-0001).
- The P0-W2 mapping's honesty is preserved: the mapping said "platform" with a
  data-oriented rationale; new evidence (the shared-package dependency) shows
  the contracts classification is the correct one, and the change is made by
  ADR, not by silent remap.
