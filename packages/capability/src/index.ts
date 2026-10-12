/**
 * @payswap/capability — the Capability and Network Authority's contract
 * package for PaySwap 3.0 (Work Order P2-W1).
 *
 * The canonical capability fabric:
 *   CapabilityDefinition -> ProviderImplementation ->
 *   ConnectedCapabilityInstance -> CapabilityObservation,
 * plus ProviderStateEnvelope (lossless consequential provider-state
 * preservation, INV-14), the explicit versioned execution-mode vocabulary
 * (PASS_THROUGH_NATIVE | COMPOSED_PAYSWAP | OPTIMIZED_MULTI_PROVIDER,
 * INV-15), the fourteen-part executable capability declaration law
 * (CAPABILITY-MODEL), hierarchical connector capability packs, the
 * append-only certification ledger, and the corridor-aware eligibility
 * DISCOVERY PROJECTION (deterministic, versioned, exclusion-reasoned,
 * evidence-not-authorization).
 *
 * LAYER LAW (MODULE-OWNERSHIP.yaml layer `capability`:
 * may_depend_on [contracts, trust]): zero runtime dependencies. The ONE
 * accepted sibling import is TYPE-ONLY (AmountSpec and proof types from
 * @payswap/trust, the wire authority), erased at runtime and resolved at
 * typecheck time via tsconfig paths — the accepted P1 integration pattern.
 * Machine-checked by test/boundary.test.ts.
 *
 * LAWS (canonical citations): catalogue data never authorizes an effect
 * (INV-13); observations are evidence, not authorization (INV-7/INV-4
 * discipline); provider state is preserved where needed for
 * action/reconciliation/audit (INV-14); provider-native execution remains a
 * candidate baseline (INV-15); provider implementations do not leak into
 * provider-neutral domain contracts (INV-16); no secret ever enters model
 * context or ordinary artifacts (INV-19 — credential references only).
 *
 * NOT exported from this index (deliberately): the internal canonical
 * helpers (src/canonical.ts, src/shared.ts) — law-enforcement internals
 * (timestamp parsing, minor-unit ordering, deep freeze), never a public
 * API.
 */

export const PACKAGE_NAME = '@payswap/capability' as const;

// Domain error taxonomy.
export * from './errors.ts';

// Branded identifiers + version-string law.
export * from './identifiers.ts';

// Two-axis availability model (state + source availability).
export * from './availability.ts';

// Layer 1 — CapabilityDefinition (catalogue; executable 14-part law).
export * from './capability-definition.ts';
export * from './definition-validation.ts';

// The fourteen-part executable capability declaration (+ validation).
export * from './executable-declaration.ts';
export * from './executable-declaration-validation.ts';

// Layer 2 — ProviderImplementation (+ provider identities, corridor scopes).
export * from './provider-implementation.ts';

// Layer 3 — ConnectedCapabilityInstance + catalogue separation (INV-13).
export * from './connected-instance.ts';

// Layer 4 — CapabilityObservation (freshness-stamped, versioned evidence).
export * from './observation.ts';

// ProviderStateEnvelope — lossless consequential provider-state preservation.
export * from './provider-state-envelope.ts';

// Execution modes — explicit, versioned vocabulary (INV-15).
export * from './execution-modes.ts';

// Certification — append-only ledger, statuses, evidence.
export * from './certification.ts';

// Hierarchical connector capability packs.
export * from './packs.ts';

// Corridor restrictions — the versioned projection inputs + narrowing law.
export * from './restrictions.ts';

// Corridor projection — types, evaluation engine, restriction evaluation,
// projection + leakage laws.
export * from './corridor-types.ts';
export * from './corridor-evaluation.ts';
export * from './corridor-restriction-eval.ts';
export * from './corridor.ts';

// Smart-contract extension declarations + risk profiles.
export * from './smart-contract.ts';

// Extension manifest contracts (typed token families).
export * from './extension.ts';

// The deterministic four-layer registry (+ completeness/corridor bridge).
export * from './registry.ts';
export * from './registry-support.ts';
