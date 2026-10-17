# PaySwap 3.0 Economic Execution Graph — Contract Document

Status: FROZEN FOR IMPLEMENTATION (P3-W2)
Package: `@payswap/execution-graph` (`packages/execution-graph/`)
Authority owner: the Economic plane (spec/architecture/PAYSWAP-3.0.md; the
graph is the canonical typed, versioned representation the economic lane
projects execution through)
Work order: P3-W2 (spec/dependency/work-orders.md)
Canonical architecture: spec/architecture/ECONOMIC-EXECUTION-GRAPH.md (the
authority for this package)
Evidence: docs/execution-graph-evidence/BASELINE-VERIFICATION-RECORD.md

This document is the contract law of the economic execution graph. The
package is the implementation; where code and this document disagree, that
is a defect (either fix the code or file an ADR — never silently diverge).

## 1. Position in the architecture

The Economic Execution Graph (EEG) is the canonical typed, versioned
representation of a proposed or authorized multi-step economic plan:

```
Goal -> Intent -> Candidate Graphs -> Eligibility/Policy -> Strategy/Organization
     -> Authorization PROJECTION -> Execution -> Observation/Finality
     -> Reconciliation/Evidence
```

It owns: EXECUTION ATTEMPTS (idempotent, retry-safe, evidence-preserving,
observation-pinned), OFFERS (derived, never fabricated), PLANS (ordered
capability steps realizing a compiled economic demand), the AUTHORIZATION
PROJECTION of protocol-owned authorization against material execution
terms, RECONCILIATION of ambiguous external effects within its own attempt
ledger, the STRATEGY MODEL (strategies answer WHAT), and the DIRECTOR
ADVISORY SEAM (deterministic controls + replaceable learned components).

It does NOT own: real authorization (the financial protocol lane + trust
lane own it — this package projects and reconciles, never authorizes — the
package's identity law), obligations/clearing/settlement (financial
protocol lane), observations themselves (capability lane owns the fabric;
the graph preserves them losslessly), route compilation/scoring (P5-W1),
the payment plane (P5-W3), Lab promotion machinery (P6).

### Layer law

`MODULE-OWNERSHIP.yaml` layer `economic` — `may_depend_on: [contracts]`;
`must_not_depend_on: [ui, model-runtime, provider-sdk]`. P3-W2 pins the
package as a RUNTIME LEAF: **zero runtime dependencies**. The accepted
sibling pins are TYPE-ONLY (erased at runtime, resolved at typecheck time
via tsconfig paths — the accepted P1/P2 integration pattern):

- `@payswap/economic` — CandidateSkeleton lineage references,
  VersionedEconomicInput (the LAW 1 quote pin);
- `@payswap/protocol` — PrincipalRef, TimestampMs, Money, AuthorizationRef,
  EvidenceNodeKind (wire shapes only);
- `@payswap/capability` — CapabilityObservation, ProviderStateEnvelope,
  ExecutionMode, ConnectedCapabilityInstance, ProviderCatalogueEntry,
  CompensationPolicy, PartialExecutionPolicy.

`@payswap/trust` appears ONLY in tsconfig `paths` for transitive type
resolution (the protocol and capability lanes import it type-only); it is
never imported by this package's src. Machine-checked by
test/boundary.test.ts.

## 2. The three encoded laws (the review's core tests)

### LAW 1 — observation-version preservation (lossless)

"Preserve quote/route/provider observation versions (lossless — the
capability fabric's observations are evidence; the graph must keep the
exact version it decided on)." Enforced by:

- `ObservationVersionLedger` (src/observation-versions.ts): append-only
  per-instance history; strictly monotonic versions; `atVersion` retrieves
  the EXACT recorded version verbatim with digest re-verification (a
  digest mismatch is corruption, never a fresher observation);
- `ObservationVersionPin` on every decision: attempts (frozen at `begin`,
  included in the idempotency command hash), offers (observation +
  corridor-projection + quote versions), plan steps (each step pins the
  instance's observation version; the pin must belong to the step's
  instance), search selections and search candidates;
- canonical citations: INV-03 (historical facts immutable + versioned),
  INV-07 (observations are evidence, not custody), INV-14 (provider state
  preserved).

### LAW 2 — authorization-projection invalidation on material term change

"Invalidate affected authorization PROJECTION when material execution terms
change (the financial protocol layer owns real authorization; this package
projects/reconciles, never authorizes)." Enforced by:

- `MaterialExecutionTerms` + the closed axis vocabulary (ROUTE,
  DESTINATION, ASSET, AMOUNT, RISK, CAPABILITY_OBSERVATIONS, QUOTE —
  src/material-terms-contract.ts), each axis digested canonically;
  deterministic diff + affects-matching (src/material-terms.ts);
- `AuthorizationProjectionIndex` (src/projection.ts): `projectAuthorization`
  RECORDS a projection of a protocol-owned authorization (opaque
  AuthorizationRef) against material terms — `canAuthorizeFinancialEffects`
  is the STRUCTURAL LITERAL `false`; `verify` is fail-closed at an explicit
  instant (UNKNOWN_PROJECTION / EXPIRED / INVALIDATED /
  REQUEST_HASH_MISMATCH / OBSERVATION_PIN_MISMATCH / TERMS_CHANGED /
  INSTANCE_NOT_IN_SCOPE / MODE_NOT_IN_SCOPE); `invalidateAffectedProjections`
  is LAW 2 — an invalidated projection is TERMINAL and can never verify
  CURRENT again (a refreshed authorization is a NEW projection with a NEW
  id);
- the plan's mandatory `authorizationProjection` reference (every mode,
  PASS_THROUGH_NATIVE included — no mode bypasses the boundary);
- adapter attenuation keeps the literal `canWriteFinancialState: false`;
- canonical citations: INV-05 (authorization lineage), INV-04 (UNKNOWN
  discipline), INV-03 (terminality of invalidation).

### LAW 3 — Director/strategy advisory-only

"Strategies answer WHAT (settle-now, batch, net-later...); the Director is
deterministic controls + replaceable learned components — advisory only,
never an authority." Enforced by:

- the strategy model (src/strategy-contract.ts + src/strategy.ts): a
  closed WHAT-vocabulary (SETTLE_NOW | BATCH | NET_LATER | HOLD_FOR_REVIEW)
  with typed parameters; every directive carries the STRUCTURAL LITERAL
  `advisoryOnly: true`; every advisory carries `authoritative: false`;
- the Director advisory control (src/director.ts): deterministic resolvers
  over the search index + the replaceable plug-in seam, deterministic
  evaluation (simulation x evaluator x robustness), non-authoritative
  reasoning annotations, and ZERO mutating methods over graph state (the
  advisory method surface is machine-checked);
- simulation is namespaced (INV-11): `PAYSWAP_EXECUTION_GRAPH_SIMULATION`
  brand on every result; no exported conversion to any production-evidence
  type;
- canonical citations: INV-09 (agents/LLMs/Lab/simulations cannot declare
  financial truth), INV-10 (discovery output cannot directly authorize),
  INV-11 (simulation is never production authority).

## 3. Module map

| Module | Law | Role |
| --- | --- | --- |
| `errors.ts` | — | local error taxonomy (category mirrors of the protocol kernel) |
| `identifiers.ts` | — | branded ids; PrincipalRef/TimestampMs wire pins |
| `canonical.ts` | — | canonical JSON, FNV-1a 64, deepFreeze, strict ISO stamps |
| `execution-modes.ts` | — | the pinned execution-mode vocabulary (capability-lane mirror) |
| `observation-version-contract.ts` / `observation-versions.ts` | LAW 1 | the version pin + the lossless append-only ledger |
| `material-terms-contract.ts` / `material-terms.ts` | LAW 2 | material axes, digests, diff, affects-matching |
| `projection-contract.ts` / `projection.ts` / `projection-validation.ts` | LAW 2 | the authorization projection index |
| `attempt-contract.ts` / `attempts.ts` / `attempt-ledger.ts` | LAW 1 | execution attempts (INV-03/04/05/06/14) |
| `offer-contract.ts` / `offers.ts` | LAW 1 | derived offers (never fabricated) + off-network ingestion |
| `plan-contract.ts` / `plans.ts` | LAW 1/2 | execution plans + derived profiles |
| `reconciliation-contract.ts` / `reconciliation.ts` | — | execution-ambiguity reconciliation (INV-04) |
| `strategy-contract.ts` / `strategy.ts` | LAW 3 | the strategy model |
| `simulation-contract.ts` / `simulation-support.ts` / `simulation.ts` | LAW 3 | the deterministic namespaced simulator |
| `evaluation-contract.ts` / `evaluator.ts` / `robustness.ts` | LAW 3 | hard constraints before optimization; robustness |
| `search-contract.ts` / `search.ts` / `search-plugins.ts` | LAW 1/3 | executable grounding (INV-13) + replaceable optimizers |
| `director-contract.ts` / `director.ts` | LAW 3 | the Director advisory seam |
| `kernel.ts` | — | local deterministic state machine + idempotency registrar |

## 4. Boundary discipline

- Zero runtime dependencies; devDependencies are exactly typescript +
  vitest (machine-checked).
- No `node:` imports in src/ (machine-checked); test infrastructure uses
  the package-local ambient shim (test/node.d.ts) with `process.cwd`
  declared as a FUNCTION global, exactly once.
- Determinism: no randomness, ambient clock, timers, network or filesystem
  in src/ (machine-checked); every time question is answered at an
  explicitly supplied instant; timestamps are DATA.
- File law: every src file <= 400 lines; no TS enum; no TS namespace.
- The package NEVER authorizes: no obligation/clearing/settlement call
  surfaces exist (machine-checked by the boundary scan); reconciliation
  resolves execution ambiguity only.

## 5. Deferrals and future wiring (honest register)

- The corridor-eligibility view consumed by offer derivation is the
  capability lane's discovery projection passed BY VALUE (a versioned
  view); direct typed consumption of the corridor projection is TL
  integration work.
- Route compilation (P5-W1) will supply the selected capability chains the
  offer/plan surfaces carry as pinned inputs.
- The payment plane (P5-W3) will own the rich external settlement
  destination types; this package pins the minimal external shape.
- Durable persistence for the ledgers/indexes (observation versions,
  attempts, projections) is deferred exactly as the protocol lane's
  persistence adapters are (see spec/protocol/FINANCIAL-PROTOCOL.md).
- The Lab (P6-W1) owns candidates/promotion/replay/scenarios; the Director
  here is deliberately the advisory seam only.
