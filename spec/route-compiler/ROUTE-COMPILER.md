# PaySwap 3.0 Route Compiler — Contract Document

Status: FROZEN FOR IMPLEMENTATION (P5-W1; R3-W1 rebuild)
Package: `@payswap/route-compiler` (`packages/route-compiler`)
Exports: `.` (the curated barrel — 172 runtime exports: 131 functions + 41 consts)
Authority owner: `intelligence` layer (spec/architecture/MODULE-OWNERSHIP.yaml:
`may_depend_on: [economic, capability, contracts]`;
`cannot_authorize_financial_effects: true`); route optimization is Work
Order P5-W1 (spec/dependency/work-orders.md: "best execution, route
scoring and mixed-rail deterministic compilation"); migration MMI-19 /
MMP-30 (spec/migration/migration-matrix.json: route-compiler,
mixed-rail and best-execution classified PORT, authority owner P5-W1)
Evidence: docs/route-compiler-evidence/BASELINE-VERIFICATION-RECORD.md
Rebuild: R3-W1 on base e80c932ff (main: "MERGE R3-W2: onchain-extensions
rebuild — R3 wave 1/3. tsc 0; 16f/164t ALL PASS")

This document is the contract law of the route-optimization plane. The
package is the implementation; where code and this document disagree,
that is a defect (either fix the code or file an ADR — never silently
diverge).

## 1. Position in the architecture

This package OWNS the intelligence-side route-optimization vocabulary:

- the VENUE PORT and the venue registry (the venue-NEUTRAL execution
  surface registered from outside — on this branch the extension lane
  (@payswap/onchain-extensions, P5-W2) ships venue packs as DECLARATIVE
  data with no executable methods, so the port lives here);
- the BEST-EXECUTION ENGINE (the five-stage decision pipeline with the
  INJECTED security-gate evaluator — the real evaluator lives in
  @payswap/onchain-security, P4-W2; this package never re-implements
  security);
- the NET-OUTCOME SCORING (exact rational arithmetic over declared
  dimensions; the valued-component trace) and the RANKING LAWS (venue
  level with VENUE_ID total order; plan level with FEWER_RAIL_CROSSINGS
  and PLAN_ID total order);
- the QUOTE-TO-EXECUTED TRANSITION RECORD (the no-fake-quote seam);
- the COMPARABILITY GATE (the five-requirement law below);
- the MIXED-RAIL COMPILER (ONE neutral MoneyMovementIntent -> candidate
  RoutePlans through the observation-grounded route families);
- the ROUTE WALK (the deterministic, fault-injectable Lab-tiered plan
  walk) and the JOURNEY/LINEAGE EVIDENCE records.

It does NOT own: the intent (P1-W1 economic owns the neutral demand),
the corridor projection (P2-W1 capability owns the discovery
projection — consumed here through pinned shapes), security gates
(P4-W2), venue pack descriptors (P5-W2 — pinned structurally here),
merchant onboarding/checkout (P5-W3 — the merchant SETTLEMENT leg
carries the honest awaiting-authority marker), the execution graph
(P3-W2 — the compiler's lineage records feed it), Lab runtime (P6-W1 —
walks are Lab-TIERED, never the Lab engine).

## 2. The layer law (v1 hermetic, zero sibling imports)

`packages/route-compiler` is a v1 intelligence-layer package: ZERO
sibling imports — no `@payswap/*` anywhere in src, no tsconfig paths
entries, not even TYPE-ONLY ones (STRICTER than the accepted
P1/P2-era pattern that allowed type-only trust imports; the boundary
guard asserts every src AND test module specifier is relative). Where
a cross-lane contract shape is needed, it is re-declared as a MINIMAL
SUBSET-TYPED STRUCTURAL MIRROR in `src/pins/` (4 modules) with
authority-naming doc comments:

- `pins/economic.ts` — AmountSpec, the 10-key neutral
  MoneyMovementIntent, FundsLocationRef, IntentConstraints
  (authority: @payswap/economic);
- `pins/capability.ts` — EXECUTION_MODES (byte-identical), the two-axis
  availability vocabularies, the connected instance, the capability
  observation, the corridor view/route evaluation/lineage
  (authority: @payswap/capability);
- `pins/onchain.ts` — the swap-kind/quote-semantics/slippage
  vocabularies (authority: @payswap/onchain-extensions), the chain-key
  and venue-key patterns, the chain-finality/failure vocabularies, the
  gate decision, the prepared write, the execution observation
  (authority: @payswap/onchain-domain / -security);
- `pins/execution-graph.ts` — the observation-version pin, the
  versioned observation record, the material execution terms, the
  observationVersionFingerprint (authority: @payswap/execution-graph).

Value pins are pinned BYTE-IDENTICAL to the authority lanes and their
cross-lane consistency is asserted by test/pins.test.ts (value pinning,
never value imports — a value import would be a runtime dependency).
Structural pins are SUBSET-typed: a genuine authority value remains
structurally assignable to the pin, while a pin can never widen an
authority law.

## 3. The P5-W1 law (the comparability gate)

The work order's law, encoded as the first-class
`evaluateComparabilityGate`:

> A provider-native path is the BASELINE candidate; composed/
> multi-provider routes are comparable ONLY when each leg has current
> eligibility, credible pricing, actual connection/permission,
> funding/payout constraints, and auditable assumptions.

- The five requirements are the closed, frozen
  `COMPARABILITY_REQUIREMENTS` vocabulary; the gap codes the closed
  `COMPARABILITY_GAP_CODES` (13); the verdict WRAPS them (F-1: never
  bare gap lists, never exceptions): `{ comparable: true }` or
  `{ comparable: false, gaps: [...] }` with every gap leg-scoped,
  requirement-typed, coded and detailed.
- A PROVIDER_NATIVE_BASELINE plan is EXEMPT (INV-C08: the gate compares
  composed routes AGAINST the incumbent — it never disadvantages the
  baseline).
- CURRENT_ELIGIBILITY: each leg's state grounding carries fresh,
  version-stamped observations (a version-less grounding is not
  evidence); grounding failures are honest gaps.
- CREDIBLE_PRICING: planned amounts are INTENT_DECLARED, QUOTE_GROUNDED
  (the worst case — the optimistic estimate NEVER enters arithmetic) or
  CONVERSION_GROUNDED (a declared exact-rational rule). A swap leg must
  be QUOTE_GROUNDED. THE HONEST-ARRIVAL LAW: a bridge leg's UNKNOWN
  arrival amount (observed at destination-chain finality, never
  estimated) is NOT a pricing gap — its priced quantity is the grounded
  deposit upstream.
- CONNECTION_PERMISSION: the leg's authorization evidence must be an
  actual ALLOW (BLOCK is terminal, rule 27; UNKNOWN is never converted,
  INV-X01), an allowing payout gate (connection scope alone NEVER
  passes), a corridor eligibility lineage, or provider-verified
  settlement eligibility.
- FUNDING_PAYOUT_CONSTRAINTS: the off-ramp payout leg requires the
  transfer-out grant AND the EXPLICIT external destination (the bank
  leg's arrival). LIQUIDITY ESTIMATES NEVER SATISFY THIS (see §5).
- AUDITABLE_ASSUMPTIONS: each composed leg carries a non-empty,
  evidence-referenced, expiry-bounded assumption set (expired
  assumptions are honest gaps, never silent passes).

## 4. Best execution and scoring laws

- DETERMINISM: pure-function compilation — same inputs -> same routes,
  byte-identical (permutation invariance over every array input; the
  canonical emission order is planId; the compiler itself does NO
  ranking). No ambient clock (every instant caller-supplied), no
  randomness, no network, no float parsing; timestamps are DATA in
  strict ISO-8601 UTC, converted by PURE CIVIL ARITHMETIC (no Date
  object anywhere — the hidden-normalization-channel law).
- EXACT MONEY (INV-F01 extended to valuations): every valued boundary
  crosses the exact-rational module (BigInt, canonical decimal
  strings); each component floors ONCE at its boundary — the same rule
  for outputs and costs.
- NO HIDDEN CONSTANTS: every number that influences a scored decision
  is a DECLARED policy field (the conversion table, the COMPLETE
  per-risk-class deduction table with '0' explicit, timeCostPerMs); a
  missing conversion fails closed (the valuation never guesses a rate).
- HARD CONSTRAINTS BEFORE SOFT OPTIMIZATION (rule 14): allowlist, hops,
  time budget, risk cap, health — then the net outcome.
- INV-C08 BASELINE INDIFFERENCE: the scoring input carries dimensions
  + policy ONLY — never execution mode, optimization origin or baseline
  status. The engine never consults optimizationOrigin. The compiler
  EMITS the baseline like any candidate (never ranked away, never
  fabricated without real evidence).
- THE ONLY PATH TO AN EXECUTED STATE is a domain-validated execution
  observation bound to the record's executionRef and the route's chain
  (the no-fake-quote seam); a quote — however fresh, however
  executable — never produces an executed state; BROADCAST and
  CONFIRMED-without-candidate are NOT executed (rule 29); FAILED and
  EXECUTED_CANDIDATE are terminal; OUTCOME_UNKNOWN is resolvable by a
  later observation (reconciliation IS a new observation).
- STALE ROUTES ARE RE-RUN, NEVER REPAIRED: the selected route's quote
  and health observations are freshness-bounded (the inclusive law:
  fresh at exactly maxAge, stale 1 ms later); an invalidated route
  throws; the original decision remains immutable history.
- UNKNOWN IS NEVER CONVERTED (INV-X01): venue OUTCOME_UNKNOWN,
  health-UNKNOWN and gate-UNKNOWN are carried honestly in the decision
  trace; only fresh evidence resolves them.

## 5. Liquidity is advisory only

A LiquidityEstimate carries `advisoryOnly: true` as a LITERAL type (a
non-advisory record is unrepresentable and rejected by validation);
`liquidityPermitsCustody()` and `liquidityPermitsAuthorization()` are
first-class always-false contracts; the comparability gate's funding
requirement has no liquidity-satisfiable path; scoring consumes only
the declared impact-cost basis points. Liquidity estimates are NOT
custody and NOT authorization (the work-order law, made structural).

## 6. Custody, finality and failure semantics

- INV-C09 (no hidden custody): the closed 5-kind party vocabulary
  (ONCHAIN_WALLET, EXTERNAL_PROVIDER, EXTERNAL_BANK_INSTRUMENT,
  ONCHAIN_PROTOCOL, MERCHANT_BALANCE); every transfer evidenced
  (INV-E02) with exact-integer amounts; the CONTINUITY LAW
  (assertCustodyContinuity) makes gaps structurally unrepresentable.
- RAIL CROSSINGS are counted WITHIN legs (custody.from -> custody.to
  family changes — F-2): BETWEEN-leg family changes are structurally
  dead under continuity. The crossing metric is advisory (the
  FEWER_RAIL_CROSSINGS tie-breaker and the plan metrics).
- FINALITY IS NEVER ASSUMED (INV-F06): `finalityNeverAssumed` is a
  literal type; candidates only (chain models or PROVIDER_OWNED).
- FAILURE SEMANTICS are the frozen INV-X singleton on every leg:
  unknownIsNotFailed, blindRetryForbidden,
  resolver: SETTLEMENT_RECONCILIATION_AUTHORITY.

## 7. Lineage preservation (the observation-VERSION law)

The graph keeps the EXACT versions it decided on. The compilation
result carries `observationVersionPins` (instance + exact version +
digest for every corridor route, location observation and asset
observation it consumed); each plan's lineage record carries the
route/quote/authority/evidence lineage with the
`observationVersionFingerprint` (same versions -> same fingerprint;
any version change -> a different fingerprint). Every leg's grounding
observations carry their exact observation versions — never "latest".

## 8. The walk tier (never production)

Route-plan walks are LAB SIMULATIONS: every result carries
LAB_EXECUTION_TIER ("LAB_SIMULATION_NON_PRODUCTION") as a runtime
brand; `labTierPermitsFinancialSettlement()` is always false;
`rejectLabTierForFinancialSettlement` always throws (the downstream
gate every settlement-adjacent consumer must call); the tier is
distinct from chain-environment classes. The walk is deterministic and
fault-injectable per rail family (cross-family faults throw); walking
an INELIGIBLE_CANDIDATE throws (would fabricate execution).

## 9. Package discipline

- Zero runtime dependencies; devDependencies EXACTLY typescript +
  vitest; private, ESM, the single barrel export.
- No `node:` imports in src; test/node.d.ts declares `process.cwd` as
  a FUNCTION global (exactly once, never a string property).
- The file law: every src AND test file <= 400 lines.
- Venue-neutrality extends to the METADATA surface (F-3): no venue
  name in package.json, tsconfig.json or vitest.config.ts (the
  boundary guard scans them).
- Deterministic tests only; the CI-faithful battery runs offline:
  `cd packages/route-compiler && npm install --no-workspaces &&
  npx tsc --noEmit && npx vitest run`.
