# PaySwap 3.0 Web Product — Contract Document

Status: FROZEN FOR IMPLEMENTATION (P7-W1)
Packages: `@zcode/ui` PaySwap design layer (`packages/ui/src/payswap/`) + `@zcode/web` PaySwap web product (`packages/web/src/payswap/`)
Layer: platform (ZCode substrate — `packages/ui` and `packages/web` are declared `platform` in `spec/architecture/MODULE-OWNERSHIP.yaml`)
Work order: P7-W1 (spec/dependency/work-orders.md: "New PaySwap Surface + Web product on ZCode-derived Web substrate.")
Evidence: docs/web-evidence/BASELINE-VERIFICATION-RECORD.md

This document is the contract law of the web product plane. The packages
are the implementation; where code and this document disagree, that is a
defect (either fix the code or file an ADR — never silently diverge).

## 1. Position in the architecture

The web product renders the PaySwap product surface (MMP-36 REWRITE): a
NEW product built ON the ZCode Web substrate (`packages/web` is KEPT —
not forked), consuming the accepted PaySwap 3.0 contracts through
STRUCTURAL PINS, never through imports (substrate packages depend on
`@zcode/*` workspace packages only).

It owns:
- the PaySwap design layer (MMP-10 ADAPT) on `@zcode/ui`:
  presentation-only tokens and accessible primitives — emerald/amber
  accent language, NO indigo/blue primary, honest UNKNOWN styling;
- the public product pages (home, capabilities/coverage explorer,
  security/non-custody, developers) and the honest authenticated entry
  boundary under `/payswap` (an ADDITIVE mount — the substrate's own
  routes are untouched);
- the honest-state/error-reason/navigation view-model folds (the P7-W1
  share of MMP-35) over the canonical pinned vocabulary.

It does NOT own: financial truth (INV-1/INV-23 — every money/execution
state rendered comes from provider-verified observations in the pinned
CONFIRMED/UNKNOWN/FAILED vocabulary), authorization or policy decisions
(trust/security lanes), capability/connection state (P2-W1), the command
surface (P7-W3 — the old ux grammar core, messaging-adapters and
trusted-approvals are explicitly NOT ported by this lane), or any
transport (the view layer is presentation-only: data arrives via
props/contracts; the runtime host wires transport at TL accept-time
integration).

### Layer law

`packages/ui` + `packages/web` are platform-layer substrate packages.
Everything PaySwap-specific they render is either a LOCAL STRUCTURAL PIN
(`packages/web/src/payswap/pins/` + the mirrored registries in
`packages/web/src/payswap/lib/`) or PaySwap presentation vocabulary
(`packages/ui/src/payswap/`). A `@payswap/*` import inside a substrate
package is a boundary violation (machine-checked by
`packages/web/test/payswap/product-boundary.test.ts` and
`packages/ui/test/payswap/design-boundary.test.ts`). The pins mirror the
accepted source packages field-for-field and are verified by
`packages/web/test/payswap/pin-mirror.test.ts`, which imports the
accepted `packages/surface/src` and `packages/provider-runtime/src`
directly (test-only — the src boundary stays clean).

## 2. Structural pins (the wire shapes the product renders)

Every pin names its source package + module in its file header and is
mirror-tested against the source:

| Pin (packages/web/src/payswap/pins) | Source (accepted) | Mirrored shape |
|---|---|---|
| `PINNED_SURFACE_API_VERSION` | surface `version.ts` | `"1.0.0"` + provenance shape |
| `AmountSpecPin` | surface `amount-spec.ts` | `{ currency, minorUnits }` wire form |
| `OUTCOME_ACTION_IDS` + `OutcomeActionPin` + registry mirror (`lib/outcome-registry.ts`) | surface `outcomes.ts` | the five outcome actions: labels, outcome lines, advanced disclosures, dispatch authorities, capability folds |
| `OutcomeAreaAliasPin` | surface `outcome-area-aliases.ts` | action -> area anchors |
| `SURFACE_PROGRESS_STAGES_PIN` + `StageStatusPin` + `StageObservationPin` | surface `progress-states.ts` | the 16-stage lifecycle + six-value status vocabulary |
| `SecurityGateDecisionSourcePin` | surface `security-vocabulary.ts` | BLOCK/ALLOW/UNKNOWN decision source |
| `UNIVERSAL_AREA_IDS` + `UniversalAreaPin` + registry mirror (`lib/areas.ts`) | surface `areas.ts` | the eleven-area navigation IA (set + order + empty states) |
| `MoneyDisplayInputPin` | surface `money-view.ts` | explicit currency-digits/locale inputs |
| `EXTERNAL_EFFECT_OUTCOMES_PIN` + `AMBIGUITY_REASONS_PIN` + envelope pins | provider-runtime `result-envelope.ts` | CONFIRMED/UNKNOWN/FAILED + ambiguity reasons + `ExecutionResultEnvelope` |

## 3. Product laws (encoded + machine-checked)

- **WEB-1: honest UNKNOWN, everywhere.** UNKNOWN renders as UNKNOWN —
  reconciliation-first wording, never failure or success tone, never a
  blind retry (INV-04 at the UX boundary). FAILED renders honestly as
  failure; retry is offered only as a NEW intent with a fresh idempotency
  key. Checked by `honest-states.test.ts`, `error-reasons.test.ts`,
  `product-boundary.test.ts`.
- **WEB-2: non-custody messaging.** The product never claims custody:
  balances are external observations, never PaySwap custody; credentials
  live in an operator vault by reference; connections are user-authorized
  sessions. Checked by `security.test.tsx` + the custody-claim scan in
  `product-boundary.test.ts`.
- **WEB-3: presentation-only view layer.** No fetch/network in the
  product's pages/view-models/shell — data arrives via the explicit
  `PaySwapProductInput` (deployment facts, recorded coverage evidence,
  API runtime state); transport is TL accept-time integration. Checked by
  `product-boundary.test.ts` P1.
- **WEB-4: no fabricated state.** No invented providers (coverage renders
  recorded evidence verbatim and fails closed on drifted records); no
  fabricated API URL; no dead buttons (every outcome action renders its
  typed missing prerequisite); no credential capture on the honest gate;
  no fake success states (INV-24 posture).
- **WEB-5: substrate law.** No `@payswap/*` imports in substrate
  packages; the design layer is presentation-only (no money types, no
  authority verbs, no network, no ambient clock/random in rendered
  derivations). Checked by `design-boundary.test.ts` L1-L6.
- **WEB-6: additive mount.** `/payswap*` renders the PaySwap product;
  every substrate route (ZCode client root, OAuth callback, conversation
  share) stays untouched. Checked by `routes.test.tsx`.
- **WEB-7: design-token law.** Emerald is the single brand accent; amber
  carries attention AND UNKNOWN; red carries failure ONLY; no
  indigo/blue primary anywhere (checked by the ported design oracle's
  WCAG/hue invariants in `packages/ui/test/payswap/tokens.test.ts`).

## 4. Determinism

All folds are pure; page renders are deterministic functions of their
view inputs; no ambient clock, locale or registry read exists in either
package's PaySwap surface (machine-checked). Test suites are
deterministic: node/jsdom environments, no network, recorded-evidence
fixtures are inert data.

## 5. Test suites

- `packages/ui` (jsdom): 15 files / 226 tests — the ported design oracle
  (14 files / 218 tests, the old suite 1:1) + 8 net-new design-layer law
  tests. Run: `npx vitest run` from `packages/ui`.
- `packages/web` (node + one jsdom file): 14 files / 116 tests — the
  ported web/ux oracle + 30 net-new law/mirror/route tests. Run:
  `npx vitest run` from `packages/web`.

The substrate battery (root `pnpm run typecheck` via tsc -b project
references; `pnpm --filter @zcode/ui lint` +
`pnpm --filter @zcode/web lint` oxlint) covers both packages at the
repository root.

## 6. Integration boundary (TL accept-time)

What the TL wires at accept-time: real `@payswap/surface` /
`@payswap/provider-runtime` imports in place of the pins (the pins are
mirror-verified so the swap is mechanical); the API runtime host for the
developers page (`VITE_PAYSWAP_API_URL` or the canonical host decision);
the session plane for the authenticated entry boundary (ZCode web auth
substrate or the canonical PaySwap session authority); recorded
provider-probe/rollout evidence records as the coverage source; the
command-center surface when P7-W3 lands (the area routes `/app/*` inside
the authenticated product).
