/**
 * @payswap/execution-graph — the Economic Execution Graph package (P3-W2).
 *
 * The canonical typed, versioned representation of proposed or authorized
 * multi-step economic execution:
 *   Goal -> Intent -> Candidate Graphs -> Eligibility/Policy ->
 *   Strategy/Organization -> Authorization PROJECTION -> Execution ->
 *   Observation/Finality -> Reconciliation/Evidence.
 *
 * THE THREE ENCODED LAWS (work order P3-W2; the review's core tests):
 * 1. OBSERVATION-VERSION PRESERVATION — quote/route/provider observation
 *    versions are preserved losslessly; the graph keeps the exact version it
 *    decided on (src/observation-version-contract.ts + the ledger).
 * 2. AUTHORIZATION-PROJECTION INVALIDATION — affected authorization
 *    PROJECTION is invalidated when material execution terms change. The
 *    financial protocol layer owns real authorization; this package
 *    projects/reconciles, NEVER authorizes (src/projection-contract.ts,
 *    src/material-terms-contract.ts).
 * 3. DIRECTOR/STRATEGY ADVISORY-ONLY — strategies answer WHAT; the Director
 *    is deterministic controls + replaceable learned components; every
 *    strategy artifact is structurally advisory (src/strategy-contract.ts,
 *    src/director-contract.ts).
 *
 * LAYER LAW (MODULE-OWNERSHIP.yaml layer `economic`): may_depend_on
 * [contracts]; must_not_depend_on [ui, model-runtime, provider-sdk]. As an
 * authoring discipline this package is a LEAF: zero runtime dependencies,
 * and the ONLY sibling imports are TYPE-ONLY pins resolved at typecheck
 * time via tsconfig paths (the accepted P1/P2 integration pattern):
 * - @payswap/economic — CandidateSkeleton lineage, VersionedEconomicInput
 *   (quote version pins);
 * - @payswap/protocol — PrincipalRef, TimestampMs, Money, AuthorizationRef,
 *   EvidenceNodeKind (wire shapes);
 * - @payswap/capability — CapabilityObservation, ProviderStateEnvelope,
 *   ExecutionMode, ConnectedCapabilityInstance, CompensationPolicy.
 * @payswap/trust appears ONLY in tsconfig paths for transitive type
 * resolution (the protocol and capability lanes import it type-only); it is
 * never imported by this package's src.
 *
 * Machine-checked by test/boundary.test.ts.
 */

export const PACKAGE_NAME = '@payswap/execution-graph' as const;

// Deterministic backbone: errors, identifiers, canonical digests.
export * from './errors.ts';
export * from './identifiers.ts';
export * from './canonical.ts';

// The pinned execution-mode vocabulary (owned by the capability lane).
export * from './execution-modes.ts';

// ENCODED LAW 1 — observation-version preservation (lossless).
export * from './observation-version-contract.ts';

// ENCODED LAW 2 — material execution terms + authorization projection.
export * from './material-terms-contract.ts';
export * from './projection-contract.ts';

// The graph: attempts, offers, plans, reconciliation.
export * from './attempt-contract.ts';
export * from './offer-contract.ts';
export * from './plan-contract.ts';
export * from './reconciliation-contract.ts';

// ENCODED LAW 3 — the strategy model + the Director ADVISORY seam.
export * from './strategy-contract.ts';
export * from './simulation-contract.ts';
export * from './evaluation-contract.ts';
export * from './search-contract.ts';
export * from './director-contract.ts';

// The deterministic kernel (local state machine + idempotency registrar).
export * from './kernel.ts';

// Implementation: the graph with the three encoded laws explicit in code.
// LAW 1 — lossless observation-version preservation.
export * from './observation-versions.ts';
// LAW 2 — material terms + authorization projection (never authorizes).
export * from './material-terms.ts';
export * from './projection.ts';
export * from './projection-validation.ts';
// The graph surfaces: attempts, offers, plans, reconciliation.
export * from './attempts.ts';
export * from './attempt-ledger.ts';
export * from './offers.ts';
export * from './plans.ts';
export * from './reconciliation.ts';
// LAW 3 — the strategy model + simulation/evaluation/search + Director.
export * from './strategy.ts';
export * from './simulation-support.ts';
export * from './simulation.ts';
export * from './evaluator.ts';
export * from './robustness.ts';
export * from './search.ts';
export * from './search-plugins.ts';
export * from './director.ts';
