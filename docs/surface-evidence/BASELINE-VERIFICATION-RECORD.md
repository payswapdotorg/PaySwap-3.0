# P2-W3 Baseline Verification Record — Surface/API Contracts

Work order: P2-W3 (spec/dependency/work-orders.md: "Framework-independent
PaySwap Surface contracts and capability/operation discovery projections.
Surface quote amount/currency, fee lines, rate/provenance, expiry, funding
and recipient assumptions, delivery estimate (label guarantee vs
estimate), authorization changes and understandable progress/return/
unknown states. UI remains a projection and cannot own financial truth.").
Lane: integration/experience/provider (Phase 2 = Surface/API).
Branch: `work/p2-w3` (base `3877a5fd19dd7718c57bfec0deb352cf5db61dcc`).
Write surface: `packages/surface/**`, `spec/surface/**`,
`docs/surface-evidence/**` (pairwise-disjoint law verified — zero files
touched outside the surface).
Old-repo evidence pin: `payswapdotorg/payswap.org@8a735bf1639198c43115087a2992555166a9acf9`
(read-only; the old `packages/surface` is PORT/ADAPT evidence per the
migration matrix, never authority).

## 1. Battery receipts (exact commands, exit codes, counts)

All commands run from `packages/surface/` (Node v24.21.0; exact battery
commands from the work order).

| # | Command | Exit | Result |
|---|---------|------|--------|
| 1 | `npm install --no-workspaces 2>/dev/null \|\| npm install` | 0 | typescript@6.0.x + vitest@3.2.x installed (warnings only: esbuild postinstall not in allowScripts — no impact) |
| 2 | `npx tsc --noEmit` | 0 | strict + exactOptionalPropertyTypes, zero diagnostics |
| 3 | `npx vitest run` | 0 | **11 files / 106 tests, all PASS** (44 ported/adapted + 62 net-new; per-file below) |
| 4 | `npx tsx -e "import('./src/index.ts').then(m=>console.log('EXPORTS:', Object.keys(m).length))"` | 0 | `EXPORTS: 33` (33 runtime-value exports; type-only exports are erased at runtime by design) |

Corroboration (plain Node type-stripping, as in the P1 lanes):
`node --input-type=module -e "import('./src/index.ts').then(...)"` -> 0,
`EXPORTS: 33`. The package deliberately contains no enums/namespaces/
decorators (erasable syntax only).

Per-file test counts (vitest): surface-contract 14, money-view 14,
quote-terms 13, progress-states 15, outcome-aliases 11,
authorization-changes 8, discovery 8, corridor-coverage 9,
vocabulary-folds 6, boundary 7, smoke 1.

Old-suite baseline: 3 files / 44 tests PASS (old repo
`packages/surface/test/*`). Ported coverage: **44/44 old tests
ported/adapted** (none dropped, none weakened):

| Old file (44 tests) | New home | Ported | Net-new added |
|---------------------|----------|--------|---------------|
| surface-contract.test.ts (20) | surface-contract.test.ts (14) + money-view.test.ts (6) | 20 | money-view +8 |
| vocabulary-folds.test.ts (13) | vocabulary-folds.test.ts (6: gate fold 4 + mode indicator 2) + quote-terms.test.ts (7 adapted from the convert-disclosure fold) | 13 | quote-terms +6 |
| outcome-aliases.test.ts (11) | outcome-aliases.test.ts (11) | 11 | — |
| (no counterpart) | progress-states.test.ts, authorization-changes.test.ts, discovery.test.ts, corridor-coverage.test.ts, boundary.test.ts, smoke.test.ts | — | +48 (15+8+8+9+7+1) |

Net-new total: 62 (8 money-view + 6 quote-terms + 15 progress + 8
authorization-changes + 8 discovery + 9 corridor + 7 boundary + 1 smoke).
44 + 62 = 106 = the vitest count above.

## 2. Per-file adaptation receipts (old -> new)

| Old source (payswap.org@8a735bf) | Lines | New source | Lines | Adaptation |
|---|---|---|---|---|
| packages/surface/src/version.ts | 52 | src/version.ts | 55 | PORT (SURFACE_API_VERSION/SurfaceStability/surfaceProvenance verbatim semantics; work-order id P4-W4-002 -> canonical P2-W3) |
| packages/surface/src/money-view.ts | 88 | src/money-view.ts | 154 | ADAPT: exact integer display law PORTED (bigint-only, honest labeled 2-digit fallback, U+2212 minus, sort key); the runtime import `getCurrencyInfo` from @payswap/protocol is NOT ported — currency digits + locale data are now EXPLICIT inputs (MoneyDisplayInput); net-new formatMoneyAmount (wire AmountSpec, validated through the pin) and groupSize |
| packages/surface/src/outcomes.ts | 306 | src/outcomes.ts (269) + src/outcome-area-aliases.ts (66) | 335 | ADAPT: five actions + honest dispatchability PORTED; old dispatch authorities (old-repo packages) -> canonical PaySwap planes; old certified API commandTypes RETIRED (P7-W3 owns the command surface) -> accepted P1-W1 intent vocabulary referenced BY VALUE; the old @payswap/ux alias table is NOT ported (package does not exist in PaySwap 3.0) -> NET-NEW reconciliation onto the eleven-area IA (single navigation vocabulary, typed against UniversalAreaId) |
| packages/surface/src/areas.ts | 211 | src/areas.ts | 252 | ADAPT: eleven areas + order + empty states PORTED; old researchCitations (old-repo Stripe UX corpus) -> canonical lawCitations (auditable paths in THIS repository) |
| packages/surface/src/convert-preview.ts | 164 | src/quote-terms.ts (327; the disclosure-fold law) | 327 | ADAPT: the old fold itself (over route-compiler output) is NOT ported — route compilation is P5-W1 territory; the disclosure-fold LAW (two-level view, honest counts, verbatim reasons, nothing silently dropped) ports onto the NET-NEW quote/terms projection (Wise §4.2) |
| packages/surface/src/security-vocabulary.ts | 141 | src/security-vocabulary.ts | 187 | ADAPT: BLOCK/ALLOW/UNKNOWN people-language folds PORTED; the type import from @payswap/onchain-security is NOT ported -> structural SecurityGateDecisionSource pin; mode indicator PORTED (INV-25 visibility) |
| packages/surface/src/index.ts | 66 | src/index.ts | 141 | ADAPT: full public surface re-export |
| (none) | — | src/amount-spec.ts (109), src/progress-states.ts (335), src/authorization-changes.ts (191), src/discovery.ts (267), src/corridor-coverage.ts (164) | — | NET-NEW (AmountSpec structural pin; progress/exception/UNKNOWN projections; authorization-change surfaces; operation discovery; corridor coverage) |
| packages/surface/test/* (3 files, 44 tests) | 557 | test/* (12 files, 106 tests) | — | PORT/ADAPT per §1; test/node.d.ts PORTED from the canonical trust package (boundary scanner ambient decls) |
| package.json (old: 4 runtime deps) | — | package.json | 24 | ADAPT: runtime `dependencies` REMOVED entirely (old had @payswap/onchain-security + @payswap/route-compiler + @payswap/protocol + @payswap/ux — ALL four reversed/obsolete imports dropped); devDeps typescript ^6.0.3 + vitest ^3.2.7 only; exports "." -> "./src/index.ts" |
| (none) | — | tsconfig.json, vitest.config.ts | 14+8 | NET-NEW scaffold (extends ../../tsconfig.base.json; same pattern as the accepted P1 packages) |

Classification: package-level **PORT/ADAPT** (the old surface's contracts
adapted to the PaySwap 3.0 canonical architecture); file-level: PORT
(version, money display core, outcome/area registries, gate folds, mode
indicator), ADAPT (dispatch authorities, citations, quote fold target),
NET-NEW (quote/terms, progress states, authorization changes, discovery,
corridor coverage, AmountSpec pin, aliases onto areas, boundary law).

## 3. Decision records

**D-1 — All four old runtime dependencies dropped (architecture wins).**
The old surface imported @payswap/protocol (getCurrencyInfo),
@payswap/onchain-security (GateDecision type), @payswap/route-compiler
(structural source) and @payswap/ux (alias vocabularies). None of these
packages exist in PaySwap 3.0, and the work order pins the surface as
contracts-grade with zero runtime dependencies while sibling lanes are in
flight. Consequences: currency/locale metadata became explicit inputs;
the gate decision became a structural pin; the route-compiler fold was not
ported (P5-W1 territory) — its disclosure law ported to the quote/terms
projection; the alias table was rebuilt onto the eleven-area IA. All
machine-checked by test/boundary.test.ts (no @payswap/* import, no
non-relative import in src).

**D-2 — AmountSpec declared structurally (duplicate-type risk accepted,
TL-reconciled).** Same decision as the economic lane: the contracts layer
(MODULE-OWNERSHIP may_depend_on [contracts]) cannot import the trust
layer. The pin is byte-identical (currency /^[A-Z]{3}$/, minorUnits
/^(0|[1-9][0-9]*)$/) with identical validation patterns; the TL wires
imports at integration if the layer law ever allows it.

**D-3 — Old certified API commandTypes retired.** The old
payments.intent.create / payments.collect.request / payouts.payout.create
strings certified the OLD repository's @payswap/api. Inventing certified
commands for PaySwap 3.0 now would fabricate authority. The dispatch block
references the accepted P1-W1 intent vocabulary BY VALUE
(MoneyMovementIntent/PaymentIntent) and the canonical topology note; the
universal command surface lands with P7-W3.

**D-4 — No money arithmetic, anywhere (INV-01/INV-23).** Fee totals are
displayed verbatim as DECLARED by the quote authority, or honestly "not
declared" — the surface never sums. Rate cross-checks, limit enforcement
and every other money computation stay with the financial authority. This
required the quote source to carry `declaredTotalFees` explicitly; the
honest NOT_DECLARED note is the alternative display.

**D-5 — `.ts` import specifiers + allowImportingTsExtensions** (same as
the accepted P1 packages): source-direct export, plain-Node importable,
`tsc --noEmit` battery.

**D-6 — package-lock.json committed for toolchain reproducibility.**
Same pattern as the accepted protocol lane (packages/protocol/
package-lock.json is committed on main; trust/economic are lock-free).
The lockfile is a tooling artifact, exempt from the 400-line law and
documented as such in test/boundary.test.ts; devDependency ranges are
pinned (typescript ^6.0.3, vitest ^3.2.7 — matching the accepted P1
packages).

**D-7 — wise §4.2/§4.3/§4.4 mapped, not copied.** Quote behavior is
PaySwap's own contract (versioned source, explicit expiry, material-change
handling); Wise's 30-minute lock, state names and idempotency mechanisms
are NOT ported as constants. The mapped laws: estimate-vs-guarantee
labeling, submission-not-finality, payout-sent-not-beneficiary-credit,
late returns, UNKNOWN-not-FAILED — all in this package's tests.

## 4. AmountSpec pin verification (verbatim)

New `src/amount-spec.ts`:

```ts
export interface AmountSpec {
  readonly currency: string;
  readonly minorUnits: string;
}
```

Byte-identical to the pin and to the Phase-1 declarations (diff-verified
against packages/trust/src/amount-spec.ts). Validation semantics
identical: currency `/^[A-Z]{3}$/`, minorUnits `/^(0|[1-9][0-9]*)$/`.
Machine-checked by test/money-view.test.ts (formatMoneyAmount fail-closed
table) and test/quote-terms.test.ts (malformed wire refusal through the
quote path).

## 5. Honest deviations and limitations (deliverables, none hidden)

1. **The layer mapping annotation is a TL integration step.** This work
   order's write surface cannot touch MODULE-OWNERSHIP.yaml or the CI
   matrix; the TL must add `packages/surface: contracts` to package_layers
   and `surface` to the CI packages matrix at acceptance (the package
   local battery above is the evidence to gate on).
2. **Structural pins await TL wiring.** QuoteTermsSource,
   CapabilityOperationSource, CorridorSource and
   SecurityGateDecisionSource pin what the sibling lanes own (P2-W1
   capability fabric; P1-W3 trust satisfies the security pin by
   construction). The TL wires imports at integration; until then the
   surface is deliberately self-contained (INV-28 pairwise-disjoint law).
3. **Determinism boundary is display-level.** `now` inputs are compared
   lexicographically as ISO-8601 strings (documented); callers must supply
   canonical same-format timestamps. No timezone conversion exists in this
   package (explicit-input law); a future i18n consumer carries locale data.
4. **Mode enforcement is visibility only.** modeIndicator makes
   TEST/LIVE/TESTNET/MAINNET visible (INV-25); the mechanical enforcement
   machinery is provider-runtime territory (P2-W2), recorded there.
5. **Zero-decimal/onchain currencies need explicit digits.** The honest
   fallback assumes 2 digits and SAYS SO; onchain symbols with other
   scales must be supplied through currencyDigits (documented in
   SURFACE-CONTRACTS.md §7). No currency registry exists at contracts
   grade — that is the financial lane's knowledge, not the surface's.
6. **The old convert/route fold is not ported** (P5-W1 territory) — only
   its disclosure law (see §2). A found limitation, deliberately scoped.

## 6. Write-surface compliance

Files added on `work/p2-w3` relative to base 3877a5f live exclusively under
`packages/surface/`, `spec/surface/`, `docs/surface-evidence/`. Zero
modifications to `packages/capability/**` or `packages/provider-runtime/**`
(sibling lanes, not created by this branch anyway), `packages/economic|protocol|trust/**`
(read-only), `spec/architecture/**`, `tools/**`, `MODULE-OWNERSHIP.yaml`,
root `package.json` / `pnpm-workspace.yaml` / `pnpm-lock.yaml`, or any
inherited package. No pushes to GitHub (workers hold no push credentials).
