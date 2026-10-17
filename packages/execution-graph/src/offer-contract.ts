/**
 * @payswap/execution-graph — ExecutionOffer contracts (P3-W2; ADAPT of
 * payswap.org@8a735bf packages/execution/src/offers.ts, W3-003).
 *
 * 3.0 ADAPTATION (recorded): the old PaymentMethodOffer was derived from
 * the @payswap/payment acceptance plane (PaymentAcceptancePolicy +
 * PaymentMethodTranslation, old W1-003). The payment plane in PaySwap 3.0 is
 * P5-W3 (future) — it does not exist at this base. The offer is therefore
 * re-grounded on the ACCEPTED 3.0 contracts:
 * - demand lineage: a CandidateSkeleton from @payswap/economic (P1-W1) —
 *   the offer realizes a compiled demand-shaped graph, carried by reference;
 * - acceptance axis: a versioned corridor-eligibility VIEW (the capability
 *   lane's corridor-aware eligibility discovery projection, P2-W1) — an
 *   offer exists only when the corridor projection says ELIGIBLE;
 * - capability axis: a genuinely ConnectedCapabilityInstance (INV-13:
 *   catalogue claims alone never authorize execution);
 * - observation axis: the LATEST CapabilityObservation, two-axis derived —
 *   UNKNOWN reachability is never success and yields NO offer (INV-04/07).
 *
 * LAW 1 on offers: the offer pins the observation version, the corridor
 * projection version and the quote (versioned economic input) it was
 * derived from — all preserved losslessly.
 */

import type {
  CapabilityObservation,
  ConnectedCapabilityInstance,
  ExecutionMode,
} from '@payswap/capability';
import type { Money, TimestampMs } from '@payswap/protocol';
import type { VersionedEconomicInput } from '@payswap/economic';
import type { ObservationVersionPin } from './observation-version-contract.ts';
import type { ExecutionOfferId } from './identifiers.ts';

/**
 * The versioned corridor-eligibility view backing an offer (the capability
 * lane's discovery projection, consumed by reference). A corridor is a
 * discovery projection, not a new authority (P2-W1 law) — and an INELIGIBLE
 * or UNKNOWN view never fabricates an offer.
 */
export interface CorridorEligibilityView {
  /** The corridor projection's format/version stamp (versioned contract). */
  readonly corridorProjectionVersion: string;
  /** ELIGIBLE / NOT_ELIGIBLE / UNKNOWN — never success on UNKNOWN. */
  readonly eligible: 'ELIGIBLE' | 'NOT_ELIGIBLE' | 'UNKNOWN';
  /** Why (typed reasons, surfaced verbatim from the projection). */
  readonly reasons: readonly string[];
}

/** A concrete execution offer derived from authoritative state. */
export interface ExecutionOffer {
  readonly offerId: ExecutionOfferId;
  /** Demand lineage: the candidate skeleton this offer realizes (P1-W1). */
  readonly skeletonRef: string;
  readonly intentRef: string;
  readonly goalRef: string;
  readonly currency: string;
  readonly amount: Money;
  readonly fees: Money;
  /** EXPLICIT on the offer (execution-mode vocabulary, INV-15 family). */
  readonly executionMode: ExecutionMode;
  /** The capability chain the offer's execution would traverse (ordered). */
  readonly railPath: readonly string[];
  /** The ConnectedCapabilityInstance the offer is derived from (INV-13). */
  readonly basedOnInstanceId: string;
  /** LAW 1: the authoritative observation version backing the offer. */
  readonly basedOnObservationVersion: number;
  /** LAW 1: the full pinned observation (lossless). */
  readonly pinnedObservation: ObservationVersionPin;
  /** LAW 1: the corridor-eligibility projection version the offer rests on. */
  readonly basedOnCorridorVersion: string;
  /** LAW 1: the versioned quote input the offer's economics rest on. */
  readonly basedOnQuote: VersionedEconomicInput;
  /** Explicit external settlement destination (never PaySwap custody). */
  readonly settlementDestinationId: string;
  readonly expiresAt: TimestampMs;
  /** Customer actions required to execute (from the capability declarations). */
  readonly requiredCustomerActions: readonly string[];
}

/** Why an offer derivation refused (typed, never an exception). */
export type OfferDerivationRejectionReason =
  | 'ELIGIBILITY_REJECTED'
  | 'ELIGIBILITY_UNKNOWN'
  | 'SKELETON_LINEAGE_MISMATCH'
  | 'INSTANCE_NOT_AUTHORIZED'
  | 'INSTANCE_NOT_ELIGIBLE'
  | 'INSTANCE_MISSING_PERMISSIONS'
  | 'OBSERVATION_INSTANCE_MISMATCH'
  | 'CAPABILITY_AVAILABILITY_UNKNOWN'
  | 'CAPABILITY_UNAVAILABLE'
  | 'CAPABILITY_NOT_ELIGIBLE'
  | 'EMPTY_CAPABILITY_CHAIN'
  | 'MODE_NOT_SUPPORTED_BY_CAPABILITY';

/** An offer derivation: an offer, or a typed rejection with NO offer. */
export type OfferDerivation =
  | { readonly ok: true; readonly offer: ExecutionOffer }
  | {
      readonly ok: false;
      readonly reason: OfferDerivationRejectionReason;
      readonly message: string;
    };

/** Input accepted by `deriveExecutionOffer`. */
export interface DeriveExecutionOfferInput {
  readonly offerId: string;
  /** Demand lineage (candidate skeleton + intent + goal refs, economic lane). */
  readonly skeletonRef: string;
  readonly intentRef: string;
  readonly goalRef: string;
  /** The versioned corridor-eligibility view (capability lane projection). */
  readonly eligibilityView: CorridorEligibilityView;
  /** The genuinely connected instance backing the offer (INV-13). */
  readonly instance: ConnectedCapabilityInstance;
  /** The LATEST observation of that instance (two-axis, freshness-stamped). */
  readonly observation: CapabilityObservation;
  /**
   * The capability chain the offer's execution traverses (provider-neutral
   * capability ids, ordered; route compilation itself is P5-W1 — the offer
   * carries the chain as a pinned, versioned input, never re-derives it).
   */
  readonly selectedCapabilityChain: readonly string[];
  /** The execution modes the backing capability declares (consumed). */
  readonly declaredExecutionModes: readonly ExecutionMode[];
  /** Exact economics (positive Money; INV-02 exactness). */
  readonly amount: Money;
  readonly fees: Money;
  /** LAW 1: the versioned quote input backing the economics. */
  readonly quote: VersionedEconomicInput;
  readonly executionMode: ExecutionMode;
  readonly settlementDestinationId: string;
  readonly expiresAt: TimestampMs;
  readonly requiredCustomerActions: readonly string[];
}

/**
 * An ingested OFF-NETWORK execution record: an effect orchestrated by an
 * EXTERNAL party, ingested for completeness WITHOUT claiming PaySwap
 * execution. `attributedToPaySwap` is a structural literal false —
 * aggregation code cannot miscount it (INV-24: no fabricated effects).
 */
export interface OffNetworkExecutionRecord {
  readonly recordId: string;
  /** Off-network records are orchestrated by EXTERNAL_PARTY by construction. */
  readonly orchestratedBy: 'EXTERNAL_PARTY';
  readonly sourceKind: string;
  readonly externalRef: string;
  readonly amount: Money;
  readonly recordedAt: TimestampMs;
  /** Business-document references preserved (invoice/order/milestone...). */
  readonly businessDocumentRefs: readonly { readonly documentKind: string; readonly documentId: string }[];
}

/** The result of ingesting an off-network record (never PaySwap-executed). */
export interface IngestedOffNetworkRecord {
  readonly record: OffNetworkExecutionRecord;
  /** Structural literal: an off-network record is never PaySwap-executed. */
  readonly attributedToPaySwap: false;
}
