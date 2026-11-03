/**
 * @payswap/provider-runtime — the Stripe GLOBAL PAYOUTS plan executor (P27-B):
 * the approval and idempotency gates plus the typed result mapping for every
 * product-slice dispatch (wired into the journey's executePlan; the contracts
 * live in payouts-journey-contracts.ts).
 *
 * THE LAWS THIS EXECUTOR ENFORCES (in order, BEFORE any wire is touched):
 * 1. THE NEVER-ALIAS GATE (ADR-0020 D4): an operation from another Stripe
 *    product is refused typed, pre-dispatch — even inside a hand-crafted plan.
 * 2. THE APPROVAL LAW: a STRONG_CONFIRM plan demands the approval marker; a
 *    REAUTH plan demands the host re-authentication proof reference
 *    (ADR-0018); the slice NEVER self-approves (never a parallel kernel).
 * 3. THE IDEMPOTENCY LAW: a v1 state-changing plan demands the registrar-
 *    scoped idempotency key.
 * 4. INV-04: the transport's UNKNOWN result maps to UNKNOWN_AFTER_DISPATCH
 *    with the reconcile read-back named — never a blind retry.
 */

import type { StripeOperationDispatchResult } from '../transport/catalogue-transport.ts';
import type { StripeCallContext } from '../transport/call-context.ts';
import { isForbiddenGlobalPayoutsAliasOperation } from './payouts-product.ts';
import type {
  StripeGlobalPayoutsDispatchPlan,
  StripeGlobalPayoutsJourneyDeps,
  StripeGlobalPayoutsJourneyExecutionResult,
  StripeGlobalPayoutsPlanApproval,
} from './payouts-journey-contracts.ts';

/** Execute one product plan through the approval + idempotency + alias gates. */
export async function executeStripeGlobalPayoutsPlan(
  deps: StripeGlobalPayoutsJourneyDeps,
  dispatchPlan: StripeGlobalPayoutsDispatchPlan,
  context: StripeCallContext,
  approval?: StripeGlobalPayoutsPlanApproval,
): Promise<StripeGlobalPayoutsJourneyExecutionResult> {
  // 1. THE NEVER-ALIAS GATE (ADR-0020 D4) — machine-enforced at the executor edge.
  if (isForbiddenGlobalPayoutsAliasOperation(dispatchPlan.operationId)) {
    return Object.freeze({
      kind: 'REFUSED_PRE_DISPATCH' as const,
      plan: dispatchPlan,
      reason: 'ALIAS_OPERATION_FORBIDDEN' as const,
      detail: `operation '${dispatchPlan.operationId}' belongs to another Stripe product (ADR-0020 D4)`,
    });
  }
  // 2. THE APPROVAL LAW — the slice demands the marker/proof, it never mints one.
  if (dispatchPlan.approvalRequirement === 'STRONG_CONFIRM' && approval?.strongConfirmationApproved !== true) {
    return Object.freeze({
      kind: 'REFUSED_PRE_DISPATCH' as const,
      plan: dispatchPlan,
      reason: 'APPROVAL_STRONG_CONFIRM_REQUIRED' as const,
      detail:
        'a Global-Payouts money-movement plan requires the STRONG_CONFIRM approval marker — the slice never self-approves',
    });
  }
  if (
    dispatchPlan.approvalRequirement === 'REAUTH' &&
    (typeof approval?.reauthenticationProofRef !== 'string' || approval.reauthenticationProofRef.length === 0)
  ) {
    return Object.freeze({
      kind: 'REFUSED_PRE_DISPATCH' as const,
      plan: dispatchPlan,
      reason: 'REAUTH_PROOF_REQUIRED' as const,
      detail:
        'the hosted recipient form dispatches at the REAUTH tier — the host-minted fresh-credential proof reference (ADR-0018) is required',
    });
  }
  // 3. THE IDEMPOTENCY LAW — a v1 state-changing plan without its key is refused.
  if (dispatchPlan.idempotencyKeyRequired && typeof approval?.idempotencyKey !== 'string') {
    if (dispatchPlan.idempotencyKey === null) {
      return Object.freeze({
        kind: 'REFUSED_PRE_DISPATCH' as const,
        plan: dispatchPlan,
        reason: 'IDEMPOTENCY_KEY_REQUIRED' as const,
        detail: 'this v1 state-changing plan requires the registrar-scoped idempotency key (Stripe replays the stored response for a repeated key)',
      });
    }
  }
  const idempotencyKey = approval?.idempotencyKey ?? dispatchPlan.idempotencyKey ?? undefined;
  const result: StripeOperationDispatchResult = await deps.transport.dispatch({
    operationId: dispatchPlan.operationId,
    params: dispatchPlan.params as Record<string, unknown>,
    context,
    ...(idempotencyKey !== null && idempotencyKey !== undefined ? { idempotencyKey } : {}),
  });
  // 4. THE RESULT MAPPING — typed and total; UNKNOWN stays first-class (INV-04).
  switch (result.kind) {
    case 'OK':
      return Object.freeze({
        kind: 'EXECUTED' as const,
        plan: dispatchPlan,
        status: result.status,
        body: result.body,
        requestId: result.requestId,
        idempotencyKeyBound: result.idempotencyKeyBound,
      });
    case 'UNKNOWN':
      return Object.freeze({
        kind: 'UNKNOWN_AFTER_DISPATCH' as const,
        plan: dispatchPlan,
        ambiguity: result.ambiguity,
        note: result.note,
        reconcileOperationId: dispatchPlan.readBackOperationId,
        requestId: result.requestId,
      });
    case 'ERROR_STATUS':
      return Object.freeze({
        kind: 'PROVIDER_ERROR' as const,
        plan: dispatchPlan,
        error: result.error,
        body: result.body,
        requestId: result.requestId,
      });
    case 'REFUSED':
      return Object.freeze({
        kind: 'REFUSED_PRE_DISPATCH' as const,
        plan: dispatchPlan,
        reason: result.reason === 'IDEMPOTENCY_KEY_REQUIRED'
          ? ('IDEMPOTENCY_KEY_REQUIRED' as const)
          : ('TRANSPORT_REFUSED' as const),
        detail: `${result.reason}: ${result.detail}`,
      });
  }
}
