/**
 * The executable capability declaration — the fourteen-part CONTRACT TYPES
 * (P2-W1; NET-NEW — the CAPABILITY-MODEL law text).
 *
 * spec/architecture/CAPABILITY-MODEL.md: "Every executable capability must
 * declare semantics, state machine, preconditions, authorization,
 * financial-effect class, idempotency/retry behavior, compensation/
 * cancellation, partial execution, user actions, provider-state mapping,
 * external IDs/revisions, evidence requirements, economic terms and
 * jurisdiction/eligibility constraints."
 *
 * This module owns the TYPES + vocabularies; the fail-closed VALIDATION
 * lives in executable-declaration-validation.ts. An executable
 * CapabilityDefinition CANNOT be constructed without all fourteen parts.
 *
 * The declaration is a CONTRACT DESCRIPTION, not authority: it tells the
 * protocol/trust lanes what discipline execution requires; it never grants
 * execution. Provider-native baseline (INV-15): declaring only
 * PASS_THROUGH_NATIVE is fully supported — the declaration vocabulary has
 * no member that structurally disadvantages the native path.
 */

import type { ExecutionMode } from './execution-modes.ts';
import type { ProviderStateFamily } from './provider-state-envelope.ts';
import type { CorridorRestrictionSet } from './restrictions.ts';

/** Vocabulary of the declaration contract itself (versioned contract law). */
export const EXECUTABLE_DECLARATION_CONTRACT_VERSION = '1.0.0' as const;

/** 1. Semantics: what executing this capability MEANS (plain contract text). */
export interface CapabilitySemantics {
  readonly summary: string;
  /** Effect semantics in provider-neutral terms (never provider SDK types). */
  readonly effectDescription: string;
}

/**
 * 2. State machine: the capability's own DECLARED machine (deterministic
 * state table). Terminality law: no transition leaves a terminal state —
 * provider-side non-monotonicity must be recorded as new evidence, never by
 * rewriting the declared machine.
 */
export interface DeclaredState {
  readonly name: string;
  readonly isTerminal: boolean;
}

export interface DeclaredTransition {
  readonly from: string;
  readonly to: string;
  readonly trigger: string;
}

export interface CapabilityStateMachine {
  readonly initial: string;
  readonly states: readonly DeclaredState[];
  readonly transitions: readonly DeclaredTransition[];
}

/** 3. Preconditions: what must hold BEFORE execution starts. */
export interface CapabilityPrecondition {
  readonly preconditionId: string;
  readonly description: string;
  /** Who confirms the precondition at execution time. */
  readonly confirmedBy: 'PROVIDER' | 'PAYSWAP_RUNTIME' | 'CUSTOMER';
}

/**
 * 4. Authorization requirements: what delegated power execution needs. The
 * capability fabric owns the REQUIREMENT DECLARATION only — verification is
 * the trust lane's authority (opaque refs, never interpreted here).
 */
export interface AuthorizationRequirement {
  /** Opaque scope string(s) the runtime must hold (e.g. 'payments:write'). */
  readonly requiredScopes: readonly string[];
  /** True when a human approval artifact is required before the effect. */
  readonly requiresHumanApproval: boolean;
  /** Opaque trust-plane reference describing the mandate kind required. */
  readonly mandateKindRef?: string;
}

/**
 * 5. Financial-effect class: how the Financial Protocol Authority must
 * treat an execution of this capability. NO_EFFECT and OBSERVATION_ONLY
 * never touch protocol settlement; PENDING queues work behind protocol
 * authorization; CONSEQUENTIAL may cause an external financial effect and
 * therefore REQUIRES protocol authorization + evidence + idempotency
 * discipline before any external command.
 */
export const FINANCIAL_EFFECT_CLASSES = [
  'NO_EFFECT',
  'OBSERVATION_ONLY',
  'PENDING_EXTERNAL_COMMAND',
  'CONSEQUENTIAL_EXTERNAL_EFFECT',
] as const;
export type FinancialEffectClass = (typeof FINANCIAL_EFFECT_CLASSES)[number];

export function isFinancialEffectClass(value: unknown): value is FinancialEffectClass {
  return (
    typeof value === 'string' &&
    (FINANCIAL_EFFECT_CLASSES as readonly unknown[]).includes(value)
  );
}

/**
 * 6. Idempotency/retry behavior. Key scope is ENDPOINT_SPECIFIC by default
 * (Wise §4.4: implement idempotency according to each provider operation's
 * actual contract — never assume a universal scope). After an ambiguous
 * outcome, retry of a consequential command is forbidden until
 * reconciliation: `NEVER_RETRY_AFTER_AMBIGUITY`.
 */
export const IDEMPOTENCY_KEY_SCOPES = [
  'ENDPOINT_SPECIFIC',
  'OPERATION_WIDE',
  'PROVIDER_DEFINED',
] as const;
export type IdempotencyKeyScope = (typeof IDEMPOTENCY_KEY_SCOPES)[number];

export interface IdempotencyBehavior {
  readonly keyScope: IdempotencyKeyScope;
  /** True when the provider contract documents a key field/header per call. */
  readonly carriesProviderKey: boolean;
  readonly retryPolicy: 'NEVER_RETRY_AFTER_AMBIGUITY' | 'PROVIDER_DEFINED';
  /** True when ambiguity MUST be resolved by canonical provider retrieval. */
  readonly reconciliationRequired: boolean;
}

/**
 * 7. Compensation/cancellation: whether and how an executed effect can be
 * undone or stopped. `lateReturnWindow` is a declared data window — late
 * returns stay representable after a payout was reported sent.
 */
export interface CompensationPolicy {
  readonly cancellable: boolean;
  readonly refundable: boolean;
  readonly compensationMechanism: string;
  readonly lateReturnRepresentable: boolean;
}

/** 8. Partial execution: can the effect partially complete? */
export interface PartialExecutionPolicy {
  readonly supported: boolean;
  readonly semantics: string;
}

/** 9. User actions: actions a human may/must perform during execution. */
export interface UserActionDeclaration {
  readonly actionKind: string;
  readonly description: string;
  readonly required: boolean;
}

/**
 * 10. Provider-state mapping: which consequential provider-state families
 * this capability's executions produce, and that they are preserved in a
 * ProviderStateEnvelope (INV-14) — never lossy-mapped.
 */
export interface ProviderStateMappingDeclaration {
  readonly preservedInEnvelope: true;
  readonly consequentialFamilies: readonly ProviderStateFamily[];
}

/**
 * 11. External IDs/revisions: how provider-side identifiers and revisions
 * are tracked for reconciliation and audit.
 */
export interface ExternalReferencePolicy {
  readonly carriesExternalIds: boolean;
  readonly revisionTracking: 'PROVIDER_REVISIONS' | 'NONE';
  /** True when every execution must carry a correlation id for audit. */
  readonly correlationIdRequired: boolean;
}

/** 12. Evidence requirements: what evidence executions must produce. */
export const CAPABILITY_EVIDENCE_KINDS = [
  'FUNDING',
  'CONVERSION',
  'PAYOUT',
  'OBSERVATION',
  'FINALITY',
  'RECONCILIATION',
  'AUTHORIZATION',
  'PROVIDER_EVENT',
] as const;
export type CapabilityEvidenceKind = (typeof CAPABILITY_EVIDENCE_KINDS)[number];

export interface EvidenceRequirement {
  readonly evidenceKind: CapabilityEvidenceKind;
  readonly required: boolean;
}

/**
 * 13. Economic terms: versioned reference to the terms under which the
 * capability is offered (the terms CONTRACT belongs to the economic/
 * protocol + Surface lanes; the declaration pins that terms exist, are
 * versioned and are cited — never floating pricing).
 */
export interface EconomicTermsDeclaration {
  readonly termsRef: string;
  readonly termsVersion: string;
  readonly pricingModel: string;
}

/**
 * 14. Jurisdiction/eligibility constraints: either an embedded, versioned
 * CorridorRestrictionSet (evaluated by the corridor projection) or an
 * explicit NONE with justification. Silent absence is impossible.
 */
export type JurisdictionEligibilityDeclaration =
  | { readonly declaredVia: 'RESTRICTION_SET'; readonly restrictionSet: CorridorRestrictionSet }
  | { readonly declaredVia: 'NONE'; readonly justification: string };

/** The fourteen-part declaration (see module docs for each part). */
export interface ExecutableCapabilityDeclaration {
  readonly contractVersion: typeof EXECUTABLE_DECLARATION_CONTRACT_VERSION;
  readonly semantics: CapabilitySemantics;
  readonly stateMachine: CapabilityStateMachine;
  readonly preconditions: readonly CapabilityPrecondition[];
  readonly authorizationRequirements: AuthorizationRequirement;
  readonly financialEffectClass: FinancialEffectClass;
  readonly idempotency: IdempotencyBehavior;
  readonly compensation: CompensationPolicy;
  readonly partialExecution: PartialExecutionPolicy;
  readonly userActions: readonly UserActionDeclaration[];
  readonly providerStateMapping: ProviderStateMappingDeclaration;
  readonly externalReferences: ExternalReferencePolicy;
  readonly evidenceRequirements: readonly EvidenceRequirement[];
  readonly economicTerms: EconomicTermsDeclaration;
  readonly jurisdictionEligibility: JurisdictionEligibilityDeclaration;
  /** Declared execution modes — mandatory, never inferred (CAPABILITY-MODEL). */
  readonly executionModes: readonly ExecutionMode[];
}