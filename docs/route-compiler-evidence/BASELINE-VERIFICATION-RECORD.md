# P5-W1 Baseline Verification Record — Route Compiler (R3-W1 rebuild)

Work order: P5-W1 (spec/dependency/work-orders.md: "best execution,
route scoring and mixed-rail deterministic compilation"), rebuilt under
lane R3-W1 (a rebuild of the accepted-then-lost work/p5-w1, whose
verified results are the prior-art oracle below).
Branch: `work/r3-w1` (base `e80c932ff6d7bf5e014c56cd8a90dc60cb0a6f78d` =
main: "MERGE R3-W2: onchain-extensions rebuild — R3 wave 1/3. tsc 0;
16f/164t ALL PASS", verified with `git log --oneline -1` after
checkout).
Write surface: `packages/route-compiler/**`, `spec/route-compiler/**`,
`docs/route-compiler-evidence/**` (pairwise-disjoint law; hard
constraint 8: zero files touched outside the surface — verified by
`git diff --name-only e80c932..HEAD`, all paths under the three roots).
Old-repo evidence pin: `payswapdotorg/payswap.org@8a735bf1639198c43115087a2992555166a9acf9`
(read-only; classified PORT per spec/migration/migration-matrix.json
MMI-19: route-compiler 13f/165t + mixed-rail 8f/71t + best-execution
7f/81t, authority owner P5-W1; evidence, never authority — PaySwap 3.0
architecture wins).

## 1. Battery receipts (exact commands, exit codes, counts)

All commands run from `packages/route-compiler/` on Node v24.21.0 (the
CI-faithful battery; clean tree).

| # | Command | Exit | Result |
|---|---------|------|--------|
| 1 | `rm -rf node_modules package-lock.json && npm install --no-workspaces` | 0 | toolchain installed (devDependencies exactly `typescript@^6.0.3` + `vitest@^3.2.7`; zero runtime dependencies) |
| 2 | `npx tsc --noEmit` | 0 | **zero diagnostics** |
| 3 | `npx vitest run` | 0 | **29 files / 353 tests, all PASS** (~4s, fully offline, deterministic) |
| 4 | export census (plain-Node type-stripping import of `src/index.ts`: `node --experimental-strip-types`) | 0 | **172 named runtime exports: 131 functions + 41 consts** |

Prior-art oracle (the lost accepted build, work/p5-w1): tsc 0
diagnostics; vitest **29 files / 353 tests, all PASS**; plain-Node v24
type-strip barrel import green with **172 runtime exports (131
functions + 41 consts)**. REPRODUCED EXACTLY on every axis: 0 = 0
diagnostics; 29 = 29 files; 353 = 353 tests; 131 + 41 = 172 exports.

Tree statistics (prior-art oracle -> this rebuild):

| Metric | Oracle | This rebuild |
|---|---|---|
| src files (root + pins/) | 56 (52 + 4) | **56 (52 + 4)** ✓ |
| src lines | 12,608 | 11,583 (−1,025; D-3) |
| src max file lines | 384 | 399 (≤ the ~400 file law ✓) |
| test files (test + support) | 39 (29 + 10) | **39 (29 + 10)** ✓ |
| test lines | 7,953 | 5,529 (−2,424; D-3) |
| test max file lines | 387 | 366 (≤ the file law ✓) |
| titled `it()` sites | 306 | **306** ✓ |
| runtime registrations | 353 | **353** ✓ (306 + 47 loop expansion: the failure-injection matrix expands one site over 8 plans x 6 fault kinds to 48 registrations) |

## 2. Test classification (306 titled sites -> the oracle's account)

Per-file classification (PORTED = the old law carried verbatim onto the
new surface; ADAPTED = the old law re-homed on a 3.0 contract; REWRITTEN
= the old law's approach inverted onto a stricter law; NET-NEW = a law
the old suite did not have):

| New file | Sites | P | A | R | N | Notes |
|---|---|---|---|---|---|---|
| smoke.test.ts | 5 | 3 | 0 | 0 | 2 | old rc/be/mr smoke (package name, census, lane surface) + net-new census + frozen-vocabulary laws |
| boundary.test.ts | 7 | 4 | 0 | 1 | 2 | REWRITTEN: the old dependency/allowlist guard onto the stricter ZERO-SIBLING law; P: relative-only imports, no-@payswap, test-import surface, determinism+file law; N: manifest/tsconfig/node.d.ts + metadata venue-neutrality (F-3) |
| pins.test.ts | 10 | 0 | 0 | 2 | 8 | REWRITTEN: the old real-contracts pair (no-shadow-models + kernel-validators-reject-fakes) INVERTED onto structural-pin laws — pins byte-identity + real-value subset-typing; N: frozen value pins, fingerprint, patterns, key set, widening probe, module zero-sibling law |
| canonical-time.test.ts | 10 | 0 | 0 | 0 | 10 | NET-NEW: pure civil-arithmetic strict-ISO (epoch origin, round trips, lenient-form rejection, leap rule, day boundaries, negative epochs, ms exactness) |
| intent.test.ts | 13 | 0 | 13 | 0 | 0 | ADAPTED: old rc-intent onto the neutral 10-key pin (closed keys, fail-closed, no custody state, rail-vocabulary unrepresentable) |
| exact-math.test.ts | 12 | 8 | 0 | 0 | 4 | old comparator exact-arithmetic (unreduced products, single floor, malformed rejection, BigInt scale) + N: identities, signed sums |
| quote-observation.test.ts | 11 | 6 | 0 | 0 | 5 | old comparator freshness/provenance/observer/staleness-bound laws + N: aggregate validation, outcome vocabulary |
| outcome-dimensions.test.ts | 10 | 6 | 0 | 0 | 4 | old comparator dimension laws (risk ranks, disclosures, fee identity, health bounds) + N: gas/slippage/time/route-shape dimension probes |
| policy.test.ts | 10 | 5 | 0 | 0 | 5 | old comparator+engine policy laws (aggregate validation, complete deductions, tie-break total order) + N: conversionFor exactness, allowlist |
| venue-port.test.ts | 13 | 9 | 0 | 0 | 4 | old venue-port registration laws (duplicates, declared-simulation-real, port surface, synchronous methods, INV-08 baseline literal) + N: registry lookups |
| scoring.test.ts | 15 | 10 | 0 | 0 | 5 | old comparator net-outcome laws (worst case scored, every component once, no-hidden-constants deltas, fail-closed conversion, parity) + N: plan-level order pair (moved to scoring-order), component totality |
| scoring-order.test.ts | 6 | 0 | 0 | 0 | 6 | NET-NEW: the order laws — the discriminating pair whose planId order OPPOSES the crossing order, the railCrossingCount WITHIN-leg unit law 1/1/0/0/1 (F-2), risk/time order, closed vocabulary |
| liquidity.test.ts | 11 | 0 | 0 | 0 | 11 | NET-NEW: advisory-only literals, always-false gates, freshness bounds, no-authorization surface, gate-unsatisfiable funding, impact-only scoring |
| best-execution-engine.test.ts | 16 | 15 | 0 | 0 | 1 | old engine pipeline laws (health-first, hard constraints, scope law, UNKNOWN held, contained failures, determinism, margins) |
| gates-integration.test.ts | 9 | 8 | 0 | 0 | 1 | old gates-integration (BLOCK terminal, UNKNOWN never converted, no bypass, record-level discipline, stale re-run) |
| no-fake-quote-to-success.test.ts | 15 | 14 | 0 | 0 | 1 | old no-fake-quote seam attacks (only-path law, terminal states, reconciliation-as-new-observation, foreign refs/chains, malformed observations, append-only) |
| stale-routes.test.ts | 10 | 8 | 0 | 0 | 2 | old stale-routes (inclusive bounds, exact-1ms invalidation, health-alone, re-run discipline) |
| adversarial.test.ts | 11 | 10 | 0 | 0 | 1 | old adversarial (venue-name scan, address scan, privileged-venue parity, secret-field guard, observations-not-custody) + N: float-parsing scan |
| never-production.test.ts | 9 | 9 | 0 | 0 | 0 | old mixed-rail never-production (tier literal, always-false gate, forgeries, lifecycle stages, no unwrap) |
| onchain-lane-discovery.test.ts | 13 | 13 | 0 | 0 | 0 | old lane-discovery (three-status honesty, AUTHORIZATION/ELIGIBILITY/SECURITY semantics, exact grounding, fail-closed inputs, determinism) |
| lane-execution-walk.test.ts | 12 | 12 | 0 | 0 | 0 | old execution-walk + simulation-faults (fault classes, canonical mappings, staleness first, deterministic ids, tier brand) |
| comparability-gate.test.ts | 13 | 0 | 3 | 0 | 10 | ADAPTED: old kernel-composition comparability seeds; N: the five-requirement law (requirement/gap vocabularies, per-requirement gap probes, baseline exemption, honest-arrival law, verdict-wrap F-1) |
| route-1-crypto-dex-offramp.test.ts | 13 | 10 | 0 | 0 | 3 | old route-1 (both shapes, lineage, custody chain, planned amounts, walk, exclusion, journey) + N: comparability/score/fingerprint/crossing assertions |
| route-2-fiat-psp-chain.test.ts | 10 | 9 | 0 | 0 | 1 | old route-2 (custody chain, exact conversion, delivery, exclusions, stale grounding) |
| route-3-dex-bridge.test.ts | 10 | 9 | 0 | 0 | 1 | old route-3 (bridge UNKNOWN arrival, environments, same-chain direct, gate-bound writes, exclusions) |
| route-4-merchant-balance.test.ts | 10 | 0 | 10 | 0 | 0 | ADAPTED: old route-4 Stripe shapes onto the provider-neutral merchant law (Mode A provider-verified eligibility, Mode B honest marker, freshness, faults) |
| custody-continuity.test.ts | 10 | 10 | 0 | 0 | 0 | old custody-continuity (positive + adversarial: closed vocabulary, evidence, INV-C09 gaps, INV-F01, identity-by-name) |
| determinism.test.ts | 9 | 9 | 0 | 0 | 0 | old determinism (deep-equal, permutation invariance, pure ids, canonical order, walk equality, at-sensitivity, expiry) — the 3 net-new fingerprint laws live as assertions within carried sites |
| failure-injection.test.ts | 3 | 3 | 0 | 0 | 0 | old failure-injection matrix (loop-expanded 8 plans x 6 faults = 48 registrations; INELIGIBLE throw; cross-family faults) |
| **Total** | **306** | **190** | **26** | **3** | **87** | ✓ the oracle's classification exactly |

## 3. Old-suite porting account (270 old sites)

| Old suite (sites) | Carried | Folded | Dropped (with reason) |
|---|---|---|---|
| route-compiler/smoke (5) | 1 | 4 | — |
| route-compiler/intent (14) | 13 | 1 | — |
| route-compiler/route-1 (10) | 10 | — | — |
| route-compiler/route-2 (9) | 9 | — | — |
| route-compiler/route-3 (9) | 9 | — | — |
| route-compiler/route-4 (13) | 10 | 3 | — |
| route-compiler/custody-continuity (10) | 10 | — | — |
| route-compiler/determinism (9) | 9 | — | — |
| route-compiler/failure-injection (11) | 7 | 4 | — |
| route-compiler/kernel-composition (13) | 9 | 1 | 3 (v2 constant-product venue math 1 — venue lane P5-W2; opportunity-context pair 2 — out of scope, P6-W2) |
| route-compiler/lab-composition (3) | — | — | 3 (Lab candidate-organization/metrics plane — superseded by the never-production tier laws + P6-W1 lane) |
| route-compiler/evidence-files (3) | 1 | — | 2 (evidence-json env-switch mode — hermetic law: the battery is offline and deterministic; digest/tamper laws carried in-memory) |
| route-compiler/boundary (9) | 6 | 3 | — |
| mixed-rail/smoke (4) | 1 | 3 | — |
| mixed-rail/boundary (8) | 4 | 3 | 1 (fixture synthetic-address scan — closed surface: this branch's fixtures carry no real-shaped addresses at all) |
| mixed-rail/never-production (9) | 9 | — | — |
| mixed-rail/onchain-lane-discovery (13) | 13 | — | — |
| mixed-rail/kernel-composition (3) | 1 | — | 2 (v2 constant-product uniswap math 1 — venue lane; real intents-pack participation 1 — zero-sibling law) |
| mixed-rail/simulation-faults-unknown (12) | 12 | — | — |
| mixed-rail/mixed-rail-composition (14) | 2 | 4 | 8 (Lab candidate-organization/metrics plane — superseded; P6-W1 lane) |
| mixed-rail/real-contracts (8) | 2 | 6 | — |
| best-execution/adversarial (10) | 10 | — | — |
| best-execution/comparator (17) | 17 | — | — |
| best-execution/engine (17) | 17 | — | — |
| best-execution/gates-integration (8) | 8 | — | — |
| best-execution/no-fake-quote-to-success (17) | 17 | — | — |
| best-execution/stale-routes (9) | 9 | — | — |
| best-execution/smoke (3) | 3 | — | — |
| **Total (270)** | **219** | **32** | **19** |

**219 carried = 190 PORTED + 26 ADAPTED + 3 REWRITTEN** (one carried old
site per P/A/R site; merges and splits balance across the totals).
**Never weakened:** every carried and folded law asserts the same
discipline or stricter (the REWRITTEN three are stricter by
construction: the zero-sibling guard, and the pin laws which replace
import-the-real-contracts with prove-the-pins).

The 19 DROPPED sites, by class (6 classes):
1. evidence-json env-switch mode — 2 (hermetic law);
2. v2 constant-product venue math — 2 (venue lane P5-W2);
3. opportunity-context pair — 2 (out of scope, P6-W2);
4. Lab candidate-organization/metrics plane — 11 (superseded by the
   in-package never-production tier laws; the Lab engine itself is
   P6-W1);
5. real @payswap/intents pack participation — 1 (zero-sibling law);
6. fixture synthetic-address scan — 1 (closed surface).

## 4. Per-file adaptation receipts (old -> new src)

| New src | Old evidence | Receipt |
|---|---|---|
| src/canonical-time.ts | (net-new) | Pure civil-arithmetic strict-ISO: replaces the old suites' Date.parse-based freshness probes (the hidden-normalization-channel law — lenient forms rejected structurally) |
| src/exact-math.ts | be/src/exact-math.ts (134 L) | PORT verbatim semantics (unreduced products, single floor, fail-closed validation) |
| src/quote.ts + engine-support.ts | be/src/quote-observation.ts, venue-port.ts | PORT: freshness/provenance/observer law, aggregate quote validation; the quote type re-homed on the pinned vocabularies |
| src/quote-fees.ts | be/src/outcome-dimensions.ts (397 L) | PORT of the dimension vocabularies (risk/fee/health) |
| src/policy.ts | be/src/policy.ts (230 L) | PORT (aggregate validation, total-order tie-breakers); TIE_BREAKER_KINDS extended with FEWER_RAIL_CROSSINGS + PLAN_ID for the plan level |
| src/scoring.ts | be/src/comparator.ts (330 L) | PORT (OUTPUT from worst case, per-component floors, fail-closed conversions, signed net) |
| src/scoring-order.ts | be/src/comparator rankCandidates | PORT (venue level, VENUE_ID final) + NET-NEW plan level (FEWER_RAIL_CROSSINGS, PLAN_ID final) |
| src/venue-port.ts + venue registry | be/src/venue-port.ts (515 L) | PORT: the neutral port now OWNS the venue surface (the extension lane ships declarative packs on this branch); registration law verbatim |
| src/best-execution.ts + engine-assess/support | be/src/engine.ts (945 L) | PORT of the five-stage pipeline onto the injected security-gate evaluator (the real gates live in @payswap/onchain-security — zero-sibling law); statuses, margins, contained failures verbatim |
| src/execution-record.ts | be/src/execution-record.ts (316 L) | PORT verbatim (the no-fake-quote seam: 10-state machine, terminal states, observation-only transitions) |
| src/route-validity.ts | be/engine stale-route block | PORT (inclusive bounds, QUOTE_STALE/HEALTH_OBSERVATION_STALE, re-run never repair) |
| src/provenance.ts | be/src/provenance.ts (136 L) | PORT (the decision-trace types; split from the engine under the file law) |
| src/onchain-lane.ts + lane-grounding.ts | mr/src/onchain-lane.ts (383 L) | PORT+ADAPT: discovery through THIS package's engine (the old engine import is now internal); the three-status honesty and exact grounding verbatim |
| src/execution-walk.ts | mr/src/execution-walk.ts (321 L) | PORT (fault taxonomy, canonical mappings, staleness-first, deterministic ids) |
| src/simulation-tier.ts | mr/src/simulation-tier.ts (122 L) | PORT verbatim (the never-production tier law) |
| src/intent.ts | rc/src/intent.ts (351 L) | ADAPT onto the economic lane's neutral pin (MMI-02 precedent): origins/destinations become observation-grounded FundsLocationRefs; the closed key set, fail-closed discipline and custody-free probe preserved |
| src/grounding.ts | rc/src/leg-contracts.ts (grounding block) | PORT+ADAPT: GroundedObservation gains the MANDATORY observationVersion (the preservation law); location observations ground the neutral intent's rails |
| src/custody.ts, rail-family.ts | rc/src/leg-contracts.ts (custody block) | PORT (5-kind vocabulary, continuity, INV-E02/F01) + NET-NEW rail families/crossings (F-2 WITHIN-leg) |
| src/authorization.ts | rc/src/leg-contracts.ts (authorization block) | PORT+ADAPT: STRIPE-specific variant -> PROVIDER_VERIFIED_SETTLEMENT_ELIGIBILITY (provider-neutral); CORRIDOR_ELIGIBILITY_LINEAGE added for the provider-native family |
| src/finality.ts, planned-amount.ts, assumptions.ts | rc/src/leg-contracts.ts | PORT (finality candidates, 4-basis amounts) + NET-NEW auditable assumptions (the fifth requirement) |
| src/merchant-legs.ts | rc/src/stripe-legs.ts (318 L) | ADAPT: provider-neutral merchant settlement (Mode A/B, rule-30 literals, P5-W3 awaiting authority) |
| src/payout-gate.ts | rc/src/fiat-legs.ts payout block + connectors gate | ADAPT: the six-gate report is an INPUT wire type (F-1: the REAL wire type, never a simplified stand-in); the compiler owns destination/settlement laws only |
| src/comparability-gate.ts | (net-new; work-order law) | The five-requirement law first-class: closed vocabularies, gapCodes verdict-wrap (F-1), baseline exemption (INV-C08), honest-arrival law |
| src/corridor.ts | (new; capability lane contract) | The corridor-view consumption: candidates, baseline pick, version pins (byte-identical projection version pin) |
| src/compiler*.ts (6 files) | rc/src/compiler.ts (2,215 L) + walk.ts (837 L) | PORT+ADAPT: the old origin/destination-KIND dispatch re-homed as OBSERVATION-GROUNDED location grounding; 9 shapeIds preserved; honest exclusions, shared tails, digest discipline, INV-C08 emission, discovery-tier literal |
| src/route-walk.ts + walk-outcomes.ts | rc/src/walk.ts (837 L) | PORT: statuses, reconciliation plan (INV-X01/X02/X03), NOT_EXECUTED downstream honesty, custodyAtStop, typed faults |
| src/evidence.ts | rc/src/evidence.ts (173 L) | PORT+ADAPT: journey/lineage records gain the observation-VERSION fingerprint; the JSON-file mode dropped (hermetic law) |
| src/pins/ (4 files) | (new; the 3.0 law) | The structural mirrors per §2 of ROUTE-COMPILER.md (value pins byte-identical, subset typing) |

## 5. Verified findings (carried from the lost build, reproduced)

- **F-1 (fixtures/score payout evidence + gapCodes verdict-wrap):** the
  fixtures and the scored plans carry the payout gate report as the REAL
  wire type (six checks, allowed verdict, evidence refs — never a
  boolean stand-in); the comparability gate wraps every gap in the
  typed verdict (`{ comparable, gaps: [{legId, requirement, code,
  detail}] }`) — never bare gap lists, never exceptions. Both verified
  by comparability-gate.test.ts and route-1's authorization-lineage law.
- **F-2 (railCrossingCount WITHIN-leg):** a rail crossing is a custody
  family change WITHIN one leg (`custody.from -> custody.to`). The
  BETWEEN-leg definition is structurally dead under custody continuity
  (consecutive transfers agree on the handing-over party). The unit law
  1/1/0/0/1 (wallet->provider, bank->wallet, wallet->wallet,
  provider->provider, wallet->bank) is pinned in scoring-order.test.ts,
  and the plan-level metric is 2 for route 1 (deposit + bank legs).
- **F-3 (venue neutrality extended to the package metadata surface):**
  no venue name appears in package.json, tsconfig.json or
  vitest.config.ts (the boundary guard scans all three — the package
  description is venue-neutral prose); the src scan is word-boundary
  over 20 venue names.

## 6. Deviations from the prior-art oracle (with reasons)

- **D-1 (src lines 11,583 vs 12,608; test lines 5,529 vs 7,953):** the
  same 56/39 file trees and the same 306 sites carry the laws in denser
  form — the rebuild's modules share the canonical require-helpers and
  the fixtures share one deterministic core set, where the lost build
  repeated per-family boilerplate. All count targets that encode laws
  (files, tests, sites, exports, max file length within the ~400 law)
  are reproduced EXACTLY; the line totals are statistics, not laws.
- **D-2 (max src file 399 vs 384):** both satisfy the hard file law
  (max ~400 lines); the largest file (best-execution.ts) carries the
  engine class, whose per-stage machinery is already split into
  engine-assess.ts/engine-support.ts.
- **D-3 (module split):** route-walk is split into route-walk.ts +
  walk-outcomes.ts and the venue registry merged into venue-port.ts
  (net file count preserved at 56); the compiler is split into 6
  modules under the file law (the old compiler.ts was 2,215 lines).
- **D-4 (the intents participation drop):** the old mixed-rail
  kernel-composition site that imported the real @payswap/onchain-venues
  intents pack is dropped under the zero-sibling law (class 5 of §3);
  the lane-discovery engine laws cover the participation semantics with
  the neutral fixture venue.

## 7. Battery receipt (final run, this commit)

```
$ cd packages/route-compiler && npx tsc --noEmit && npx vitest run
 ✓ test/adversarial.test.ts (11)
 ✓ test/best-execution-engine.test.ts (16)
 ✓ test/boundary.test.ts (7)
 ✓ test/canonical-time.test.ts (10)
 ✓ test/comparability-gate.test.ts (13)
 ✓ test/custody-continuity.test.ts (10)
 ✓ test/determinism.test.ts (9)
 ✓ test/exact-math.test.ts (12)
 ✓ test/failure-injection.test.ts (50)
 ✓ test/gates-integration.test.ts (9)
 ✓ test/intent.test.ts (13)
 ✓ test/lane-execution-walk.test.ts (12)
 ✓ test/liquidity.test.ts (11)
 ✓ test/never-production.test.ts (9)
 ✓ test/no-fake-quote-to-success.test.ts (15)
 ✓ test/onchain-lane-discovery.test.ts (13)
 ✓ test/outcome-dimensions.test.ts (10)
 ✓ test/pins.test.ts (10)
 ✓ test/policy.test.ts (10)
 ✓ test/quote-observation.test.ts (11)
 ✓ test/route-1-crypto-dex-offramp.test.ts (13)
 ✓ test/route-2-fiat-psp-chain.test.ts (10)
 ✓ test/route-3-dex-bridge.test.ts (10)
 ✓ test/route-4-merchant-balance.test.ts (10)
 ✓ test/scoring-order.test.ts (6)
 ✓ test/scoring.test.ts (15)
 ✓ test/smoke.test.ts (5)
 ✓ test/stale-routes.test.ts (10)
 ✓ test/venue-port.test.ts (13)

 Test Files  29 passed (29)
      Tests  353 passed (353)
```

(failure-injection.test.ts registers 50 tests: 2 structural sites + the
8-plan x 6-fault matrix loop site (48 registrations); the suite total is
353 = 306 titled sites + 47 loop expansion.)
