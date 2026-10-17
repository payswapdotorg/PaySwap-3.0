/**
 * @payswap/execution-graph — ExecutionPlan contracts (P3-W2; ADAPT of
 * payswap.org@8a735bf packages/execution/src/plans.ts, W3-003).
 *
 * A plan is the ordered set of connector capability steps chosen to realize
 * a compiled economic demand (CandidateSkeleton lineage, P1-W1). 3.0
 * adaptations (recorded):
 * - the merchant/payment-plane settlement destination (old
 *   MerchantSettlementDestination, @payswap/payment) is replaced by the
 *   EXTERNAL settlement destination shape (payment plane is P5-W3; the
 *   destination stays external and explicit — never PaySwap custody);
 * - the old mandatory `protocolAuthorization` (a protocol command link) is
 *   replaced by the authorization PROJECTION reference (LAW 2): the plan
 *   references a projection of protocol-owned authorization bound to
 *   material execution terms. This package NEVER authorizes — no execution
 *   mode, including PASS_THROUGH_NATIVE, bypasses the projection boundary
 *   (old INV-C07/F06 law preserved in projected form);
 * - every step pins the observation version it was decided on (LAW 1).
 */

import type {
  ConnectedCapabilityInstance,
  CompensationPolicy,
  ExecutionMode,
  PartialExecutionPolicy,
} from '@payswap/capability';
import type { TimestampMs } from '@payswap/protocol';
import type { ObservationVersionPin } from './observation-version-contract.ts';
import type { ExecutionPlanId } from './identifiers.ts';

/** One step of the execution graph (ordered, deterministic). */
export interface ExecutionPlanStep {
  readonly stepId: string;
  /** Strictly 1..n — execution order is total and deterministic. */
  readonly order: number;
  /** Human-readable role, e.g. `collect`, `fx-convert`, `payout`. */
  readonly role: string;
  /** The capability this step executes (provider-neutral id). */
  readonly capabilityId: string;
  /**
   * The genuinely connected instance executing it (INV-13: a provider
   * catalogue claim can never be a step).
   */
  readonly instance: ConnectedCapabilityInstance;
  /** LAW 1: the exact observation version this step was decided on. */
  readonly pinnedObservation: ObservationVersionPin;
  /** Opaque provider-neutral request payload (never typed with provider SDKs). */
  readonly providerRequest: unknown;
}

/**
 * Mode-specific detail. `kind` MUST equal the plan's `executionMode`
 * (validated), so a plan can never claim one mode while describing another.
 */
export type ExecutionModeDetail =
  | {
      /**
       * PASS_THROUGH_NATIVE preserves the incumbent provider's native
       * execution/optimization flow semantically (INV-15) while still
       * traversing the authorization-projection + evidence boundary.
       */
      readonly kind: 'PASS_THROUGH_NATIVE';
      readonly incumbentProviderName: string;
      readonly preservesNativeFlow: true;
    }
  | {
      readonly kind: 'COMPOSED_PAYSWAP';
      /** PaySwap capabilities composed with the provider steps. */
      readonly composedWith: readonly string[];
    }
  | {
      readonly kind: 'OPTIMIZED_MULTI_PROVIDER';
      /** Providers compared/orchestrated by the strategy. */
      readonly comparedProviders: readonly string[];
    };

/** A payment-to-document remittance reference preserved on the plan. */
export interface PlanRemittanceDocumentRef {
  readonly documentKind: string;
  readonly documentId: string;
}

/**
 * The EXPLICIT external settlement destination (never PaySwap custody):
 * where the executed value must arrive. The payment plane (P5-W3) owns the
 * rich destination types; this pin is deliberately minimal and external.
 */
export interface ExternalSettlementDestination {
  readonly destinationId: string;
  readonly kind: string;
  readonly currency: string;
  /** Reference to the external destination (opaque, never custody). */
  readonly externalRef: string;
}

/**
 * The authorization PROJECTION reference a plan carries (LAW 2). The
 * projection itself is owned by the projection index; the plan carries the
 * binding (id + material-terms digest + validity window) so staleness and
 * invalidation are detectable deterministically. A plan NEVER establishes
 * authorization by itself.
 */
export interface PlanAuthorizationProjectionRef {
  readonly projectionId: string;
  /** Canonical digest of the projected material terms at plan time. */
  readonly termsDigest: string;
  readonly projectedAt: TimestampMs;
  readonly validUntil: TimestampMs;
}

/** The canonical execution plan. */
export interface ExecutionPlan {
  readonly planId: ExecutionPlanId;
  /** Economic lineage (P1-W1): goal -> intent -> candidate skeleton. */
  readonly goalRef: string;
  readonly intentRef: string;
  readonly skeletonRef: string;
  /** EXPLICIT on every plan (execution-mode vocabulary, INV-15 family). */
  readonly executionMode: ExecutionMode;
  readonly modeDetail: ExecutionModeDetail;
  readonly steps: readonly ExecutionPlanStep[];
  /** EXPLICIT external settlement destination (never PaySwap custody). */
  readonly settlementDestination: ExternalSettlementDestination;
  readonly remittance: readonly PlanRemittanceDocumentRef[];
  /**
   * The authorization projection backing the whole plan — required on EVERY
   * plan, PASS_THROUGH_NATIVE included (no mode bypasses the boundary).
   */
  readonly authorizationProjection: PlanAuthorizationProjectionRef;
  /**
   * The strategy directive this plan realizes (ADVISORY lineage only — the
   * directive explains WHY the plan is shaped this way; it is never
   * authority). Optional: an operator-supplied plan may carry none.
   */
  readonly strategyDirectiveRef?: string;
}

/** Input accepted by `defineExecutionPlan`. */
export interface ExecutionPlanInput {
  readonly planId: string;
  readonly goalRef: string;
  readonly intentRef: string;
  readonly skeletonRef: string;
  readonly executionMode: ExecutionMode;
  readonly modeDetail: ExecutionModeDetail;
  readonly steps: readonly ExecutionPlanStep[];
  readonly settlementDestination: ExternalSettlementDestination;
  readonly remittance?: readonly PlanRemittanceDocumentRef[];
  readonly authorizationProjection: PlanAuthorizationProjectionRef;
  readonly strategyDirectiveRef?: string;
}

/** Derived, deterministic compensation profile of a plan. */
export type PlanCompensationProfile =
  | {
      readonly compensable: true;
      readonly stepsRequiringMechanism: readonly string[];
    }
  | {
      readonly compensable: false;
      readonly reason: 'NON_COMPENSABLE_STEP';
      readonly blockingStepIds: readonly string[];
    };

/**
 * Derived, conservative partial-execution profile: partial execution is
 * POSSIBLE only when every step's declaration supports it (a single
 * non-partial step makes the plan atomic — the conservative reading).
 */
export interface PlanPartialExecutionProfile {
  readonly possible: boolean;
  readonly semantics: string;
}

/** A per-step compensation declaration view used by profile derivation. */
export interface StepCompensationView {
  readonly stepId: string;
  readonly compensation: CompensationPolicy;
  readonly partialExecution: PartialExecutionPolicy;
}
