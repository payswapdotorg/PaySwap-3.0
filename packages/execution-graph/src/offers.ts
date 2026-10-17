/**
 * @payswap/execution-graph — ExecutionOffer derivation (P3-W2; ADAPT of
 * payswap.org@8a735bf packages/execution/src/offers.ts, W3-003).
 *
 * An offer is DERIVED, never fabricated: it exists only when every axis
 * holds — corridor eligibility (the capability lane's versioned discovery
 * projection), a genuinely ConnectedCapabilityInstance (INV-13), and the
 * LATEST observation establishing two-axis availability + eligibility
 * (UNKNOWN reachability is never success — it yields NO offer, with a typed
 * rejection reason).
 *
 * LAW 1 on offers: the derived offer pins the observation version, the
 * corridor projection version and the versioned quote input it rests on.
 */

import { ValidationError } from './errors.ts';
import { isExecutionMode } from './execution-modes.ts';
import { pinObservation, validateObservationShape } from './observation-versions.ts';
import type { ObservationVersionPin } from './observation-version-contract.ts';
import { asExecutionOfferId } from './identifiers.ts';
import type {
  CorridorEligibilityView,
  DeriveExecutionOfferInput,
  ExecutionOffer,
  IngestedOffNetworkRecord,
  OffNetworkExecutionRecord,
  OfferDerivation,
} from './offer-contract.ts';
import type { ExecutionAttempt } from './attempt-contract.ts';
import type { ProviderActionRequired, ProviderStateEnvelope } from '@payswap/capability';

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isMoney(value: unknown): value is { currency: string; value: bigint } {
  return (
    value !== null &&
    typeof value === 'object' &&
    typeof (value as { value?: unknown }).value === 'bigint' &&
    isNonEmptyString((value as { currency?: unknown }).currency)
  );
}

/** Fail-closed validation of a corridor-eligibility view (consumed shape). */
function validateEligibilityView(view: CorridorEligibilityView): void {
  if (view === null || typeof view !== 'object') {
    throw new ValidationError('eligibilityView must be a CorridorEligibilityView');
  }
  if (!isNonEmptyString(view.corridorProjectionVersion)) {
    throw new ValidationError('eligibilityView must carry a corridor projection version');
  }
  if (
    view.eligible !== 'ELIGIBLE' &&
    view.eligible !== 'NOT_ELIGIBLE' &&
    view.eligible !== 'UNKNOWN'
  ) {
    throw new ValidationError(
      'eligibilityView.eligible must be ELIGIBLE, NOT_ELIGIBLE or UNKNOWN',
    );
  }
  if (!Array.isArray(view.reasons)) {
    throw new ValidationError('eligibilityView.reasons must be an array');
  }
}

/**
 * Derive one execution offer from authoritative eligibility + capability
 * state. Every axis must hold; a single failed axis yields a typed
 * rejection and NO offer — offers are never fabricated, and unknown
 * reachability is never success.
 */
export function deriveExecutionOffer(input: DeriveExecutionOfferInput): OfferDerivation {
  if (input === null || typeof input !== 'object') {
    throw new ValidationError('offer derivation input must be an object');
  }
  if (!isNonEmptyString(input.offerId)) {
    throw new ValidationError('offerId must be a non-empty string');
  }
  for (const field of ['skeletonRef', 'intentRef', 'goalRef', 'settlementDestinationId'] as const) {
    if (!isNonEmptyString(input[field])) {
      throw new ValidationError(`${field} must be a non-empty reference`);
    }
  }
  if (!isMoney(input.amount) || !isMoney(input.fees)) {
    throw new ValidationError('offer amount and fees must be exact Money (INV-02)');
  }
  if (input.amount.value <= 0n || input.fees.value < 0n) {
    throw new ValidationError('offer amount must be positive; fees non-negative (INV-02)');
  }
  if (typeof input.expiresAt !== 'bigint' || input.expiresAt <= 0n) {
    throw new ValidationError('offer expiresAt must be a positive bigint TimestampMs');
  }
  if (!isExecutionMode(input.executionMode)) {
    throw new ValidationError('executionMode must be explicit on every offer');
  }
  validateEligibilityView(input.eligibilityView);
  validateObservationShape(input.observation);
  if (input.selectedCapabilityChain.length === 0) {
    return {
      ok: false,
      reason: 'EMPTY_CAPABILITY_CHAIN',
      message: 'the offer derivation requires a non-empty selected capability chain',
    };
  }

  // Axis 1: corridor eligibility is authoritative for what may be offered.
  if (input.eligibilityView.eligible === 'NOT_ELIGIBLE') {
    return {
      ok: false,
      reason: 'ELIGIBILITY_REJECTED',
      message: `the corridor projection '${input.eligibilityView.corridorProjectionVersion}' rejects the request: ${input.eligibilityView.reasons.join(', ')}`,
    };
  }
  if (input.eligibilityView.eligible === 'UNKNOWN') {
    return {
      ok: false,
      reason: 'ELIGIBILITY_UNKNOWN',
      message:
        'the corridor projection is UNKNOWN for this request: unknown eligibility is never success, and no offer is fabricated',
    };
  }

  // Axis 2: a genuinely connected instance (INV-13) — never a catalogue claim.
  const instance = input.instance;
  if (instance.authorization.status !== 'ACTIVE') {
    return {
      ok: false,
      reason: 'INSTANCE_NOT_AUTHORIZED',
      message: `instance '${instance.instanceId}' authorization is '${instance.authorization.status}'`,
    };
  }
  if (instance.eligibility.eligible !== true) {
    return {
      ok: false,
      reason: 'INSTANCE_NOT_ELIGIBLE',
      message: `instance '${instance.instanceId}' is not eligible`,
    };
  }
  if (instance.permissionState.missing.length > 0) {
    return {
      ok: false,
      reason: 'INSTANCE_MISSING_PERMISSIONS',
      message: `instance '${instance.instanceId}' is missing permissions [${instance.permissionState.missing.join(', ')}]`,
    };
  }

  // Axis 3: the CURRENT observation is authoritative for reachability.
  const observation = input.observation;
  if (observation.instanceId !== instance.instanceId) {
    return {
      ok: false,
      reason: 'OBSERVATION_INSTANCE_MISMATCH',
      message: `observation is for instance '${observation.instanceId}' but the offer is being derived for instance '${instance.instanceId}'`,
    };
  }
  if (observation.availability === 'UNKNOWN') {
    return {
      ok: false,
      reason: 'CAPABILITY_AVAILABILITY_UNKNOWN',
      message:
        'current reachability cannot be established — availability UNKNOWN is never success, and no offer is fabricated (INV-04/INV-07)',
    };
  }
  if (observation.availability === 'UNAVAILABLE') {
    return {
      ok: false,
      reason: 'CAPABILITY_UNAVAILABLE',
      message: `capability for instance '${instance.instanceId}' is currently unavailable`,
    };
  }
  if (observation.eligibility === 'NOT_ELIGIBLE') {
    return {
      ok: false,
      reason: 'CAPABILITY_NOT_ELIGIBLE',
      message: `observation for instance '${instance.instanceId}' reports NOT_ELIGIBLE`,
    };
  }

  // Axis 4: the backing capability must declare the offer's execution mode.
  if (!input.declaredExecutionModes.includes(input.executionMode)) {
    return {
      ok: false,
      reason: 'MODE_NOT_SUPPORTED_BY_CAPABILITY',
      message: `the backing capability does not declare support for execution mode '${input.executionMode}'`,
    };
  }
  if (!input.selectedCapabilityChain.includes(instance.capabilityId)) {
    return {
      ok: false,
      reason: 'SKELETON_LINEAGE_MISMATCH',
      message: `the selected capability chain does not contain the backing instance's capability '${instance.capabilityId}'`,
    };
  }

  // LAW 1: pin the exact observation version the offer was decided on.
  const pinnedObservation: ObservationVersionPin = pinObservation(observation);
  const offer: ExecutionOffer = Object.freeze({
    offerId: asExecutionOfferId(input.offerId),
    skeletonRef: input.skeletonRef,
    intentRef: input.intentRef,
    goalRef: input.goalRef,
    currency: input.amount.currency,
    amount: Object.freeze({ ...input.amount }),
    fees: Object.freeze({ ...input.fees }),
    executionMode: input.executionMode,
    railPath: Object.freeze([...input.selectedCapabilityChain]),
    basedOnInstanceId: instance.instanceId,
    basedOnObservationVersion: observation.observationVersion,
    pinnedObservation,
    basedOnCorridorVersion: input.eligibilityView.corridorProjectionVersion,
    basedOnQuote: input.quote,
    settlementDestinationId: input.settlementDestinationId,
    expiresAt: input.expiresAt,
    requiredCustomerActions: Object.freeze([...input.requiredCustomerActions]),
  });
  return { ok: true, offer };
}

/**
 * Ingest an external (off-network) execution record WITHOUT claiming PaySwap
 * execution. `attributedToPaySwap` is the structural literal false — the
 * ingestion result exposes that fact structurally so aggregation code
 * cannot miscount it (INV-24).
 */
export function ingestOffNetworkRecord(record: OffNetworkExecutionRecord): IngestedOffNetworkRecord {
  if (record === null || typeof record !== 'object') {
    throw new ValidationError('an OffNetworkExecutionRecord is required');
  }
  if (record.orchestratedBy !== 'EXTERNAL_PARTY') {
    throw new ValidationError(
      'off-network records are orchestrated by EXTERNAL_PARTY by construction',
    );
  }
  if (!isMoney(record.amount)) {
    throw new ValidationError('an off-network record must carry exact Money');
  }
  return Object.freeze({
    record: Object.freeze({ ...record }),
    attributedToPaySwap: false,
  });
}

/**
 * The provider-required customer/user actions an attempt is currently
 * waiting on, surfaced VERBATIM from the preserved ProviderStateEnvelope
 * (INV-14: customer-action-required states remain actionable; they are
 * never flattened into generic outcomes).
 */
export function pendingCustomerActions(
  attempt: ExecutionAttempt,
): readonly ProviderActionRequired[] {
  if (attempt === null || typeof attempt !== 'object') {
    throw new ValidationError('an ExecutionAttempt is required');
  }
  const actions: ProviderActionRequired[] = [];
  for (const evidence of attempt.evidence) {
    const envelope: ProviderStateEnvelope | undefined = evidence.providerState;
    if (envelope === undefined) {
      continue;
    }
    if (
      (envelope.classification.requiresCustomerAction ||
        envelope.classification.family === 'customer_action_required') &&
      envelope.actionRequired !== undefined
    ) {
      actions.push(envelope.actionRequired);
    }
  }
  return Object.freeze(actions);
}

/** True while an attempt is waiting on a customer/user action (actionable, not failed). */
export function isAwaitingCustomerAction(attempt: ExecutionAttempt): boolean {
  return attempt.state === 'AWAITING_CUSTOMER_ACTION';
}
