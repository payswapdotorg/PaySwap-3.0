# P1-W1 Baseline Verification Record — @payswap/economic

Work Order: P1-W1 (economic model: EconomicGoal, intents, deterministic validation, candidate compilation).
Branch: `work/p1-w1` (base `85c8e2f`, origin/main of payswapdotorg/PaySwap-3.0).
Old-repo reference: `payswapdotorg/payswap.org` @ `8a735bf1639198c43115087a2992555166a9acf9` (evidence, never authority — architecture wins).

## 1. What was ADAPTED/PORTED (with receipts)

| New artifact | Old-repo source (payswap.org@8a735bf) | Classification | What was kept / changed |
| --- | --- | --- | --- |
| `src/intent.ts` MoneyMovementIntent (285 lines) | `packages/route-compiler/src/intent.ts` (351 lines; MMI-02 PORT) | ADAPT | KEPT: executable-value-transfer-demand concept; fail-closed validator discipline (field-path errors, frozen returns, exact-key laws); positive-amount law; `maxRouteHops` ∈ [1,8] bounded-hops law; `expiresAt > declaredAt` window law; authorization-ref-as-opaque-lineage; observation-grounded origins/destinations as references-not-balances; no-secret-material via closed key sets. CHANGED: rail/provider-identifying origin/destination vocabulary (ONCHAIN_WALLET / EXTERNAL_PROVIDER_ACCOUNT / BANK_ACCOUNT / ONCHAIN_RECIPIENT / STRIPE_MERCHANT_BALANCE; chainKey / providerName / stripeAccountRef / assetId fields) REPLACED by the neutral `FundsLocationRef { locationRef, currency, observationRef }` (work-order law, INV-16); imports of `@payswap/protocol` (ValidationError) and `@payswap/trust` (AmountSpec) and `@payswap/onchain-domain` (isValidChainKey) REPLACED by local declarations (lane self-containment); bare timing fields grouped into `constraints`; `intentAuthorizationRef` re-documented as a demand-registration lineage slot (advisory-stage reinterpretation, since goals precede authorization in the new canonical path). |
| `test/intent.test.ts` (17 tests, 313 lines) | `packages/route-compiler/test/intent.test.ts` (326 lines) | PORT/ADAPT | Law-for-law port of the fail-closed suite: null/undefined/non-object rejection; empty identity fields; unknown origin kinds → unknown-FIELDS neutrality tests (the old rail-specific kind/chainKey/assetId tests are superseded by structural-neutrality assertions that the OLD shapes are REJECTED); zero-amount; amount/origin currency match; arrival/destination match; maxRouteHops bounds; expiry window; frozen + exact-key-set acceptance; no-balance/custody-state serialization audit. Net-new: same-location origin/destination acceptance (in-place conversion), `archetypeSatisfies` law. |
| `test/determinism.test.ts` (11 tests, 182 lines) | `packages/route-compiler/test/determinism.test.ts` (138 lines) | PORT/ADAPT | Ported discipline: repeated-compile deep-equal + digest equality (strengthened to BYTE-identical JSON); ids as pure functions of content; permutation invariance (over set-like goal fields, the analogue of the old observation-input permutation); canonical emission order; different-compile-instant → different digest; non-integer/negative instants refused; expired demand compiles nothing; changed demand → different compilation. NOT ported (P5-W1 material): walk determinism, venue-pack/observation-permutation specifics, `compiledAt` in compilation digest is kept but plan/leg id shapes became skeleton/node/edge content digests. |
| `test/fixtures.ts` (266 lines) | `packages/route-compiler/test/fixtures.ts` (953 lines) | DISCIPLINE PORT | Kept: fixed-constant discipline (NOW = Date.parse of a fixed ISO instant), no clock/randomness, fixture intent builders mirroring the old route-1..4 intent roles (movement, payment, service). NOT ported: all rail-specific machinery (Uniswap venue packs, pool states, PSP activations, Stripe eligibility evidence, best-execution policies, onchain security fixtures — the route-1-*/leg material owned by P5-W1/P5-W3 per MMI-19). |
| AmountSpec structural pin (`src/amount-spec.ts`, 101 lines) | `packages/route-compiler/src/intent.ts` (the old wrap of trust's `validateAmountSpec`); canonical pin now at `packages/trust/src/amount-spec.ts` (P1-W3, accepted) | ADAPT | Byte-identical pin: interface declaration + `/^[A-Z]{3}$/` + `/^(0|[1-9][0-9]*)$/`. Local structural declaration with unknown-field rejection (stricter inbound posture, same wire shape). NO money arithmetic (INV-01). |
| Error taxonomy (`src/errors.ts`, 88 lines) | old `InvalidMoneyMovementIntentError extends ValidationError` (`@payswap/protocol`) | ADAPT | Same fail-closed behavior; local re-declaration because the protocol import is forbidden in flight (TL reconciles at integration). |
| Boundary/leaf law (`test/boundary.test.ts`, 6 tests) | `packages/trust/test/boundary.test.ts` (P1-W3 pattern, itself adapted from the old repo's scanner) | PORT | Same scanner: zero runtime deps, devDeps exactly typescript+vitest, src/** relative-only imports, no @payswap/* imports, all files ≤ 400 lines. |
| `test/node.d.ts` | `packages/trust/test/node.d.ts` | PORT | Verbatim ambient declarations for the boundary scanner's node builtins. |

## 2. What is NET-NEW and why

| Artifact | Why net-new |
| --- | --- |
| `EconomicGoal` (`src/goal.ts`, `src/goal-outcome.ts`, `src/recourse.ts`) | **GAP-01 / MMI-01 (classification REWRITE)**: verified by P0-W3 that the old repository has NO EconomicGoal implementation and NO tests — spec text only (`spec/architecture/DOMAIN-MODEL.md` §intent, `FROZEN-ARCHITECTURE.md` §1, `docs/FINAL-TL-HANDOFF-2026-09-30.md`). Authored from the old spec language as concept reference under the new architecture: outcome-first legible objective, allowed-archetype gate, typed ordered outcomes, constraints, time bounds, recourse/proof requirements, declared NON-goals, versioned economic inputs, authorization LINEAGE ref (never authority). |
| `EconomicProgram` + expansion (`src/program.ts`) | Old repo had the name in spec lists only (DOMAIN-MODEL.md, WORK-OPERATING-PLANE.md "EconomicProgram and WorkProgram can reference each other"); no implementation existed. Net-new recurring/parameterized envelope with deterministic bounded expansion. |
| `ServiceAccessIntent` (`src/service-intent.ts`) | Old repo: spec only (FROZEN-ARCHITECTURE.md §6, SERVICE-CAPABILITIES.md). Net-new code porting the fail-closed discipline; funding/service credential isolation preserved from the old spec language. |
| `PaymentIntent` (`src/payment-intent.ts`) | New law from the work order: type-level specialization of MoneyMovementIntent ONLY (+ commerceRef), no payment-method machinery (P5-W3). The old merchant-crypto PaymentIntent state machine is NOT ported (different concept, merchant lane). |
| `IntentArchetype` + `archetypeSatisfies` | No old implementation; net-new closed taxonomy with the PAYMENT ⊂ MONEY_MOVEMENT specialization law. |
| `VersionedEconomicInput` (`src/versioned-input.ts`) | Net-new law from the work order: quote/corridor details entering goals must be typed-version-envelope + explicit canonical-JSON content, never ambient state, never authorization/finality. |
| Candidate skeletons + compiler (`src/candidate.ts`, `src/compiler.ts`) | Net-new deterministic candidate compilation (goal → validated intent set → versioned demand-graph skeletons). NOT the EEG (P3-W2); no routing/scoring (P5-W1). Determinism discipline ported (see §1); canonical-JSON/FNV-1a digest machinery (`src/digest.ts`) net-new with published test vectors. |
| `test/goal.test.ts` (15), `test/program.test.ts` (10), `test/versioned-input.test.ts` (8), `test/compiler.test.ts` (12), `test/service-payment-intent.test.ts` (9), `test/digest.test.ts` (8), `test/amount-spec.test.ts` (8), `test/smoke.test.ts` (1) | Net-new coverage for net-new contracts (74 tests); discipline ported from the old suites. |

## 3. Battery receipts (exact commands, exit codes, counts)

Environment: node v24.21.0, npm 11.19.0. Run from `packages/economic/`:

| # | Command | Result |
| --- | --- | --- |
| B1 | `npm install --no-workspaces` | exit 0 (warning only: esbuild postinstall script notice — toolchain, not runtime) |
| B2 | `npx tsc --noEmit` | exit 0 — 0 diagnostics (strict + exactOptionalPropertyTypes + verbatimModuleSyntax + noUncheckedIndexedAccess, extending ../../tsconfig.base.json) |
| B3 | `npx vitest run` | exit 0 — **105/105 tests PASS in 11 files** (amount-spec 8, digest 8, intent 17, service-payment-intent 9, goal 15, program 10, versioned-input 8, compiler 12, determinism 11, boundary 6, smoke 1) |
| B4 | `node -e "const m = await import('./src/index.ts')" --input-type=module` | PASS — node native TS import, 58 exports (41 functions: 20 validators + compiler + digest helpers; 9 error classes; closed-vocabulary constants) |
| B5 | line-count law | PASS — max file 331 lines (`src/compiler.ts`); all 27 package files ≤ 400 (enforced by `test/boundary.test.ts`) |
| B6 | `node tools/architecture-governance/check-invariants.mjs` (repo root) | PASS — 0 failures |
| B7 | `node tools/architecture-governance/check-module-ownership.mjs` (repo root) | **expected state**: 4 ERRORs — 1 × R1-unmapped-package `packages/economic` (the TL maps this package's layer at acceptance; MODULE-OWNERSHIP.yaml is outside this lane's write surface) + 3 pre-existing R6 (V-52..54, documented in the TL handoff, not this lane's) |

Determinism evidence: the repeated-compile property test (10 consecutive compilations byte-identical) and the compile-twice deep-equal + digest-equality tests across all four fixture goals PASS (test/determinism.test.ts). Permutation invariance over set-like fields PASS. Different-instant → different-digest PASS. Expired-goal and unsafe-instant fail-closed PASS.

## 4. Honest deviations & limitations (findings register)

1. **[Medium] Authorization-lineage slot semantics.** The old MoneyMovementIntent REQUIRED a non-empty `intentAuthorizationRef` interpreted as the trust-plane authorization artifact root. In the new canonical path (goal → intent → eligibility → policy → authorization), demand-stage artifacts precede authorization, so v1 reinterprets the required non-empty ref as an opaque DEMAND-REGISTRATION lineage slot (goal.`authorizationRef` propagated to intents). Fail-closed non-emptiness is preserved; the TRUST lane owns what the ref ultimately resolves to. The TL should confirm this reading with P1-W3 at integration.
2. **[Medium] Candidate skeleton is deliberately minimal.** Nodes/edges carry only rail-agnostic roles + intent lineage — no capability refs, no observations, no policy verdicts, no idempotency/finality semantics (EEG, P3-W2). A `formatVersion` bump supersedes. Consumers must not treat skeletons as executable plans.
3. **[Low] Parameter substitution is prose-only and unescaped** (any residual `${` rejects; structured fields cannot be parameterized in v1). Recorded in spec/economic/ECONOMIC-MODEL.md §5.
4. **[Low] Recurrence is a fixed bounded interval rule** (≤ 64 occurrences, integer arithmetic from a caller-supplied anchor; no calendar semantics, no open-ended series, no program-level expiry in v1).
5. **[Low] Non-cryptographic ids.** FNV-1a 64 digests with fail-closed collision rejection; not a security identity.
6. **[Info] Error taxonomy re-declared locally** (old: `@payswap/protocol.ValidationError` base). Behavior preserved; TL reconciles at integration.
7. **[Info] Outcomes are an ORDERED list** — permutation invariance deliberately does NOT apply to outcome order (installment order is semantic), unlike the old compiler's unordered observation inputs. Documented in the determinism tests.

## 5. Write-surface compliance

Touched paths (this lane only): `packages/economic/**` (27 files), `spec/economic/ECONOMIC-MODEL.md`, `docs/economic-evidence/BASELINE-VERIFICATION-RECORD.md`. No other path modified (verified by `git diff --stat 85c8e2f..HEAD` before patch generation). `packages/trust`, `packages/protocol`, `spec/architecture/**`, `MODULE-OWNERSHIP.yaml`, root manifests: read-only, untouched.
