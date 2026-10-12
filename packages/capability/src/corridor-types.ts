/**
 * Corridor projection — shared types and the exclusion vocabulary (P2-W1;
 * NET-NEW, Wise §4.1 discipline).
 *
 * A corridor is a DISCOVERY PROJECTION over versioned capabilities +
 * restrictions + fresh observations. It is NOT a new authority, NOT a
 * currency pair alone, and can NEVER make an unsupported route executable
 * (machine-checked: a CorridorView is structurally not an execution
 * request — see corridor.ts).
 *
 * The exclusion vocabulary below absorbs the old repository's Coverage Gap
 * cause taxonomy (REGULATORY / CAPABILITY / COMMERCIAL / CAPACITY /
 * RELIABILITY) plus the net-new FRESHNESS cause: every exclusion surfaces
 * WHY a route is out, at which LAYER (definition / implementation /
 * instance / observation / restriction), with a stable machine code.
 */

import type { EffectiveAvailability } from './availability.ts';
import type { ExecutionMode } from './execution-modes.ts';
import type { RequiredFieldDeclaration, CorridorTermsReference, CustomerType } from './restrictions.ts';
import type { AmountSpec } from '@payswap/trust';

/** Version of the corridor projection contract itself. */
export const CORRIDOR_PROJECTION_VERSION = '1.0.0' as const;

/** Cause classification (absorbs the old coverage-gap taxonomy). */
export const CORRIDOR_EXCLUSION_CAUSES = [
  'REGULATORY',
  'CAPABILITY',
  'COMMERCIAL',
  'CAPACITY',
  'RELIABILITY',
  'FRESHNESS',
] as const;
export type CorridorExclusionCause = (typeof CORRIDOR_EXCLUSION_CAUSES)[number];

/** The layer whose constraint produced the exclusion. */
export const CORRIDOR_EXCLUSION_LAYERS = [
  'DEFINITION',
  'IMPLEMENTATION',
  'INSTANCE',
  'OBSERVATION',
  'RESTRICTION',
] as const;
export type CorridorExclusionLayer = (typeof CORRIDOR_EXCLUSION_LAYERS)[number];

/** Stable machine codes for every exclusion the projection can surface. */
export const CORRIDOR_EXCLUSION_CODES = [
  'AUTHORIZATION_NOT_ACTIVE',
  'INSTANCE_INELIGIBLE',
  'MISSING_PERMISSIONS',
  'INSTANCE_GEOGRAPHY_NOT_SERVED',
  'INSTANCE_CURRENCY_NOT_SUPPORTED',
  'IMPLEMENTATION_SCOPE_NOT_SERVED',
  'AVAILABILITY_UNAVAILABLE',
  'AVAILABILITY_UNKNOWN',
  'OBSERVATION_NOT_ELIGIBLE',
  'OBSERVATION_ELIGIBILITY_UNKNOWN',
  'STALE_OBSERVATION',
  'QUOTA_EXHAUSTED',
  'SOURCE_COUNTRY_NOT_SERVED',
  'DESTINATION_COUNTRY_NOT_SERVED',
  'SOURCE_CURRENCY_NOT_SUPPORTED',
  'DESTINATION_CURRENCY_NOT_SUPPORTED',
  'CUSTOMER_TYPE_NOT_SERVED',
  'AMOUNT_BELOW_MINIMUM',
  'AMOUNT_ABOVE_MAXIMUM',
  'AMOUNT_CURRENCY_MISMATCH',
  'FUNDING_METHOD_NOT_SERVED',
  'PAYOUT_METHOD_NOT_SERVED',
  'RECIPIENT_TYPE_NOT_SERVED',
  'MISSING_REQUIRED_FIELDS',
  'CUTOFF_PASSED',
  'NOT_EXECUTABLE_CAPABILITY',
] as const;
export type CorridorExclusionCode = (typeof CORRIDOR_EXCLUSION_CODES)[number];

/** One surfaced exclusion reason: code + cause + layer + message + detail. */
export interface CorridorExclusion {
  readonly code: CorridorExclusionCode;
  readonly cause: CorridorExclusionCause;
  readonly layer: CorridorExclusionLayer;
  readonly message: string;
  readonly detail?: Readonly<Record<string, unknown>>;
}

/**
 * The corridor query (Wise §4.1 discipline): country/currency, customer
 * type, amount, recipient/funding/payout method, presented fields and the
 * evaluation time. `asOf` is DATA (strict ISO-8601 UTC) — the projection
 * never reads a clock, so evaluation is deterministic and replayable.
 */
export interface CorridorQuery {
  readonly sourceCountry: string;
  readonly destinationCountry: string;
  readonly sourceCurrency: string;
  readonly destinationCurrency: string;
  readonly customerType: CustomerType;
  readonly sendAmount: AmountSpec;
  readonly fundingMethod?: string;
  readonly payoutMethod?: string;
  readonly recipientType?: string;
  /** Field ids the caller can already present (required-field check). */
  readonly presentedFieldIds?: readonly string[];
  /** Evaluation time as data (strict ISO-8601 UTC). */
  readonly asOf: string;
}

/** Freshness policy for the projection (explicit, caller-supplied). */
export interface ObservationFreshnessPolicy {
  /** Observations older than this (seconds) are STALE and exclude the route. */
  readonly maxAgeSeconds: number;
}

/** Lineage of one evaluated route — the versions the projection derived from. */
export interface CorridorRouteLineage {
  readonly capabilityDefinitionId: string;
  readonly capabilityDefinitionVersion: string;
  readonly providerImplementationId: string;
  readonly implementationVersion: string;
  readonly connectedInstanceId: string;
  readonly providerName: string;
  readonly providerVersion: string;
  readonly observationVersion: number;
  readonly observedAt: string;
  readonly restrictionSetIds: readonly string[];
}

/** One route's deterministic evaluation result. */
export interface CorridorRouteEvaluation {
  /** Deterministic route reference (the connected instance id). */
  readonly routeId: string;
  readonly eligible: boolean;
  /** Empty iff eligible; otherwise EVERY surfaced reason (never just the first). */
  readonly exclusionReasons: readonly CorridorExclusion[];
  /** True when eligible but the underlying observation is DEGRADED. */
  readonly degraded: boolean;
  readonly effectiveAvailability: EffectiveAvailability;
  readonly lineage: CorridorRouteLineage;
  /** Modes the underlying executable capability declares (verbatim). */
  readonly offeredExecutionModes: readonly ExecutionMode[];
  /** Versioned pricing/delivery terms references (opaque). */
  readonly termsRefs: readonly CorridorTermsReference[];
  /** Fields this route requires before execution (union across restriction sets). */
  readonly requiredFields: readonly RequiredFieldDeclaration[];
  /**
   * Certification going-forward flag from the caller-supplied ledger state;
   * undefined when no certification data was supplied (certification is
   * evidence, never authorization — the flag never flips eligibility).
   */
  readonly certified: boolean | undefined;
}

/** The complete corridor view: the discovery projection's output. */
export interface CorridorView {
  readonly projectionVersion: typeof CORRIDOR_PROJECTION_VERSION;
  readonly query: CorridorQuery;
  readonly evaluatedAsOf: string;
  readonly freshnessPolicy: ObservationFreshnessPolicy;
  /** Every evaluated route, in deterministic input order. */
  readonly routes: readonly CorridorRouteEvaluation[];
  /** The eligible subset, same deterministic order. */
  readonly eligibleRoutes: readonly CorridorRouteEvaluation[];
}
