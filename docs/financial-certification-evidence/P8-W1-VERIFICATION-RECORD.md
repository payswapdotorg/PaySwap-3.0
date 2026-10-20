# @payswap/financial-certification — P8-W1 Verification Record (lane p8-w1)

Rebuild lane p8-w1. Branch `work/p8-w1`; base `f9392a3`
(= origin/main at dispatch — the TL closing report tip; 26/26
implementation+governance work orders complete, P8 frontier open).
Porting source (evidence, not authority): payswap.org @
`8a735bf1639198c43115087a2992555166a9acf9` — the assigned slice of
packages/certification + packages/journeys (39 files, listed below).

Package: `packages/financial-certification` —
`@payswap/financial-certification` v0.1.0. Src 22 files / 3,504 lines
(within the ~1,500–3,500 envelope); test 18 files / ~3,300 lines;
16 test files / 134 tests ALL PASS. Spec:
spec/financial-certification/FINANCIAL-CERTIFICATION.md.

---

## 1. Commits (the 4-commit protocol, linear, no merges)

| # | Subject | SHA |
|---|--------|-----|
| 1/4 | package skeleton + core conformance model (manifest/tsconfig/vitest per the house pattern; FNV-1a digest substrate; the 9 hard laws + 8 scenario families registry; the derived-pass conformance verdict; the 6 sibling wire-shape pins) | `9dff0af` |
| 2/4 | the six law verifiers + the uniform gate wall + suites/records/promotion (…the literal-true uniform requirements + always-throwing waiver; versioned suites; digest-chained records; escalate-only promotion ledger with irreversible halts; GAP-02 live-corridor limitation surface) | `c49a60c` |
| 3/4 | the full test battery (16f/134t ALL PASS) — per-law dedicated classes for all nine hard laws … the end-to-end corridor matrix … the adapted boundary guard with census receipts (src 22f/3,504l; test 18f) | `fe44622` |
| 4/4 | spec + evidence (this record + the lane specification) | (see `git log -1`) |

## 2. Battery receipts (hermetic, recorded at 4/4)

| Command | Result |
|---------|--------|
| `cd packages/financial-certification && npm install --no-workspaces --no-audit --no-fund` | **exit 0** |
| `npx tsc --noEmit` | **exit 0 (0 diagnostics)** |
| `npx vitest run` | **16 test files / 134 tests, ALL PASS** (~3.5s, fully offline, deterministic) |

Per-file test counts (sum = 134): boundary 10, event-ordering 9,
records 9, corridor-conformance 4, promotion 7, gate-wall 11, suites
12, quote-honesty 11, idempotency 9, ambiguous-outcome 9,
leg-separation 10, late-events 10, smoke 5, pins 8, digest 6,
live-corridor 4.

Census (machine-checked by test/boundary.test.ts): src 22 files /
3,504 lines (max file 336 `src/suites.ts`); test 18 files /
~3,300 lines (max file 376 `test/fixtures.ts`); every file <= 400
lines. Old-repo envelope context: certification default suite 13f/154t
+ journeys 15f/90t (whole packages; my slice is a subset) — this
rebuild targets the focused suite (>= 45 tests; every hard law covered
by >= 1 dedicated test class).

## 3. Claims -> machine-pinned test sites

| Claim (hard law) | Test site(s) |
|------------------|--------------|
| FIN-LAW-01 quote honesty (inertness AT the boundary; inclusive staleness; material change on all 5 axes; INDICATIVE never grounds; digest binding; born-expired unrepresentable) | test/quote-honesty.test.ts (11) + test/corridor-conformance.test.ts |
| FIN-LAW-02 endpoint idempotency (recorded outcome; no second effect; typed conflict; distinct keys distinct intents; namespaced derivation; UNKNOWN-then-CONFIRMED under one key) | test/idempotency.test.ts (9) |
| FIN-LAW-03 funding/payout separation (no fused leg/grant; separately observed/reconciled; no cross-leg shortcut; no hidden custody) | test/leg-separation.test.ts (10) |
| FIN-LAW-04 event ordering (duplicate harmless; no regression; 24-permutation + derived + supplied order-independence proofs; total order; same-revision conflicts surfaced) | test/event-ordering.test.ts (9) |
| FIN-LAW-05 ambiguous timeout -> UNKNOWN (structural UNKNOWN-only classifier; external-evidence-only closure; phantom resolutions; honest openness) | test/ambiguous-outcome.test.ts (9) |
| FIN-LAW-06 late events (re-open, never silently absorbed; prior-digest lineage; impossible ordering fails closed; pinned surface stages) | test/late-events.test.ts (10) |
| FIN-LAW-07 gate wall (uniform across corridor/provider/route — identical checks + wall digest; incumbent gated identically; unexercised law fails; literal-true requirements fail closed on downgrade; waiver ALWAYS throws; irreversible halts + remediation-only clearing) | test/gate-wall.test.ts (11) + test/promotion.test.ts (7) + test/corridor-conformance.test.ts |
| FIN-LAW-08 evidence lineage (byte-deterministic records; digest chain; tamper + splice detection; append-only ids; no evidence-less records) | test/records.test.ts (9) + test/digest.test.ts (6) |
| FIN-LAW-09 no live-corridor claim (frozen GAP-02 limitation; forbidden kinds exact + marker scan; record-boundary rejection; honest hermetic marker) | test/live-corridor.test.ts (4) + records/gate-wall rejection sites |
| Uniform default suites + honest NOT_APPLICABLE + append-only registry | test/suites.test.ts (12) |
| Sibling pin truth tables (inclusive staleness; expiry AT boundary; cross-multiplication; namespaced derivation; epoch staleness; vocabularies) | test/pins.test.ts (8) |
| End-to-end matrix (verifiers -> wall -> suite -> chained record -> promotion; non-conforming corridor HALTS; unchanged for provider/route kinds) | test/corridor-conformance.test.ts (4) |
| Boundary laws (relative-only imports; no @payswap; no node: in src; determinism; no provider vocabulary; no execution machinery; manifest; no paths; node.d.ts once; <= 400 lines; census; secret-free) | test/boundary.test.ts (10) |
| Core model (law registry order; derived pass; digest determinism) | test/smoke.test.ts (5) |

## 4. Oracle accounting (every file in the assigned slice dispositioned)

Slice = 39 files. PORTED 0 / ADAPTED 19 / REWRITTEN 7 /
SUPERSEDED-BY-SIBLING 13 / NET-NEW 0 -> **19 + 7 + 13 = 39 = 39**.
(PORT never authorizes copying; every ADAPTED/REWRITTEN file was
reauthored on the canonical architecture — zero copied code.)

### 4a. packages/certification/src (5 files)

| File (old) | Disposition | Where in the rebuild |
|------------|-------------|----------------------|
| suites.ts | ADAPTED | src/suites.ts + src/laws.ts — suite parameterization by component kind reauthored (strategy/organization/agent_package/connector -> corridor/provider/route); evidence-kind/gate vocabulary reauthored to the 8 scenario families + 7 uniform gates; append-only versioned registry law preserved |
| uniform-gates.ts | ADAPTED | src/gate-wall.ts — the wall pattern preserved: decision input structurally omits the attribution fields (executionMode+isIncumbentBaseline -> componentKind+isIncumbentBaseline), literal-true requirements, fail-closed runtime guard, incumbent gated identically; the 3 gates reauthored as the 7 financial gates |
| replay-fault.ts | REWRITTEN | src/ambiguous-outcome.ts + src/event-ordering.ts — the fault->expected-behavior contracts reauthored as the ambiguity-discipline verifier (PROVIDER_OUTAGE->UNKNOWN, external-evidence-only closure) and the deterministic order-independent fold; the deterministic re-run digest discipline became the reconciled-digest order-independence proof |
| promotion.ts | ADAPTED | src/promotion.ts (+ the chain in src/records.ts) — security/certification-first irreversible halts, remediation-only clearing on a NEW order, append-only history, per-version promotion, verifiable-records-only |
| digest.ts | ADAPTED | src/digest.ts — the house canonical-serialization + FNV-1a 64 pattern, reauthored locally (the same deliberately-local pattern every sibling certification-era package uses) |

### 4b. packages/certification/src/production (5 files)

| File (old) | Disposition | Where in the rebuild |
|------------|-------------|----------------------|
| contract.ts | REWRITTEN | the no-simulated-success + recompute-the-verdict doctrine lives in the whole pipeline; the certification-pipeline contract (verdicts -> wall -> suite -> record -> promotion) is the reauthored form of the journey contract (the A–I through-real-kernels form is not rebuildable hermetically at this layer) |
| gates.ts | SUPERSEDED-BY-SIBLING | the seventeen security-gate checks are the P8-W2 security/client certification lane's material; the uniform-GATE discipline they used is reauthored in src/gate-wall.ts |
| matrix.ts | ADAPTED | src/suites.ts (evaluateFinancialSuite) — verdicts DERIVED from submitted evidence, never asserted; the area matrix became the scenario/gate matrix with honest NOT_APPLICABLE accounting |
| world.ts | REWRITTEN | test/fixtures.ts — the deterministic-world doctrine (fixed clocks, caller-declared instants, synthetic-only seams, no secrets) became the runtime-assembled synthetic corridor fixtures; the kernel-composition doubles are not needed at the artifact-verification layer |
| index.ts | SUPERSEDED-BY-SIBLING | the production-certification barrel is split across the W1 financial and W2 security lanes; this package's barrel is src/index.ts |

### 4c. packages/certification/src/production/journeys (10 files)

| File (old) | Disposition | Where in the rebuild |
|------------|-------------|----------------------|
| a-simple-payment.ts | REWRITTEN | test/corridor-conformance.test.ts — a simple corridor payment certifying through the full pipeline |
| b-dex-optimization.ts | SUPERSEDED-BY-SIBLING | onchain dex domain — the rebuilt onchain lanes + W2/W3 |
| c-crypto-to-fiat.ts | ADAPTED | the fiat-corridor conversion discipline -> quote-honesty + leg-separation + the payout-stage pin |
| d-merchant-crypto-payment.ts | SUPERSEDED-BY-SIBLING | merchant checkout is P5-W3-rebuilt (reference only per the work order) |
| e-mixed-execution.ts | SUPERSEDED-BY-SIBLING | mixed onchain/fiat execution composition — the route-compiler lane owns it |
| f-security-attack.ts | SUPERSEDED-BY-SIBLING | the adversarial/security domain — W2 |
| g-agent-opportunity.ts | SUPERSEDED-BY-SIBLING | opportunities rebuilt (P6-W2) |
| h-state-change.ts | ADAPTED | the state-change/reconciliation discipline -> event-ordering + late-events |
| i-reorg-unknown.ts | ADAPTED | the canonical reorg->UNKNOWN->reconciliation law -> src/ambiguous-outcome.ts |
| index.ts | SUPERSEDED-BY-SIBLING | barrel (split across lanes) |

### 4d. packages/journeys/src/conformance (9 files)

| File (old) | Disposition | Where in the rebuild |
|------------|-------------|----------------------|
| model.ts | ADAPTED | src/laws.ts — the scenario vocabulary + applicability honesty (13 lifecycle scenarios -> the 8 financial families; the fixed epoch/no-RNG determinism doctrine) |
| gates.ts | ADAPTED | src/gate-wall.ts (EVIDENCE_LINEAGE + the per-law checks) — shared gates for every provider -> uniform gates for every kind; the secret-hygiene byte-scan -> the live-claim scan |
| profile.ts | REWRITTEN | the submitted-artifact model — RecordedEndpointDispatch / CertifiedLegObservation / CertifiedProviderEvent / dossiers (the corridor "profile" is the artifact dossier shape; provider profiles themselves are W2's client-certification material) |
| profile-support.ts | SUPERSEDED-BY-SIBLING | execution authority/SDK call contexts — the provider-runtime lane owns execution |
| profiles-stripe.ts | SUPERSEDED-BY-SIBLING | per-provider profile law is W2's lane; this lane is provider-NEUTRAL by the boundary law |
| profiles-paystack.ts | SUPERSEDED-BY-SIBLING | same |
| profiles-flutterwave.ts | SUPERSEDED-BY-SIBLING | same |
| runner.ts | ADAPTED | test/corridor-conformance.test.ts + src/suites.ts — the matrix runner + roll-ups + honest NOT_APPLICABLE accounting |
| scenarios.ts | REWRITTEN | the six per-law verifier modules — the 13 scripted lifecycle scenarios reauthored as deterministic law verifiers over submitted artifacts |

### 4e. packages/journeys/src/journeys (10 files; merchant-checkout reference-only)

| File (old) | Disposition | Where in the rebuild |
|------------|-------------|----------------------|
| credit.ts | ADAPTED | the pay-in-advance funds-flow discipline -> src/leg-separation.ts (the funding leg) |
| cross-border.ts | ADAPTED | the rail/quote material-change + two-leg discipline -> src/quote-honesty.ts + src/leg-separation.ts |
| external-funds.ts | ADAPTED | the external-funds/no-custody observation law -> the external-destination check in src/leg-separation.ts |
| incentive-liquidity.ts | SUPERSEDED-BY-SIBLING | opportunities rebuilt (P6-W2) |
| multi-provider-fallback.ts | REWRITTEN | the multi-provider event fold + fallback discipline -> src/event-ordering.ts |
| p2p.ts | ADAPTED | the two-sided transfer -> the certified leg pair |
| payroll-batch.ts | ADAPTED | the batch-dispatch discipline -> src/idempotency.ts (many keys, distinct intents) |
| psp-incumbent.ts | ADAPTED | the incumbent-baseline-gated-identically law -> the isIncumbentBaseline attribution-only field in src/gate-wall.ts |
| recurring-mandate.ts | ADAPTED | the mandate/authorization-lineage discipline -> the pinned trust lineage every leg must carry |
| refund-dispute.ts | ADAPTED | the recourse-immutability + separate-obligation law -> src/late-events.ts |

### 4f. The rebuild's own origins (22 src files; 7 ADAPTED + 6 REWRITTEN + 9 NET-NEW = 22)

digest.ts <- old digest.ts (ADAPTED); errors.ts <- the old packages'
typed error classes (ADAPTED, consolidated); gate-wall.ts <-
uniform-gates.ts + psp-incumbent (ADAPTED); suites.ts <- certification
suites.ts + production matrix.ts (ADAPTED); records.ts <- promotion.ts
digest-lineage (ADAPTED); promotion.ts <- promotion.ts (ADAPTED);
index.ts <- the barrel pattern (ADAPTED); quote-honesty.ts <-
cross-border + the quote laws (REWRITTEN); idempotency.ts <-
payroll-batch + the DUPLICATE_SUBMISSION scenario (REWRITTEN);
leg-separation.ts <- credit + external-funds + p2p (REWRITTEN);
event-ordering.ts <- the conformance event scenarios +
multi-provider-fallback (REWRITTEN); ambiguous-outcome.ts <-
replay-fault + i-reorg-unknown (REWRITTEN); late-events.ts <-
refund-dispute (REWRITTEN); laws.ts, live-corridor.ts and the 7
pins/*.ts files are NET-NEW (the 9-law registry, the GAP-02 limitation
surface and the pins discipline did not exist in the old repository —
the old packages imported siblings directly).

## 5. Explicit limitations (the honest-UNKNOWN law)

1. **Live corridors are NOT certified (GAP-02).** Live-corridor
   certification is credential-gated (real provider credentials +
   operator authorization) and OUT OF SCOPE by law. This package
   certifies hermetic, deterministic, contract-level conformance over
   submitted artifacts and SYNTHETIC fixtures. No live provider is
   contacted, no financial effect is simulated, no provider balance is
   synthesized, and no live-certification claim is made or accepted
   (the frozen `LIVE_CORRIDOR_LIMITATION` fact; LAW-9 enforcement at
   three boundaries). Never interpret a PASS here as live readiness.
2. **Promotion artifacts are contracts, not deployments.** Ordering a
   promotion appends a versioned, digested artifact; applying it to
   production traffic is a protocol-authority operation outside this
   package. Nothing here mutates financial state.
3. **Certification-gate/evidence authority only — not financial
   truth.** Money semantics, mandates, quotes and provider outcome
   vocabularies stay pinned to their owning lanes' wire shapes
   (structural pins; the TL wires the authoritative imports at
   integration). This package verifies artifacts that CARRY those
   shapes; it never re-derives them.
4. **The suite evaluates what the subject submits.** The verifiers
   prove the laws over the submitted dispatch logs, event sets, leg
   pairs, dossiers and probes. The completeness of a subject's
   submission (that its artifacts faithfully describe its
   implementation) is the submitting integrator's responsibility —
   the certification proves the LAWS hold of the artifacts, and the
   wall refuses any law left unexercised.
5. **Digests are content addresses, not cryptography.** FNV-1a 64
   detects structural change (tamper-evident chaining); it is not a
   cryptographic defense (the house pattern, unchanged).

## 6. Write surface (this lane wrote NOTHING else)

- `packages/financial-certification/**` — 40 files (22 src + 18 test)
- `spec/financial-certification/FINANCIAL-CERTIFICATION.md` — 1 file
- `docs/financial-certification-evidence/P8-W1-VERIFICATION-RECORD.md` — this file

No root files, no sibling packages, no CI, no lockfile (the TL wires
MODULE-OWNERSHIP + the CI lane at integration — single-writer law).
