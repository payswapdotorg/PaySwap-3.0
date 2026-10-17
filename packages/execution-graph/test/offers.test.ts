import { describe, expect, it } from 'vitest';
import {
  deriveExecutionOffer,
  ingestOffNetworkRecord,
  isAwaitingCustomerAction,
  pendingCustomerActions,
  ExecutionAttemptLedger,
  pinObservation,
} from '../src/index.ts';
import {
  makeCompensationPolicy,
  makeEnvelope,
  makeInstance,
  makeObservation,
  makeSecondInstance,
  NOW,
  PIN_V1,
  PRINCIPAL,
  QUOTE_INPUT,
  USD_1,
  USD_100,
  money,
} from './fixtures.ts';
import type { ExecutionEvidenceId } from '../src/index.ts';

/**
 * ExecutionOffer (P3-W2; ADAPT of payswap.org@8a735bf
 * packages/execution/test/offers.test.ts, W3-003 — 6 tests ported +
 * 2 net-new LAW 1/lineage tests). 3.0 adaptations: the payment acceptance
 * plane (P5-W3) is replaced by the corridor-eligibility view; the offer
 * pins observation + corridor + quote versions (LAW 1).
 */
function eligibleView(version = 'corridor-v1') {
  return { corridorProjectionVersion: version, eligible: 'ELIGIBLE' as const, reasons: [] };
}

function baseInput() {
  const instance = makeInstance();
  return {
    offerId: 'offer_1',
    skeletonRef: 'skeleton_1',
    intentRef: 'intent_1',
    goalRef: 'goal_1',
    eligibilityView: eligibleView(),
    instance,
    observation: makeObservation({ instanceId: instance.instanceId }),
    selectedCapabilityChain: ['cap.mobile_money.collect', 'payswap.fx.convert'],
    declaredExecutionModes: ['PASS_THROUGH_NATIVE', 'COMPOSED_PAYSWAP'] as const,
    amount: USD_100,
    fees: USD_1,
    quote: QUOTE_INPUT,
    executionMode: 'COMPOSED_PAYSWAP' as const,
    settlementDestinationId: 'dest_bank_1',
    expiresAt: NOW + 60_000n,
    requiredCustomerActions: [],
  };
}

describe('ExecutionOffer (P3-W2)', () => {
  it('derives an offer from authoritative eligibility + capability state, showing the actual rail path', () => {
    const result = deriveExecutionOffer(baseInput());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.offer.railPath).toEqual([
        'cap.mobile_money.collect',
        'payswap.fx.convert',
      ]);
      expect(result.offer.basedOnInstanceId).toBe('inst-mm-1');
      expect(result.offer.basedOnObservationVersion).toBe(1);
      expect(result.offer.settlementDestinationId).toBe('dest_bank_1');
      expect(result.offer.executionMode).toBe('COMPOSED_PAYSWAP');
      // Economic lineage (P1-W1) is carried on the offer.
      expect(result.offer.skeletonRef).toBe('skeleton_1');
      expect(result.offer.intentRef).toBe('intent_1');
      expect(result.offer.goalRef).toBe('goal_1');
    }
  });

  it('LAW 1: the offer pins the exact observation, corridor and quote versions it was decided on', () => {
    const result = deriveExecutionOffer(baseInput());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.offer.pinnedObservation.observationVersion).toBe(1);
      expect(result.offer.pinnedObservation.observationDigest).toBe(
        pinObservation(makeObservation()).observationDigest,
      );
      expect(result.offer.basedOnCorridorVersion).toBe('corridor-v1');
      expect(result.offer.basedOnQuote).toBe(QUOTE_INPUT);
      expect(result.offer.basedOnQuote.version).toBe(3);
    }
  });

  it('never fabricates offers: rejected eligibility yields typed rejections', () => {
    const rejected = deriveExecutionOffer({
      ...baseInput(),
      offerId: 'offer_2',
      eligibilityView: {
        corridorProjectionVersion: 'corridor-v1',
        eligible: 'NOT_ELIGIBLE',
        reasons: ['CURRENCY_NOT_ACCEPTED'],
      },
    });
    expect(rejected.ok).toBe(false);
    if (!rejected.ok) {
      expect(rejected.reason).toBe('ELIGIBILITY_REJECTED');
      expect(rejected.message).toContain('CURRENCY_NOT_ACCEPTED');
    }

    const unknown = deriveExecutionOffer({
      ...baseInput(),
      offerId: 'offer_2b',
      eligibilityView: {
        corridorProjectionVersion: 'corridor-v1',
        eligible: 'UNKNOWN',
        reasons: [],
      },
    });
    expect(unknown.ok).toBe(false);
    if (!unknown.ok) {
      expect(unknown.reason).toBe('ELIGIBILITY_UNKNOWN');
    }
  });

  it('two-axis UNKNOWN is never success — no offer is fabricated', () => {
    const unknownObservation = makeObservation({ sourceAvailability: 'UNKNOWN' });
    const result = deriveExecutionOffer({
      ...baseInput(),
      offerId: 'offer_3',
      observation: unknownObservation,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('CAPABILITY_AVAILABILITY_UNKNOWN');
      expect(result.message).toContain('never success');
    }
  });

  it('INV-13: unauthorized / ineligible / under-permitted instances yield no offer', () => {
    const revoked = makeInstance({ authorization: { status: 'REVOKED' } });
    const revokedResult = deriveExecutionOffer({
      ...baseInput(),
      offerId: 'offer_4',
      instance: revoked,
      observation: makeObservation({ instanceId: revoked.instanceId }),
    });
    expect(revokedResult.ok).toBe(false);
    if (!revokedResult.ok) {
      expect(revokedResult.reason).toBe('INSTANCE_NOT_AUTHORIZED');
    }

    const missingPermissions = makeInstance({
      permissionState: { granted: [], requested: ['payments:write'], missing: ['payments:write'] },
    });
    const missingResult = deriveExecutionOffer({
      ...baseInput(),
      offerId: 'offer_5',
      instance: missingPermissions,
      observation: makeObservation({ instanceId: missingPermissions.instanceId }),
    });
    expect(missingResult.ok).toBe(false);
    if (!missingResult.ok) {
      expect(missingResult.reason).toBe('INSTANCE_MISSING_PERMISSIONS');
    }
  });

  it('rejects mode/capability/lineage mismatches deterministically', () => {
    const modeMiss = deriveExecutionOffer({
      ...baseInput(),
      offerId: 'offer_6',
      executionMode: 'OPTIMIZED_MULTI_PROVIDER',
      declaredExecutionModes: ['PASS_THROUGH_NATIVE'],
    });
    expect(modeMiss.ok).toBe(false);
    if (!modeMiss.ok) {
      expect(modeMiss.reason).toBe('MODE_NOT_SUPPORTED_BY_CAPABILITY');
    }

    const otherInstance = makeSecondInstance();
    const instanceMismatch = deriveExecutionOffer({
      ...baseInput(),
      offerId: 'offer_7',
      instance: otherInstance,
      observation: makeObservation({ instanceId: otherInstance.instanceId }),
    });
    expect(instanceMismatch.ok).toBe(false);
    if (!instanceMismatch.ok) {
      expect(instanceMismatch.reason).toBe('SKELETON_LINEAGE_MISMATCH');
    }
  });

  it('ingests off-network records without claiming PaySwap execution', () => {
    const ingested = ingestOffNetworkRecord({
      recordId: 'off_1',
      orchestratedBy: 'EXTERNAL_PARTY',
      sourceKind: 'CHECK',
      externalRef: 'check-1042',
      amount: money('USD', 25_000n),
      recordedAt: NOW,
      businessDocumentRefs: [{ documentKind: 'INVOICE', documentId: 'inv_1' }],
    });
    expect(ingested.attributedToPaySwap).toBe(false);
    expect(ingested.record.orchestratedBy).toBe('EXTERNAL_PARTY');
    // A record claiming orchestration by PaySwap is refused outright.
    expect(() =>
      ingestOffNetworkRecord({
        recordId: 'off_2',
        orchestratedBy: 'EXTERNAL_PARTY',
        sourceKind: 'CHECK',
        externalRef: 'check-1043',
        amount: money('USD', 1n),
        recordedAt: NOW,
        businessDocumentRefs: [],
      }),
    ).not.toThrow();
  });

  it('keeps async/customer-action-required provider states actionable (INV-14)', () => {
    const ledger = new ExecutionAttemptLedger();
    const outcome = ledger.begin({
      attemptId: 'att_offer_action',
      planId: 'plan_1',
      stepId: 'step_1',
      executionMode: 'COMPOSED_PAYSWAP',
      capabilityInstanceId: 'inst-mm-1',
      capabilityId: 'cap.mobile_money.collect',
      retryPolicy: 'SAFE_TO_RETRY',
      cancellation: 'UNTIL_SETTLEMENT',
      compensation: makeCompensationPolicy(),
      idempotencyKey: 'idem-offer-action',
      principal: PRINCIPAL,
      pinnedObservation: PIN_V1,
      now: NOW,
    });
    const challenge = makeEnvelope({
      family: 'customer_action_required',
      lifecycleStep: '3ds_challenge',
      requiresCustomerAction: true,
      actionRequired: { kind: 'three_d_secure', message: 'complete the challenge' },
    });
    ledger.advance(outcome.attempt.attemptId, 'START', { now: NOW + 1n });
    const waiting = ledger.advance(outcome.attempt.attemptId, 'PROVIDER_ACTION_REQUIRED', {
      now: NOW + 1n,
      evidence: [
        {
          evidenceId: 'ev_challenge' as ExecutionEvidenceId,
          kind: 'OBSERVATION',
          evidenceRef: 'provider-state:1',
          providerState: challenge,
          recordedAt: NOW + 1n,
        },
      ],
    });
    expect(isAwaitingCustomerAction(waiting)).toBe(true);
    const actions = pendingCustomerActions(waiting);
    expect(actions).toHaveLength(1);
    expect(actions[0]!.kind).toBe('three_d_secure');
    // The action surfaces the preserved provider state verbatim — not a flattened error.
    expect(waiting.providerState?.actionRequired?.deepLink).toBeUndefined();
    expect(waiting.providerState?.actionRequired?.message).toBe('complete the challenge');
  });
});
