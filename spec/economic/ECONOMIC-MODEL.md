# PaySwap 3.0 Economic Model Contract

Package: `@payswap/economic` (`packages/economic/`) — Work Order P1-W1.
Layer: `economic` (MODULE-OWNERSHIP.yaml: may_depend_on `[contracts]`; must_not_depend_on `ui, model-runtime, provider-sdk`). Authored as a self-contained leaf: zero runtime dependencies, zero non-relative imports in `src/**`, zero `@payswap/*` imports (parallel-lane self-containment; the TL wires integration after acceptance).

Status: COMPLETE for P1-W1 scope. Everything here is **ADVISORY DEMAND ONLY** — it establishes no authorization (trust lane, P1-W3) and no financial finality (protocol lane, P1-W2). Types carry opaque LINEAGE REFERENCES for that wiring, never the authority itself (INV-05).

## 1. Type inventory

### 1.1 AmountSpec (pinned cross-lane wire shape)

```ts
interface AmountSpec {
  readonly currency: string;   // /^[A-Z]{3}$/ — fiat ISO-style AND onchain symbols share the shape
  readonly minorUnits: string; // /^(0|[1-9][0-9]*)$/ — canonical non-negative decimal integer string
}
```

- **Pin discipline**: identical in all three Phase-1 lanes. The authoritative wire TYPE lives in `packages/trust/src/amount-spec.ts` (P1-W3, accepted); this package declares the shape **structurally** because lane self-containment forbids the import while lanes are in flight. Duplicate-type risk is accepted and reconciled by the TL at integration (dependency direction stays financial → trust, never reversed).
- **Single-owner law (INV-01)**: this package owns the wire SHAPE and structural validation ONLY. NO money arithmetic (add/scale/compare) is exported from `@payswap/economic` — exact-integer money semantics are exclusively the financial protocol lane (P1-W2). The only amount relation enforced here is the degenerate-value rejection `minorUnits !== "0"` for value transfers (ported old law).

### 1.2 IntentArchetype + intents

- `IntentArchetype` — closed vocabulary `MONEY_MOVEMENT | PAYMENT | SERVICE_ACCESS`. `archetypeSatisfies(offered, required)`: PAYMENT is a type-level specialization of MONEY_MOVEMENT (a payment satisfies a money-movement demand; the reverse is false).
- `FundsLocationRef` — `{ locationRef, currency, observationRef }`: an opaque, **observation-grounded** reference to an external funds location. A reference — never a balance, never custody (INV-7). Rail/provider meaning lives in the observation plane (capability lane, P2-W1).
- `MoneyMovementIntent` — 10 canonical fields: `intentId, principalRef, origin: FundsLocationRef, destination: FundsLocationRef, originAmount: AmountSpec (positive, currency = origin.currency), arrivalCurrency (= destination.currency), constraints, intentAuthorizationRef, declaredAt, expiresAt`. **Rail/provider-neutral ADAPT** of the old `packages/route-compiler/src/intent.ts` (MMI-02): no rail or provider identifiers, no execution/routing semantics (HOW the demand is satisfied is P5-W1 output, never intent content). Same locationRef MAY be origin and destination (an in-place conversion is a legitimate demand).
- `PaymentIntent` — **type-level specialization ONLY**: `MoneyMovementIntent` + `commerceRef` (opaque commerce lineage). No payment-method machinery (P5-W3). A commerceRef-carrying object FAILS the bare movement validator (fail-closed split) and passes only `validatePaymentIntent` (exact 11-field key set).
- `ServiceAccessIntent` — 8 fields + optional `maxCost` (wire shape only; comparison semantics are financial-lane). Carries NO funding machinery — funding is a separate movement demand (credential isolation, old SERVICE-CAPABILITIES.md law). Net-new code for a spec-only old concept.
- `IntentConstraints` — `{ maxSettlementMs (positive), maxRouteHops (integer in [1, 8]) }` — bounded structural constraints; an unbounded hop count is never authorized (ported old law).

### 1.3 EconomicGoal (NET-NEW per GAP-01)

Outcome-first, human/agent-legible root demand. 12 canonical fields:

| Field | Law |
| --- | --- |
| `goalId`, `principalRef`, `authorizationRef` | non-empty bounded opaque refs; authorizationRef is LINEAGE ONLY |
| `objective` | bounded (≤ 4096 chars) legible outcome statement |
| `allowedArchetypes` | non-empty, closed vocabulary, duplicate-free |
| `outcomes` | ordered (installment order is semantic), 1..8 typed demands; each outcome kind must satisfy an allowed archetype |
| `constraints` | `IntentConstraints` (propagated to every compiled intent) |
| `timeBounds` | `{ declaredAt, deadlineAt }`, strictly increasing, caller-supplied instants |
| `recourse` | `{ requiresReversibility, minDisputeWindowMs, policyStatement }` — a reversibility demand must be explained (legibility cross-law) |
| `proofs` | non-empty, closed kind vocabulary (`SETTLEMENT_FINALITY, DELIVERY_CONFIRMATION, RECEIPT, RECOURSE_ARTIFACT`), no duplicate kinds |
| `nonGoals` | declared NON-goals (≤ 16, duplicate-free), carried canonically into skeletons |
| `economicInputs` | versioned economic inputs (see 1.5) |

`GoalOutcome` — discriminated union: `MONEY_MOVEMENT { demand: MoneyMovementDemand }`, `PAYMENT { demand, commerceRef }`, `SERVICE_ACCESS { demand: ServiceAccessDemand }`. `MoneyMovementDemand = { origin, destination, originAmount (positive, currency matches origin) }`; `ServiceAccessDemand = { serviceRef, beneficiaryRef, maxCost? }`.

### 1.4 EconomicProgram (recurring/parameterized envelope)

`{ programId, goalTemplate: EconomicGoal, recurrence?, parameters }`. Recurrence `{ anchorAt, intervalMs, occurrences (1..64), occurrenceWindowMs }` — all instants caller-supplied; derived occurrence instants must stay safe integers (rejected, never clamped). Parameters are prose-field substitutions (`${name}` in objective/nonGoals only — structured fields are NEVER text-substituted); every placeholder must be declared; no escaping mechanism in v1. `expandEconomicProgram` is a pure deterministic function producing re-validated goals (a substitution that would break a goal law rejects the expansion).

### 1.5 VersionedEconomicInput (the versioned-inputs law)

`{ kind, version, sourceRef, content }` — the ONLY way quote or corridor details may enter goals/constraints:

- `kind` — closed vocabulary `QUOTE | CORRIDOR | FX_RATE | MARKET_DATA | OTHER`;
- `version` — positive integer pinning the content's schema/semantics;
- `sourceRef` — opaque observation-lineage reference (quotes/corridor details are provider observations);
- `content` — CANONICAL JSON object text (recursively sorted keys, byte-stable), verified by parse + re-serialize round-trip. Never implicit ambient state; never establishing authorization or financial finality; freshness/eligibility gating is downstream.

### 1.6 Candidate skeletons (versioned, forward-compatible — NOT the EEG)

`CandidateSkeleton` (12 fields): `formatVersion` (= 1, bump = supersession), `skeletonId` (content-derived, invariant across compile instants), `goalId`, `intentRef`, `archetype`, `authorizationRef`, `constraints` (propagated), `nodes`, `edges`, `nonGoals` (sorted), `economicInputs` (sorted), `digest` (covers skeleton + realized intent content + compiledAt + compiler version).

- Movement demand graph: `VALUE_ORIGIN → VALUE_MOVEMENT → VALUE_DESTINATION` with `VALUE_FROM`/`VALUE_TO` edges. Service demand graph: single `SERVICE_PROVISION` node, no edges. Node kinds/edges are rail-agnostic demand roles — NO rail, provider, venue or capability identity (routing/scoring/best-execution are P5-W1).
- **NOT the Economic Execution Graph** (P3-W2 owns the EEG formalism: capability references, observations, policy/security verdicts, freshness, idempotency, finality, recourse semantics). The skeleton is deliberately minimal so `formatVersion` can be superseded without reinterpretation.
- Ids are FNV-1a 64 digests of canonical JSON content (`cand:`, `cnode:`, `cedge:` prefixes). FNV-1a is NOT cryptographic; the compiler fail-closes on any derived-id collision and never trusts the digest.

## 2. Validation law (fail-closed, deterministic)

Every exported type has a fail-closed validator: `validateAmountSpec`, `validatePositiveAmountSpec`, `isValidAmountSpec`, `validateMoneyMovementIntent`, `validateServiceAccessIntent`, `validatePaymentIntent`, `validateIntentConstraints`, `validateFundsLocationRef`, `validateGoalTimeBounds`, `validateRecourseRequirements`, `validateProofRequirement(s)`, `validateMoneyMovementDemand`, `validateServiceAccessDemand`, `validateGoalOutcome`, `validateEconomicGoal`, `validateRecurrenceRule`, `validateEconomicProgram`, `validateEconomicInput(s)`.

Laws (ported from the old intent discipline and extended):

1. **Never repair, never guess, never default** — validators throw or return the validated value FROZEN (deep-frozen).
2. **Unknown fields rejected** — every type has an exact canonical key set (sorted comparison). This structurally excludes secret material (INV-19: no secret-shaped field can smuggle onto a closed shape; refs are opaque identifiers, not secret values).
3. **Closed vocabularies** — archetypes, outcome kinds, proof kinds, input kinds, node/edge kinds: unknown values are rejected.
4. **Same input → same verdict** — pure functions; zero side effects; zero clock, network, filesystem or random access. All instants are caller-supplied.
5. **Error taxonomy** — local `InvalidEconomicModelError` base with per-type subclasses (`InvalidAmountSpecError`, `InvalidMoneyMovementIntentError`, `InvalidServiceAccessIntentError`, `InvalidPaymentIntentError`, `InvalidEconomicGoalError`, `InvalidEconomicProgramError`, `InvalidEconomicInputError`, `InvalidEconomicCompilationError`); messages carry field paths (`MoneyMovementIntent.originAmount currency 'USC' must match…`). The old taxonomy imported `@payswap/protocol.ValidationError` — re-declared locally (lane self-containment); the TL reconciles at integration.
6. Bounded strings everywhere (refs ≤ 512, objective ≤ 4096, content ≤ 16384, …; see `src/validate.ts` `LIMITS`).

## 3. Determinism law (compilation)

`compileEconomicGoal({ goal, compiledAt })` and `compileEconomicProgram({ program, compiledAt })` are pure functions of their inputs:

1. **Same goal + same compile instant → byte-identical result** (deep-equal AND stable JSON serialization; the repeated-compile property test compiles 10× and compares bytes).
2. **Stable content-derived ids** — `skeletonId`, `nodeId`, `edgeId` are FNV-1a digests of canonical (sorted-key) JSON; a changed demand (amount, location, currency, window) is a different candidate. The digest includes `compiledAt` + `compilerVersion` — different compile instants are different compilations (never an ambient clock); `skeletonId` is instant-invariant.
3. **Canonical input ordering** — permutation invariance over the SET-like fields (`allowedArchetypes`, `nonGoals`, `economicInputs`, program parameters); skeletons emit `nonGoals`/`economicInputs` sorted. The ORDERED outcome list is deliberately non-invariant (installment order is semantic — documented).
4. **Fail-closed compilation** — non-integer/negative compile instants refused; an expired goal (`compiledAt >= deadlineAt`) compiles NOTHING; every derived intent is re-validated through the canonical validators; duplicate derived ids throw (internal invariant).
5. **Compiler pinning** — every result carries `COMPILER_VERSION` (`payswap-economic-compiler/1`); historical intents pin the compiler that created them (old spec law).
6. **Lineage propagation** — principal, authorization ref, constraints and time bounds propagate goal → intent; goal + intent lineage propagate into skeletons (refs only).

## 4. Out-of-scope boundaries (do not grow this package into them)

| Concern | Owner |
| --- | --- |
| Exact money semantics/arithmetic, AmountSpec→Money bridge | P1-W2 financial protocol (`packages/protocol`) |
| Authoritative AmountSpec wire TYPE | P1-W3 trust (`packages/trust`); this package holds a TL-reconciled structural pin |
| Authorization, mandates, policy verdicts | P1-W3 trust lane |
| Financial finality, settlement, reconciliation | P1-W2 protocol lane |
| Rail/provider observation planes, ProviderStateEnvelope | P2 capability lane |
| Economic Execution Graph formalism | P3-W2 |
| Rail-aware routing, scoring, best execution, mixed-rail route compilation | P5-W1 |
| Payment-method machinery (PaymentMethod, offers, translation, attempts) | P5-W3 |
| FinancialOpportunity | P6-W2 |
| Persistence/storage | out of scope (adapters deferred program-wide) |

## 5. Known limitations (honest register)

1. Parameter substitution applies to PROSE fields only (objective, nonGoals) — structured fields (amounts, refs, constraints, recurrence) cannot be parameterized in v1; no `${` escaping mechanism exists (any residual `${` after substitution is rejected fail-closed).
2. Recurrence is a fixed bounded interval rule (occurrences ≤ 64, all instants derived by integer arithmetic from the caller-supplied anchor) — calendar semantics (e.g. "last Friday of the month") and open-ended series are deliberately out of scope; recurring programs carry no program-level expiry in v1.
3. `skeletonId` digests use non-cryptographic FNV-1a 64 — collision-checked fail-closed by the compiler, but not suitable as an external security identity.
4. The goal/intent `authorizationRef` lineage slot is opaque and uninterpreted here: at demand stage it references a trust-plane DEMAND registration; the trust lane owns what it ultimately resolves to.
5. Node/edge kinds are a minimal demand-graph vocabulary; EEG supersession (P3-W2) may extend or replace it via `formatVersion` bump.
