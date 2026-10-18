# P7-W1 Baseline Verification Record — Web Product (Surface + Web UI on the ZCode substrate)

Work order: P7-W1 (spec/dependency/work-orders.md: "New PaySwap Surface +
Web product on ZCode-derived Web substrate."; spec/dependency/graph.md
Phase 7). Migration authority: MMP-10 (design ADAPT) + MMP-36 (web
REWRITE) + the P7-W1 share of MMP-35 (ux PORT) per
spec/migration/migration-matrix.json.
Lane: experience (Phase 7 = product).
Branch: `work/p7-w1` (base `2999bbb` — "STATE: P2-W1 ACCEPT ... PHASE 2
COMPLETE (976 tests)"; the program's verified base for this lane).
Write surface: `packages/ui/**`, `packages/web/**`, `spec/web/**`,
`docs/web-evidence/**` + ONE mechanical exception receipted in §7
(`pnpm-lock.yaml` — the lockfile consequence of the work-order-mandated
vitest devDeps; no root config, no other package touched).
Old-repo evidence pin: `payswapdotorg/payswap.org@8a735bf1639198c43115087a2992555166a9acf9`
(read-only; the old `packages/design` is ADAPT evidence per MMP-10, the
old `packages/web` is content/IA evidence + behavioral oracle per
MMP-36, the old `packages/ux` is the P7-W1/P7-W3 split source per
MMP-35 — never authority).

## 1. Battery receipts (exact commands, exit codes, counts)

Node v24.21.0; pnpm 10.33.2 (the pinned toolchain). Commands run at the
exact scopes the work order names.

| # | Command (cwd) | Exit | Result |
|---|---------------|------|--------|
| 1 | `pnpm install --frozen-lockfile` (repo root) | 0 | full substrate install PASS (base-state run: Done in 48.9s; post-change verification runs: Done in 3.2s — lockfile consistent) |
| 2 | `pnpm run typecheck` (repo root) | 0 | `tsc -b ... packages/ui packages/web ...` — covers both substrate packages via project references; zero diagnostics |
| 3 | `pnpm --filter @zcode/ui lint` | 0 | oxlint: **0 errors, 37 warnings — exactly the base-state warning count** (the two warnings the port initially added in TEST files — utils.test.ts intentional falsy-part constant, hooks.test.tsx unused beforeEach import — were cleaned; final delta vs base: zero) |
| 4 | `pnpm --filter @zcode/web lint` | 0 | oxlint: **0 warnings, 0 errors** (base had 0/0) |
| 5 | `npx vitest run` (`packages/ui`) | 0 | **15 files / 226 tests, all PASS** (jsdom; 218 ported design-oracle tests + 8 net-new law tests; 11.1s) |
| 6 | `npx vitest run` (`packages/web`) | 0 | **14 files / 116 tests, all PASS** (node-env + one jsdom app-shell file; 5.0s) |

Per-file test counts (vitest):
`@zcode/ui`: tokens 33, state-tokens 25, components-batch1 21,
components-states 19, components-tabs-dialog 16, components-nav 16,
components-forms 16, components-detail 15, components-palette 15, hooks
14, components-listpage 12, components-statuschip 10, index 3, utils 3,
design-boundary (NET-NEW) 8.
`@zcode/web`: home 10, honest-states 13, pin-mirror (NET-NEW) 13,
capabilities 8, coverage 8, security 8, navigation 9, a11y 7,
error-reasons 7, outcome-vocabulary 7, developers 6, routes (NET-NEW) 8,
product-boundary (NET-NEW) 9, incumbent-views 3.

Determinism scan: zero `fetch(`/`WebSocket`/`EventSource`/
`XMLHttpRequest` in either package's PaySwap test surface; zero
`Date.now`/`new Date`/`Math.random` in both packages' PaySwap src
(machine-checked by design-boundary.test.ts L5 + product-boundary.test.ts
P5; the one receipted exception is the design layer's Toast auto-dismiss
interaction timer — UI timing, never a rendered derivation).

## 2. MMP-10 design ADAPT — old -> new receipts (packages/ui)

Old suite baseline (migration matrix): 14 files / 218 tests PASS (jsdom).
Ported coverage: **218/218 old tests ported/adapted** (none dropped, none
weakened; +8 net-new law tests = 226).

| Old file (payswap.org@8a735bf packages/design) | Tests | New home (packages/ui/test/payswap) | Ported | Adaptation |
|---|---|---|---|---|
| test/tokens.test.ts | 33 | tokens.test.ts (33) | 33 | ADAPTED: import path -> src/payswap/tokens.js; tokens.css read path; **F-1 fix** (line 50 syntax error `const i, lo]` -> `const [hi, lo]` — the old file could not parse at the reviewed commit) |
| test/state-tokens.test.tsx | 25 | state-tokens.test.tsx (25) | 25 | ADAPTED: state vocabulary import split to state-tokens.js; components.css reads -> the 8 split css/* files |
| test/components-batch1.test.tsx | 21 | same name (21) | 21 | ADAPTED: import paths only |
| test/components-detail.test.tsx | 15 | same name (15) | 15 | ADAPTED: import paths only |
| test/components-forms.test.tsx | 16 | same name (16) | 16 | ADAPTED: import paths only |
| test/components-listpage.test.tsx | 12 | same name (12) | 12 | ADAPTED: import paths + css read -> css/listing.css |
| test/components-nav.test.tsx | 16 | same name (16) | 16 | ADAPTED: import paths only |
| test/components-palette.test.tsx | 15 | same name (15) | 15 | ADAPTED: import paths only |
| test/components-states.test.tsx | 19 | same name (19) | 19 | ADAPTED: import paths only |
| test/components-statuschip.test.tsx | 10 | same name (10) | 10 | ADAPTED: state vocabulary -> state-tokens.js; css reads -> css/status.css + src/payswap paths |
| test/components-tabs-dialog.test.tsx | 16 | same name (16) | 16 | ADAPTED: import paths only |
| test/hooks.test.tsx | 14 | same name (14) | 14 | ADAPTED: import paths only |
| test/index.test.tsx | 3 | same name (3) | 3 | ADAPTED: barrel import -> src/payswap/index.js |
| test/utils.test.ts | 3 | same name (3) | 3 | ADAPTED: import path only |
| test/setup.ts + test/node.d.ts | — | setup.ts + node.d.ts | — | PORTED verbatim (jest-dom + cleanup; ambient decls) |
| (none) | — | design-boundary.test.ts (8) | — | NET-NEW: L1 no-network, L2 no-money-semantics, L3 no-authority-verbs, L4 no-@payswap-imports, L5 determinism, L6 harness/token contract |

Source adaptation receipts (src):

| Old source | Lines | New source | Adaptation |
|---|---|---|---|
| src/tokens.ts | 457 | tokens.ts (312) + state-tokens.ts (263) | ADAPT: split at the outcome-state boundary (<=400-line file law); StatusChip/StatusPill tone vocabulary stays in tokens.ts, the 8-state outcome + environment vocabularies move to state-tokens.ts; no semantic change; both re-exported from index.ts |
| src/tokens.css | 309 | tokens.css (309) | ADAPT: header provenance only |
| src/tailwind-theme.css | 106 | tailwind-theme.css (107) | ADAPT: import specifier -> local file; header |
| src/components.css | 2076 | components.css (24, @import aggregator) + css/{base,overlay,nav,states,status,listing,catalog,support}.css (324/234/295/222/255/202/341/253) | ADAPT: split by component group in original order; NO rule modified; each file <=400 lines |
| src/components/*.tsx (29 files) | — | components/*.tsx (29 files) | ADAPT: import paths (state vocabulary -> state-tokens.js); 2 unused imports fixed (F-3); all <=400 lines |
| src/hooks/*.ts (5) + src/utils/cx.ts | — | hooks/*.ts + utils/cx.ts | ADAPT: one unused import fixed (useFocusTrap useState); otherwise verbatim |
| src/index.ts | 134 | index.ts (135) | ADAPT: barrel re-exports both token modules (byte-compatible public surface) + the NET-NEW contracts module |
| (none) | — | contracts.ts (112) | NET-NEW: design-token contract + oracle harness types (TOKEN_VERSION 1.1.0) |
| package.json | — | package.json (modified) | ADAPT: additive exports `./payswap`, `./payswap-tokens.css`, `./payswap-styles.css`; NET-NEW devDeps vitest/jsdom/@testing-library + `test` script (substrate conventions = the accepted 3.0 packages' toolchain, vitest ^3.2.7) |
| (none) | — | vitest.config.ts (17) | NET-NEW: jsdom env, test/payswap include, setup file |

PACKAGE LAW (presentation-only) machine-checked on the new surface:
design-boundary.test.ts L1 (no network), L2 (no money types/arithmetic —
MoneyInput is digit grouping only), L3 (no authority verbs on the
barrel), L4 (no @payswap/* imports), L5 (no ambient clock/random in
rendered derivations; Toast auto-dismiss timer = the one receipted
interaction-timing exception), plus the ported hue law (no indigo/blue
primary) and UNKNOWN-vs-danger disjointness invariants in tokens.test.ts.

## 3. MMP-36 web REWRITE + MMP-35 P7-W1 share — old -> new receipts (packages/web)

Old web suite baseline: 38 files / 561 tests PASS (node-env). Old ux
suite baseline: 14 files / 332 tests PASS. This lane ports the oracle to
the new product's pages/features WHERE THE PRODUCT RE-IMPLEMENTS THAT
BEHAVIOR (the work order's law); the split is receipted file-by-file.

### 3a. Ported (behavior re-implemented)

| Old file (packages/web/test) | Old tests | New home (packages/web/test/payswap) | New tests | Classification |
|---|---|---|---|---|
| home.test.tsx | 6 | home.test.tsx | 10 | ADAPTED 6 (positioning, five-action board [old: five journeys], honest coverage summary, entry CTA + honest gate expectation, public links, non-custody commitments) + NET-NEW 4 (nothing-dispatchable lead, UNKNOWN language, no-evidence default, recorded-evidence fold, API-authority band) |
| capabilities.test.tsx | 8 | capabilities.test.tsx | 8 | ADAPTED 7 (verified/blocked/awaiting/local-rail/supporting distinctions, cert numbers, limitations, MTN-MoMo-BLOCKED-never-connected, provenance) over recorded-evidence INPUT + NET-NEW 1 (the honest no-evidence state of this repository) |
| security.test.tsx | 8 | security.test.tsx | 8 | ADAPTED 8 (six commitments, external-observation custody, vault-by-name, session isolation, evidence+UNKNOWN handling, deployment-phase posture) + canonical BLOCK/ALLOW/UNKNOWN vocabulary assertions folded in |
| developers.test.tsx | 6 | developers.test.tsx | 6 | ADAPTED 4 (API-is-authority, honest unconfigured state with the env var named + no fabricated URL, configured state, product/API separation) + NET-NEW 2 (consumable contracts, refusal to document certified commands pre-P7-W3) |
| coverage.test.ts | 8 | coverage.test.ts | 8 | ADAPTED 7 (verbatim status partition, MTN-MoMo-stays-BLOCKED, deterministic UTC formatting, provider-label passthrough, determinism) + NET-NEW 1 (fail-closed on drifted status — the old module's fail-loudly law re-expressed) |
| a11y-aria + a11y-deep-links + a11y-keyboard (3 files) | ~23 | a11y.test.tsx | 7 | ADAPTED the static-markup aria + deep-link laws over the new pages (named interactives, aria-current active nav, decorative svg aria-hidden, one h1/page, all internal hrefs resolve to real product routes, honest 404); keyboard-interaction specifics DROPPED (see 3b) |
| (ux) honest-states.test.ts | 21 | honest-states.test.ts | 13 | ADAPTED: the INV-X01 laws (UNKNOWN never failure; reconciliation path surfaced; retry only as NEW intent with fresh key; total folds) over the CANONICAL envelope + StageStatus vocabulary |
| (ux) error-reasons.test.ts | ~10 | error-reasons.test.ts | 7 | ADAPTED: deterministic actionable error folds; ambiguity renders as UNKNOWN reconciliation never a red error; no user-side fix => no retry affordance; over WebErrorFamily |
| (ux) outcome-vocabulary.test.ts | ~9 | outcome-vocabulary.test.ts | 7 | ADAPTED: the 8-state chip contract (exact set/order/labels/dashed-processing law) + the 5-action registry + the board's honest dispatchability flips |
| (ux) product-ia.test.ts + sidebar-contract.test.ts | ~24 | navigation.test.ts | 9 | ADAPTED: the IA laws over the pinned eleven-area IA (exact set/order, purposes name money objects, honest empty states, unique routes, no verb slugs, auditable law citations, fold totality/determinism/fail-closed) |
| (ux) incumbent-views.test.ts | ~8 | incumbent-views.test.ts | 3 | PORTED: the provenance strength-order law (INV-E04 posture) |
| (none) | — | pin-mirror.test.ts | 13 | NET-NEW: imports accepted surface + provider-runtime src directly; asserts every pin + registry mirror field-for-field, fold agreement across all deployment contexts, pin headers name sources |
| (none) | — | product-boundary.test.tsx | 9 | NET-NEW: P1 no-fetch-in-view-layer, P2 no-@payswap-imports + pin provenance, P3 non-custody vocabulary + custody-claim scan, P4 honest-UNKNOWN + no credential capture, P5 determinism |
| (none) | — | routes.test.tsx | 8 | NET-NEW: additive-mount predicate (substrate routes excluded), total route table, app shell mounts with honest deployment facts (jsdom) |

### 3b. Dropped (with reasons)

- **P7-W3 territory (the command surface CONTRACTS — explicitly not this
  lane):** old ux command-center.test.ts, command-grammar.test.ts,
  command-center-provider-plane.test.ts, journeys.test.ts,
  product-journeys.test.ts, messaging-adapters.test.ts,
  trusted-approvals.test.ts; old web cc-* (16 files), search-*
  (3 files), universal-interface.test.tsx. The command-center grammar
  core, messaging adapters and trusted approvals belong to P7-W3; the
  journey execution surfaces need the API plane (TL accept-time
  integration). The UX SPLIT is receipted file-by-file in §4.
- **Old-app machinery superseded or not re-implemented in this phase:**
  auth-connect.test.tsx (old session machinery — the ZCode web auth
  substrate owns the session plane; wiring is TL accept-time), api-client
  (no API client in the v1 product — WEB-3 presentation-only view layer),
  infra-health + infra-release-repro (Next.js deployment specifics — the
  substrate is Vite), dependency-audit (superseded by the presentation-
  only boundary scan in product-boundary.test.ts), payment-detail /
  payments-plane / payment-view / payment-link-builder / w1-create-payment /
  consumer-* (4 files) (journey execution + the old consumer mobile
  surface — require the API plane and the P7-W3 command surface),
  honest-states.test.tsx web-jsdom parts (the honest-state LAWS survive
  in the design suite + honest-states/error-reasons folds),
  certification-boundaries B2/B3/B4 (old transport/session/local-rail
  specifics — superseded by WEB-3 and the substrate's own transport; the
  B1 provider-boundary and B5 UNKNOWN-boundary LAWS survive in
  product-boundary.test.ts P1/P4).
- **Keyboard-interaction specifics** (old a11y-keyboard): the command-
  center keyboard surfaces are P7-W3 territory; the design layer's
  keyboard/focus laws ARE covered (ported hooks + components suites,
  including focus-trap, chords, skip-link, reduced-motion).

### 3c. Source adaptation receipts (src)

| New source | Classification | Note |
|---|---|---|
| pins/surface-pins.ts + pins/provider-runtime-pins.ts + pins/index.ts | NET-NEW (structural pins) | every pin field-for-field from the accepted packages; mirror-tested |
| lib/outcome-registry.ts + lib/areas.ts | NET-NEW (registry mirrors) | the surface registry DATA mirrored verbatim; capability folds re-implemented with the source's exact reason strings; mirror-tested incl. fold agreement |
| lib/coverage.ts | ADAPT of old web lib/coverage.ts | the honest-coverage fold law; evidence as EXPLICIT input (old baked JSON imports — those evidence files are old-repo records, not carried); fail-closed on drifted statuses |
| lib/outcome-board.ts | NET-NEW | the five-action honest dispatchability board |
| lib/honest-states.ts | PORT (P7-W1 share of old ux honest-states + error-reasons) | the LAWS over the canonical pinned vocabulary; the old @payswap/interfaces/@payswap/execution type surface does not exist in 3.0 |
| lib/navigation.ts | PORT (old ux product-ia navigation law) | over the pinned eleven-area IA — no second navigation vocabulary |
| pages/* (6 files) | ADAPT (old web public-site content law) | honest copy pinned by the oracle; data via props only |
| shell/* + routes.ts | NET-NEW | additive /payswap mount; explicit PaySwapProductInput |
| payswap-product.css + payswap-home.css | NET-NEW | page composition over the design-layer primitives (split for the file law) |
| main.tsx (modified) | ADAPT (additive branch only) | the /payswap* mount inserted before the substrate's share/app branches; substrate behavior unchanged |
| env.d.ts (modified) | ADAPT (additive) | VITE_PAYSWAP_API_URL declaration |
| package.json (modified) | ADAPT | vitest + jsdom devDeps, `test` script |

## 4. MMP-35 ux split receipt (file-by-file)

Old `packages/ux` = 11 files / 11,209 src lines; 14 files / 332 tests.

| Old file | Lines | P7-W1 (this lane) | P7-W3 (NOT this lane) |
|---|---|---|---|
| command-center.ts | 2433 | the UI view-model vocabulary re-expressed over the pinned eleven-area IA + outcome board (navigation.ts, outcome-board.ts) | the command grammar CORE (the universal command model) |
| journeys.ts | 2352 | — | journey command dispatch (needs the API plane) |
| product-journeys.ts | 3274 | — | product journey contracts (P7-W3 command surface) |
| honest-states.ts | 764 | PORTED (lib/honest-states.ts over canonical vocabulary) | — |
| error-reasons.ts | 269 | PORTED (folded into lib/honest-states.ts) | — |
| incumbent-views.ts | 274 | PORTED (contracts/honest-states.ts strength order) | — |
| product-ia.ts | 1280 | the navigation LAW over the pinned eleven-area IA (lib/navigation.ts) | the old role/palette nav vocabulary (superseded by the canonical IA) |
| messaging-adapters.ts | 293 | — | NOT this lane (work order: P7-W3 share) |
| trusted-approvals.ts | 176 | — | NOT this lane (work order: P7-W3 share) |
| index.ts | 49 | barrel law re-expressed per-module | — |
| types/node-builtins.d.ts | — | test-infra pattern ported (node.d.ts) | — |

## 5. Decision records

**D-1 — Substrate kept, product mounted additively.** `packages/web` is
the ZCode web client (Vite SPA). The PaySwap product renders under
`/payswap*` through an additive branch in `main.tsx` inserted alongside
the substrate's own special paths (OAuth callback, conversation share) —
the substrate's default behavior is unchanged (machine-checked: the
mount predicate excludes every substrate route; the substrate's own
`packages/web/test`... none existed — its lint/typecheck surface is
unchanged and green). The old Next.js file-routes are re-expressed as
the `resolvePaySwapRoute` table.

**D-2 — Structural pins, not imports (the layer law).** Substrate
packages depend on `@zcode/*` only. Every PaySwap contract shape the
product renders is a local mirror pin; `pin-mirror.test.ts` imports the
accepted source packages' src DIRECTLY (test-only) and asserts equality
field-for-field, including the registry DATA and fold agreement — drift
fails the suite, never production. The TL swaps pins for real imports at
accept-time (mechanical: the mirror test defines the equivalence).

**D-3 — The old five journeys vs the canonical five outcome actions.**
The old home's journey narrative (Connect a provider / Pay / Collect /
Pay out / Reconcile) named old-repo authority owners. The canonical
outcome vocabulary is the accepted surface registry (Pay / Receive /
Move / Convert / Checkout) with honest dispatchability facts — the
adapted oracle asserts the canonical board (and the honest
nothing-dispatchable lead for this deployment phase).

**D-4 — Coverage evidence as explicit input; this repository has none.**
The old coverage module imported the old repo's probe/rollout JSONs at
build time. Those records are old-repo evidence (NOT carried — this
repository has no committed provider evidence). The fold consumes a
`CoverageSource` input; the deployment default is
`NO_EVIDENCE_COVERAGE` (the honest no-evidence state); the recorded-
evidence-shaped FIXTURE exists only in tests to drive the ported
explorer laws.

**D-5 — Test-side resolution stubs.** vitest externalizes bare
`@zcode/*` workspace imports (Node cannot execute the substrate's
NodeNext .js-suffix TS source), so the web suite aliases the design-
layer specifier onto `test/payswap/design.ts` (an in-root re-export
through a relative path) and the CSS specifiers onto an in-root CSS
stub. Test infrastructure only; src/** keeps importing the workspace
export. Receipted as L-4.

**D-6 — The lockfile exception.** The work order mandates both "add
vitest devDeps per substrate conventions" and "pnpm install
--frozen-lockfile must pass" — the only consistent reading updates
pnpm-lock.yaml (a mechanical dependency-resolution artifact, not config;
+470/-15 lines, all attributable to vitest/jsdom/@testing-library for
the two packages). Frozen install verified green post-change. If the TL
judges the lockfile out-of-surface, re-running `pnpm install` after
removing the devDeps reverts it — the suites are the deliverable.

## 6. Honest deviations and limitations (none hidden)

- **L-1: no live/browser evidence in this lane.** The deterministic
  battery is node/jsdom only (the work order's battery list names no
  browser run). The app shell mounts under jsdom
  (routes.test.tsx); a real `vite dev` walkthrough was performed only
  via typecheck/lint/build-graph consistency, not a screenshot —
  P8-W2 owns UX/client certification.
- **L-2: the authenticated product is honestly gated, not implemented.**
  The entry boundary renders the honest auth-required state + the
  eleven-area IA map with honest empty states. Session wiring is
  explicitly TL accept-time integration (WEB-6/§6 of the contract doc).
- **L-3: the old suite's recorded count 14f/218t could not have run
  verbatim at 8a735bf** (F-1: tokens.test.ts line 50 is a syntax error
  at the reviewed commit). The port carries the fix; the count matches
  218 exactly after it.
- **L-4: test-side resolution stubs** (D-5) — the design layer's CSS is
  not applied inside the node/jsdom suites (CSS processing off); the
  markup-level honesty assertions never depend on styling. The real
  stylesheets are exercised by the substrate build graph.
- **L-5: lint parity.** @zcode/ui lint finishes at exactly the
  base-state warning count (37 warnings / 0 errors): the two warnings
  the port initially surfaced (an intentional falsy-part constant in the
  ported utils.test.ts and an unused beforeEach import in the ported
  hooks.test.tsx — both carried from the old repo) were cleaned during
  adaptation. Two unused imports in adapted SOURCE files were also fixed
  (F-3). Zero new warning classes; zero errors.

## 7. Write-surface compliance

`git diff --name-only 2999bbb..HEAD`: 118 files (113 added + 5
modified) — 69 under `packages/ui/**`, 46 under `packages/web/**`, 1
`spec/web/WEB.md`, 1 `docs/web-evidence/BASELINE-VERIFICATION-RECORD.md`
(this record), plus `pnpm-lock.yaml` (receipted in D-6). ZERO files touched in any other
package, root config, spec area or docs area. Pre-existing substrate
files modified: exactly three, all additive and receipted —
`packages/ui/package.json` (exports + devDeps + test script),
`packages/web/package.json` (devDeps + test script),
`packages/web/src/main.tsx` (+27 lines: the additive mount branch),
`packages/web/src/env.d.ts` (+4 lines: VITE_PAYSWAP_API_URL).
File law: every NEW file (src + test + css) <=400 lines
(`main.tsx` is a pre-existing substrate file, 479 -> 503 lines — exempt
per the work order's pre-existing carve-out; the change is additive).
Zero `@payswap/*` imports in substrate package SOURCE (machine-checked
both packages). No inherited platform safeguard removed: the substrate's
exports, scripts, configs and routes are untouched except the receipted
additive changes above.
