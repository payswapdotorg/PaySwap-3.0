# P3-W2 Baseline Verification Record — Economic Execution Graph

Work order: P3-W2 (spec/dependency/work-orders.md) — "Economic Execution
Graph, strategy model and Director integration. Preserve quote/route/
provider observation versions and invalidate affected authorization when
material execution terms change."
Package: `@payswap/execution-graph` (`packages/execution-graph/`)
Branch: `work/r1-w2`, base `main @ 2999bbb1658443b72ce9644f32cabbebdbecaa37`
Authority: spec/architecture/ECONOMIC-EXECUTION-GRAPH.md; contract document
spec/execution-graph/EXECUTION-GRAPH.md.
Old-repo evidence: payswap.org@8a735bf `packages/execution` (src: attempts/
authorization/offers/plans/reconciliation; 41 tests) and the
Director-relevant half of `packages/lab` (search 18, simulation 21,
director 11, evaluator 9 = 59 tests).

## 1. Battery receipts (exact commands, exit codes, counts)

CI-faithful battery, run from `packages/execution-graph` on the final
state (commit 4/4), node v24.21.0:

```
$ rm -rf node_modules package-lock.json
$ npm install --no-workspaces
  (exit 0; devDependencies resolved: typescript@6.0.3 + vitest@3.2.7 only)
$ npx tsc --noEmit
  (exit 0; 0 diagnostics; strict + exactOptionalPropertyTypes)
$ npx vitest run
  Test Files  14 passed (14)
       Tests  141 passed (141)
  (exit 0)
```

Every intermediate commit re-verified in isolation (fresh worktree + fresh
`npm install --no-workspaces` + tsc + vitest):

| Commit | tsc | vitest |
| --- | --- | --- |
| `da83bc6` 1/4 pinned wire shapes | 0 diagnostics | 1 file / 5 tests PASS |
| `cbc5f1c` 2/4 implementation | 0 diagnostics | 1 file / 5 tests PASS |
| `daca6f8` 3/4 test suite | 0 diagnostics | 14 files / 141 tests PASS |
| 4/4 spec + evidence | 0 diagnostics | 14 files / 141 tests PASS |

Package shape: 35 src files (all <= 400 lines; largest 396), 18 test files
(14 vitest-runnable + fixtures + type-utils + node.d.ts). devDependencies
are exactly `{ typescript: ^6.0.3, vitest: ^3.2.7 }`; zero runtime
dependencies (machine-checked by test/boundary.test.ts).

## 2. Test classification — old 100 -> new 141 (0 dropped, 0 weakened)

Old evidence total: 100 tests (execution 41 + lab Director-relevant 59).
New total: 141 tests. Classification per old FILE (port = same law, same
assertions, new package; adapt = same law, re-grounded on accepted 3.0
contracts; net-new = demanded by the 3.0 laws):

### Old execution package (41 tests)

| Old file (n) | New file | Classification | Notes |
| --- | --- | --- | --- |
| attempts (9) | attempts.test.ts (9) | ADAPTED (9) | Same 9 laws/assertions. Evidence kinds follow the 3.0 protocol taxonomy (old EXECUTION -> PAYOUT; WEBHOOK_EVENT/STATE_OBSERVATION -> OBSERVATION). Every attempt pins its observation version (LAW 1) — the command hash includes the pin, and test 9 asserts the pin stays frozen. The local kernel mirrors the old protocol-kernel errors. |
| authorization (4) | projection.test.ts (8) | ADAPTED (4) + NET-NEW (4) | Grant AUTHORITY -> projection INDEX (the 3.0 identity law: never authorizes). Ported: issue->project with lineage, fail-closed verify (all five old reasons preserved: UNKNOWN/EXPIRED/HASH_MISMATCH/INSTANCE_NOT_IN_SCOPE/MODE_NOT_IN_SCOPE), approval lineage (cannot outlive/diverge; party check), adapter attenuation (type-level not-assignable + runtime rejection of canWriteFinancialState:true). Net-new: LAW 2 diff detection, terminal invalidation, observation-pin staleness seam, re-projection discipline. |
| boundary (5) | boundary.test.ts (7) | ADAPTED (5) + NET-NEW (2) | Ported: non-empty src tree, import discipline, no parallel vocabularies/authority-plane internals, determinism guards. Adapted to the hermetic battery: 3 TYPE-ONLY sibling pins replace the old workspace-dependency check. Net-new: <=400-line + no-enum/namespace + exact-devDeps checks, and the NEVER-AUTHORIZES scan (no obligation/clearing/settlement call names in src). |
| offers (6) | offers.test.ts (8) | ADAPTED (6) + NET-NEW (2) | Ported: derivation with rail path, no-fabrication rejections (acceptance -> corridor-eligibility view: NOT_ELIGIBLE/UNKNOWN are typed rejections), two-axis UNKNOWN never success, INV-13 unauthorized/ineligible/under-permitted instances, off-network ingestion (attributedToPaySwap: false; the @payswap/payment dependency is P5-W3 and is re-grounded on a local OffNetworkExecutionRecord), actionable customer-action states (INV-14). Net-new: LAW 1 version pins (observation + corridor + quote), mode/capability/lineage mismatch rejections. |
| plans (10) | plans.test.ts (11) | ADAPTED (10) + NET-NEW (1) | Ported: valid plan + remittance/destination preservation, explicit mode + mandatory authorization link (protocolAuthorization -> authorizationProjection ref; degenerate windows rejected), catalogue-entry-never-a-step (INV-13), unauthorized/ineligible/under-permitted instances, PASS_THROUGH_NATIVE exactly-one-incumbent-step law (+ mismatched incumbent rejected), OPTIMIZED_MULTI_PROVIDER >= 2 steps, INV-15 native-baseline step, compensation/partial profiles (3.0 CompensationPolicy/PartialExecutionPolicy shapes; conservative one-non-partial-step-makes-it-atomic check added), remittance preservation. The old capability-modes declaration check moved to offers (where declaredExecutionModes live in 3.0). Net-new: economic lineage + optional strategy-directive lineage. |
| reconciliation (7) | reconciliation.test.ts (7) | ADAPTED (7) | Same 7 laws/assertions: UNKNOWN never FAILED, classification without flattening, reconciliation is the authority, no-evidence rejection, retryRequiresReconciliation, cases only for ambiguous attempts, refund/dispute reuse of the SAME machinery (+ LAW 1 pin assertions). |
| **41** | | **ADAPTED 41** | **0 dropped, 0 weakened** |

### Old lab package, Director-relevant (59 tests)

| Old file (n) | New file | Classification | Notes |
| --- | --- | --- | --- |
| search (18) | search.test.ts (19) | ADAPTED (18) + NET-NEW (1) | Ported: catalogue-never-executable (INV-13), no-observation not executable, ACTIVE+healthy executable, LATEST version wins, authorization/eligibility/currency/geography scoping, UNREACHABLE/UNKNOWN surfacing (two-axis), AXES_INCONSISTENT flagged UNKNOWN, UNAVAILABLE definitely rejected, incumbent-baseline flag on/off, deterministic-baseline plug-in (all three modes; incumbent single-rail), deterministic search, hand-designed latency-first plug-in, custom plug-in registration+run, unknown plug-in rejection. Adapted: the 3.0 index is instance-grounded (definitions list replaced by instances; the "definition without instance" test re-grounded as instance+catalogue-match). Net-new: LAW 1 pin on executable blocks. |
| simulation (21) | simulation.test.ts (21) | PORTED (21) | Byte-for-byte the old assertions (determinism, digest sensitivity to seed/version, input immutability + frozen results, empty scenario, namespace brand + guard, exact fees, netting internalization, FX spread, FX volatility, outage fallback, liquidity/credit, delayed-write UNKNOWN, approval-delay USER_ACTION_REQUIRED, partial settlement, adversarial taxonomy, bypass/privacy metrics). Program type renamed SimulationProgram -> StrategyProgram (the 3.0 strategy model). |
| director (11) | director.test.ts (12) | ADAPTED (10) + NOT PORTED (1) + NET-NEW (2 in-file) | Ported: resolveCapability grounding (INV-13; catalogue-only empty), resolveStrategy over executable blocks, resolveOrganization -> NOT PORTED (old lab candidates registry, P6 territory per work order), resolveMechanism -> NOT PORTED (old lab domain-packs, P6), selectCandidates/inspectCandidate -> re-grounded as deterministic resolvers (resolveCapability/resolveStrategy determinism checks), triggerEvaluation determinism, recordEvaluationEvidence -> re-grounded as issueAdvisory (advisory + evaluation envelope), rejects unknown candidates -> re-grounded as fail-closed no-scenario/no-world rejections, LLM annotations (2 tests: structurally non-authoritative + mutates nothing). The promotion-ledger test is NOT PORTED (P6 territory, per work order). Net-new: the machine-checked advisory-only method surface, the director-module import boundary, structurally-distinct advisory outputs. |
| evaluator (9) | evaluator.test.ts (9) | ADAPTED (9) | Same 9 laws/assertions (phases tuple, hard-constraint disqualification despite a better score, determinism, exact bigint aggregate, EXPLICIT_CREDIT, DEADLINE, robustness accumulation, one-failing-run, determinism). Adaptations: the old baseline-suite program constants re-grounded on an equivalent world/programs; robustness accumulation now REJECTS foreign programs (a deliberate strengthening — robustness is per-program), so the mixed pass/fail test uses one program with per-scenario constraint outcomes. |
| **59** | | **PORTED 21 + ADAPTED 38** | **1 test NOT PORTED (promotion ledger — P6 territory, by work order); replaced by 2 net-new advisory-law tests** |

### Net-new (41 tests, demanded by the 3.0 laws)

| New file | n | Law |
| --- | --- | --- |
| observation-versions.test.ts | 8 | LAW 1 (lossless ledger, monotonicity, fail-closed shapes, verbatim preservation, per-instance histories) |
| strategy.test.ts | 8 | LAW 3 (WHAT-vocabulary, deterministic resolver mapping, advisory literals, fail-closed validation) |
| encoded-laws.test.ts | 9 | All three laws as machine-checked boundary tests (the review's core tests) |
| smoke.test.ts | 5 | Pinned vocabularies (terminal states, evidence taxonomy, material axes, directive kinds, mode vocabulary, namespace) |
| folded into attempts/plans/offers/projection/director | 11 | LAW 1 pin assertions, LAW 2 linkage, advisory-law checks |

Total: 41 adapted (execution) + 21 ported + 38 adapted (lab) + 41 net-new
+ 1 not-ported-by-order (promotion) = 141 tests. **0 dropped (except the
work-order-forbidden promotion test, replaced by stronger advisory-law
tests), 0 weakened.**

## 3. Per-file adaptation receipts (old src -> new src)

| Old (payswap.org@8a735bf) | New (this package) | Receipt |
| --- | --- | --- |
| execution/src/attempts.ts (827 lines) | attempt-contract.ts + attempts.ts + attempt-ledger.ts (+ kernel.ts) | Split to honor the <=400-line file law. Idempotency + state machine re-implemented in the local kernel (the old runtime import of @payswap/protocol is impossible under the TYPE-ONLY pin law); behavior is a mirror of the accepted protocol kernel. LAW 1: pinnedObservation added to the record, the begin input, and the command hash. |
| execution/src/authorization.ts (508) | projection-contract.ts + projection.ts + projection-validation.ts | RE-AUTHORIZATION: the old ExecutionGrantAuthority ISSUED grants; the 3.0 identity law forbids that — the AuthorizationProjectionIndex RECORDS projections of protocol-owned authorization against material terms and invalidates them on material change (LAW 2). Approval artifacts (old INV-A03) become the approval-artifact LINEAGE (same outlive/diverge/party laws). Adapter attenuation preserved verbatim (canWriteFinancialState literal false). CommandEnvelope dependency dropped (P1-W2 wire: the opaque AuthorizationRef). |
| execution/src/offers.ts (346) | offer-contract.ts + offers.ts | @payswap/payment (acceptance policy + translation + off-network records) does not exist at this base (P5-W3): the acceptance axis is re-grounded on the corridor-eligibility view (capability lane P2-W1), the rail path on the pinned selectedCapabilityChain, the off-network record on a local minimal shape (attributedToPaySwap: false preserved). LAW 1: observation/corridor/quote version pins. |
| execution/src/plans.ts (480) | plan-contract.ts + plans.ts | MerchantSettlementDestination (payment plane) -> minimal ExternalSettlementDestination; protocolAuthorization -> the authorization-projection reference; every step pins its observation version (LAW 1); compensation/partial profiles re-derived from the 3.0 CompensationPolicy/PartialExecutionPolicy shapes. |
| execution/src/reconciliation.ts (308) | reconciliation-contract.ts + reconciliation.ts | Near-verbatim port; classification + cases + resolutions unchanged; the "identity law" comment sharpened (execution ambiguity only — no obligation/clearing/settlement calls). |
| lab/src/search.ts (600) | search-contract.ts + search.ts + search-plugins.ts | Index re-grounded on 3.0 instances (INV-13 catalogue/instance separation preserved via catalogue-entry rejections); incumbent baseline detection re-grounded on the instance configuration surface (nativeRoutingBaseline — the old nativeOptimization declaration field does not exist on 3.0 instances); selections/blocks carry LAW 1 pins; the simulatedRailId binding convention preserved. |
| lab/src/simulation.ts (886) | simulation-contract.ts + simulation-support.ts + simulation.ts | Split to honor the file law. Engine behavior byte-for-byte (same PRNG, same economics, same incident taxonomy, same outcome taxonomy); the namespace is rebranded PAYSWAP_EXECUTION_GRAPH_SIMULATION; the program type is the StrategyProgram. |
| lab/src/evaluator.ts (433) | evaluation-contract.ts + evaluator.ts + robustness.ts | Same phase-tuple law, same constraint/objective vocabularies, same penalties; robustness accumulation strengthened (rejects foreign programs). |
| lab/src/director.ts (396) | director-contract.ts + director.ts | The candidate registry + promotion ledger (P6) are NOT ported (work order); the Director is the ADVISORY seam: resolvers + evaluation + issueAdvisory + reasoning annotations, zero graph-mutating methods (machine-checked). |

## 4. Decision records

1. **Authorization -> projection (identity law).** The work order's law
   overrides the old module's semantics. Every naming choice points one
   way: `projectAuthorization` (never issue), `canAuthorizeFinancialEffects:
   false` structural literal, INVALIDATED terminality, adapter attenuation
   unchanged. The boundary test additionally scans src for
   obligation/clearing/settlement call names (the identity law,
   machine-checked).
2. **Local kernel instead of a protocol import.** The TYPE-ONLY pin law
   forbids runtime imports from siblings; the attempt ledger needs a state
   machine + idempotency registrar. The local kernel is a behavioral
   mirror of the protocol kernel's accepted battery semantics (same error
   categories, same BEGIN/REPLAY/CONFLICT table, same terminality law).
   Divergence would be a finding at TL integration.
3. **Evidence-kind taxonomy.** Old EXECUTION/WEBHOOK_EVENT/
   STATE_OBSERVATION kinds are re-grounded on the 3.0 protocol taxonomy
   (FUNDING/CONVERSION/PAYOUT/OBSERVATION/FINALITY/RECONCILIATION/
   AUTHORIZATION) per the protocol lane's documented old->new mapping.
4. **Instance-grounded search index.** The old index enumerated
   CapabilityDefinitions + catalogue entries; the 3.0 fabric makes the
   ConnectedCapabilityInstance the executable object (INV-13), so the
   index enumerates instances (+ catalogue entries for rejection
   explanations). The old "definition without an instance" test is
   re-grounded accordingly.
5. **QUOTE as a material axis.** The work order preserves "quote" versions
   (LAW 1); carrying the quote refs into the MATERIAL TERM axes closes the
   loop — a quote change is a material change that invalidates projections
   (LAW 2 seam).

## 5. Determinism receipts

- Boundary scan (test/boundary.test.ts): no Math.random, no crypto
  randomness, no Date.now/new Date, no performance.now, no setTimeout/
  setInterval, no fetch, no node: imports, no process.env in src/**.
- Every time question (`now`, `detectedAt`, `expiresAt`, ...) is an
  explicitly supplied bigint TimestampMs or a DATA timestamp string
  (strict ISO-8601 UTC).
- The simulator's only entropy is the caller-seeded splitmix64 PRNG; same
  (scenario, world, program, seed) -> deep-equal results (tested).
- Digest discipline: canonical JSON (sorted keys, bigint-aware) + FNV-1a
  64 everywhere; digests are binding, not security.
- Tests use only relative imports + vitest (hermetic battery; no sibling
  runtime imports possible).

## 6. Invariant mapping (canonical ids -> enforcement evidence)

| Canonical invariant | Enforcement in this package |
| --- | --- |
| INV-03 (facts immutable, versioned) | attempt history/evidence append-only; observation ledger monotonic; invalidation terminal; resolutions immutable (attempts.test.ts, observation-versions.test.ts, projection.test.ts, reconciliation.test.ts) |
| INV-04 (UNKNOWN != FAILED) | attempt lifecycle OUTCOME_UNKNOWN first-class; reconciliation the only exit; UNKNOWN never blindly retried; simulator delayed-write taxonomy (attempts, reconciliation, simulation tests) |
| INV-05 (authorization + evidence lineage) | projections carry the opaque protocol AuthorizationRef; evidence gating on external effects; ledger-stamped evidence links (attempts, projection, reconciliation tests) |
| INV-06 (idempotent, replay-safe) | attempt ledger BEGIN/REPLAY/CONFLICT; FAILED re-arms; result hashes (attempts tests) |
| INV-07 (observations, not custody) | observations are pinned evidence; balances never claimed (observation-versions, search tests) |
| INV-09/10/11 (advisory-only) | strategy directives/advisories/reports/annotations carry structural non-authoritative literals; simulation namespace; Director method surface machine-checked (strategy, director, encoded-laws tests) |
| INV-13 (catalogue != executable) | catalogue entries never yield executable blocks; plan steps require genuinely connected instances (search, plans tests) |
| INV-14 (provider state preserved) | ProviderStateEnvelope carried verbatim on attempts/evidence; customer-action states actionable (attempts, offers, reconciliation tests) |
| INV-15 (native baseline candidate) | PASS_THROUGH_NATIVE never structurally disadvantaged; incumbent baseline blocks flagged without ranking (plans, search tests) |

## 7. Limitations (honest register)

- In-memory reference implementations (observation ledger, attempt ledger,
  projection index, reconciliation authority): the class shapes are the
  contracts; durable persistence is deferred (same posture as the protocol
  lane's persistence adapters).
- The corridor-eligibility view is passed by value; direct typed
  consumption of the capability lane's corridor projection is TL
  integration work.
- Route compilation (P5-W1) is future work; offers/plans carry the
  selected capability chain as a pinned input.
- The promotion/registry half of the old Director is P6 (Lab) territory
  and intentionally absent.
- The material-term axis vocabulary (7 axes) is closed at this commit; a
  future axis is an additive contract change (format-version bump + spec
  update + ADR if it alters the laws).

## 8. Reproduction

```
cd packages/execution-graph
rm -rf node_modules package-lock.json
npm install --no-workspaces
npx tsc --noEmit        # expect: 0 diagnostics
npx vitest run          # expect: 14 files / 141 tests, all PASS
```
