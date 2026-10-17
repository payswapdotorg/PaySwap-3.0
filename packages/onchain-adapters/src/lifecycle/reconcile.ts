/**
 * @payswap/onchain-adapters — the reconcile stage machinery (Work Order
 * P4-W3, lane R2-W3; PORT of payswap.org@8a735bf
 * packages/onchain-adapters/src/lifecycle.ts reconcile half).
 *
 * The deterministic reconciliation plan for an OUTCOME_UNKNOWN observation:
 * `blindRetryForbidden` is a LITERAL type — an unknown external write can
 * never be blindly retried and only settlement reconciliation resolves it.
 * The plan is INSTRUCTIONS (external checks on independent providers),
 * never resolution: the resolver is the settlement reconciliation
 * authority.
 */

import { ValidationError } from '../errors.ts';
import type { ReconciliationPlan } from '../contract/stage-io.ts';
import {
  validateOnchainExecutionObservation,
} from '../pins/onchain-domain/observation.ts';
import type { OnchainExecutionObservation } from '../pins/onchain-domain/observation.ts';

/**
 * Builds the deterministic reconciliation plan for an OUTCOME_UNKNOWN
 * observation. Any other outcome fails closed: a plan is only constructed
 * for genuine ambiguity.
 */
export function buildReconciliationPlan(input: {
  readonly adapterId: string;
  readonly chainKey: string;
  readonly observation: OnchainExecutionObservation;
  readonly transportProviderNames: readonly string[];
}): ReconciliationPlan {
  const observation = validateOnchainExecutionObservation(input.observation);
  if (observation.outcome !== 'OUTCOME_UNKNOWN') {
    throw new ValidationError(
      `a reconciliation plan is only constructed for OUTCOME_UNKNOWN observations (blind retry is structurally forbidden; reconciliation is the only resolver) — outcome '${observation.outcome}' is not ambiguity`,
    );
  }
  const providers = input.transportProviderNames;
  return Object.freeze({
    operationKind: 'ReconciliationPlan',
    executionRef: observation.executionRef,
    observationId: observation.observationId,
    reasons: Object.freeze([
      observation.unknownReason as string,
      `adapter '${input.adapterId}' on chain '${input.chainKey}' could not resolve the external outcome`,
    ]),
    externalChecks: Object.freeze([
      {
        check: `Re-observe the external operation ref '${observation.externalOperationRef ?? 'unknown'}' on at least two independent providers`,
        providerNames: Object.freeze([...providers]),
      },
      {
        check:
          'Compare the observed confirmation anchor (block/slot hash + height) against the chain at that height on an independent provider',
        providerNames: Object.freeze([...providers]),
      },
    ]),
    blindRetryForbidden: true,
    resolver: 'SETTLEMENT_RECONCILIATION_AUTHORITY',
  });
}
